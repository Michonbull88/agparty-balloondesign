const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const multer = require('multer');
const sharp = require('sharp');
const nodemailer = require('nodemailer');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const S = require('./lib/security.cjs');
const Q = require('./lib/quotes.cjs');

function createApp(options = {}) {
  const app = express();
  const root = __dirname, dataDir = options.dataDir || path.join(root, '.local');
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  const keyPath = path.join(dataDir, 'master.key');
  if (!fs.existsSync(keyPath)) fs.writeFileSync(keyPath, crypto.randomBytes(32), { mode: 0o600 });
  const key = fs.readFileSync(keyPath);
  const db = new DatabaseSync(path.join(dataDir, 'ag-balloons.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'customer',verified INTEGER DEFAULT 0,created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS challenges(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),code TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS resets(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS throttle(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,price_cents INTEGER,pack_size TEXT NOT NULL,image TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,updated TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS quotes(id INTEGER PRIMARY KEY AUTOINCREMENT,number TEXT UNIQUE,customer_email TEXT NOT NULL,status TEXT NOT NULL,revision INTEGER NOT NULL,document TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS quote_revisions(quote_id INTEGER NOT NULL REFERENCES quotes(id),revision INTEGER NOT NULL,document TEXT NOT NULL,actor TEXT NOT NULL REFERENCES users(id),created TEXT NOT NULL,PRIMARY KEY(quote_id,revision));
    CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const now = () => new Date().toISOString();
  const adminExists = () => !!get("SELECT id FROM users WHERE role='admin'");
  const setupPath = path.join(dataDir, 'setup-code.txt');
  if (!adminExists() && !fs.existsSync(setupPath)) fs.writeFileSync(setupPath, S.token(), { mode: 0o600 });
  const mailPath = path.join(dataDir, 'mail.enc');
  let mailConfig = fs.existsSync(mailPath) ? S.decrypt(fs.readFileSync(mailPath, 'utf8'), key) : null;
  const envMail = process.env.SMTP_HOST && process.env.MAIL_FROM ? {
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, from: process.env.MAIL_FROM,
  } : null;
  const mailReady = () => !!(options.sendMail || mailConfig || envMail);
  function transport(config) {
    return nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure,
      requireTLS: !config.secure, auth: { user: config.user, pass: config.pass },
      connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 20000 });
  }
  async function sendMail(to, subject, text, replyTo) {
    if (options.sendMail) return options.sendMail({ to, subject, text, replyTo });
    const config = mailConfig || envMail;
    if (!config) throw Object.assign(new Error('Email delivery is not configured. Ask the administrator to complete setup.'), { status: 503 });
    try { await transport(config).sendMail({ from: config.from, to, subject, text, replyTo }); }
    catch { throw Object.assign(new Error('Email could not be sent. Check the email delivery settings and try again.'), { status: 503 }); }
  }
  const origin = options.origin || process.env.APP_ORIGIN || 'http://localhost:8000';
  const secure = options.secure ?? process.env.COOKIE_SECURE === '1';
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure, path: '/' };
  function cookie(req, name) {
    return String(req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) || '';
  }
  function throttle(keyText, limit, ms) {
    const id = S.hash(keyText), time = Date.now();
    const row = get('SELECT * FROM throttle WHERE key=?', id);
    if (row && row.expires > time && row.count >= limit) throw Object.assign(new Error('Too many attempts. Please try again later.'), { status: 429 });
    if (!row || row.expires <= time) run('INSERT OR REPLACE INTO throttle VALUES(?,?,?)', id, 1, time + ms);
    else run('UPDATE throttle SET count=count+1 WHERE key=?', id);
  }
  function current(req) {
    return get('SELECT u.id,u.email,u.name,u.role,u.verified FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?', S.hash(cookie(req, 'ag_session')), Date.now());
  }
  function requireUser(req, res, next) {
    req.user = current(req);
    if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
    next();
  }
  function requireAdmin(req, res, next) {
    requireUser(req, res, () => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Administrator access required.' }));
  }
  function loopback(req) { return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress); }
  function validPassword(value) {
    if (typeof value !== 'string' || value.length < 12 || value.length > 128) Q.fail('Use a password of 12 to 128 characters.');
    return value;
  }
  function expireOld() {
    for (const table of ['sessions', 'challenges', 'resets', 'throttle']) run(`DELETE FROM ${table} WHERE expires<?`, Date.now());
  }
  async function challenge(user, req, res) {
    throttle('mail:' + user.id, 6, 3600000);
    const token = S.token(), code = String(crypto.randomInt(100000, 1000000));
    await sendMail(user.email, 'Your AG Balloons sign-in code', `Your AG Balloons sign-in code is ${code}.\n\nIt expires in 10 minutes and can be used once. If you did not request this, do not share the code.`);
    run('DELETE FROM challenges WHERE user_id=?', user.id);
    run('INSERT INTO challenges(token,user_id,code,expires) VALUES(?,?,?,?)', S.hash(token), user.id, S.hash(token + code), Date.now() + 600000);
    res.cookie('ag_challenge', token, { ...cookieOptions, maxAge: 600000 });
    return res.json({ needsCode: true, message: 'A sign-in code has been sent to your email.' });
  }
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'blob:'],
    connectSrc: ["'self'", 'https://formsubmit.co'], formAction: ["'self'", 'https://formsubmit.co'],
    upgradeInsecureRequests: secure ? [] : null,
  } }, strictTransportSecurity: secure ? undefined : false }));
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (req.get('X-AG-Request') !== '1' || (req.get('Origin') && req.get('Origin') !== origin))) {
      return res.status(403).json({ error: 'This request must come from the website.' });
    }
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60000, limit: options.test ? 10000 : 150, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use(express.json({ limit: '256kb' }));
  app.post('/api/enquiries', async (req, res) => {
    throttle('enquiry:' + req.ip, 5, 3600000);
    const body = req.body || {};
    if (Q.text(body._honey)) return res.json({ ok: true });
    const name = Q.text(body.name, 100), phone = Q.text(body.phone, 30);
    const email = Q.email(body.email), date = Q.text(body.date, 10);
    const occasion = Q.text(body.occasion, 100), idea = Q.text(body.idea, 1500);
    if (!name || !phone || !occasion || idea.length < 10) Q.fail('Enter your name, contact number, occasion and a design idea of at least 10 characters.');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date());
    const eventDate = new Date(date + 'T12:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(eventDate.getTime()) || eventDate.toISOString().slice(0, 10) !== date || date < today) Q.fail('Choose an event date of today or later.');
    if (!mailReady()) return res.status(503).json({ error: 'Enquiry email is not set up yet. Please contact AG Balloons at anythingoessa@gmail.com.' });
    const fields = [['Name', name], ['Contact number', phone], ['Email', email], ['Event date', date], ['Occasion', occasion],
      ['Package', Q.text(body.package)], ['Partyware', Q.text(body.partyware)], ['Pinatas', Q.text(body.pinatas)],
      ['Partyware / pinata details', Q.text(body.party_details, 1000)], ['Venue / area', Q.text(body.venue, 150)],
      ['Colours', Q.text(body.colours, 100)], ['Budget', Q.text(body.budget)], ['Preferred contact', Q.text(body.contact)]];
    const brief = 'AG BALLOONS & DESIGN - NEW ENQUIRY\n\n' + fields.map(([label, value]) => `${label}: ${value || 'Not specified'}`).join('\n') + '\n\nDESIGN IDEA\n' + idea;
    await sendMail(options.adminEmail || 'anythingoessa@gmail.com', 'New AG Balloons design enquiry', brief, email);
    res.json({ ok: true, message: 'Your enquiry has been emailed to AG Balloons.' });
  });
  app.get('/api/auth/status', (req, res) => res.json({ user: current(req) || null, mailReady: mailReady(), setupRequired: !adminExists(), setupEmail: options.adminEmail || 'anythingoessa@gmail.com' }));
  app.post('/api/auth/setup', async (req, res) => {
    if (adminExists() || !loopback(req)) return res.status(403).json({ error: 'Initial setup is unavailable.' });
    throttle('setup:' + req.ip, 10, 900000);
    if (!fs.existsSync(setupPath) || !S.same(req.body.setupCode, fs.readFileSync(setupPath, 'utf8').trim())) return res.status(403).json({ error: 'Incorrect local setup code.' });
    const email = Q.email(req.body.email);
    if (email !== (options.adminEmail || 'anythingoessa@gmail.com')) Q.fail('Use the designated administrator email address.');
    const password = await S.passwordHash(validPassword(req.body.password));
    if (!mailReady()) {
      const config = { host: Q.text(req.body.smtpHost), port: Number(req.body.smtpPort || 465), secure: Number(req.body.smtpPort || 465) === 465,
        user: Q.text(req.body.smtpUser), pass: req.body.smtpPassword, from: Q.email(req.body.smtpFrom || email) };
      if (!config.host || !config.user || typeof config.pass !== 'string' || !config.pass || ![465, 587].includes(config.port)) Q.fail('Enter your SMTP host, account, password and port (465 or 587).');
      try { await transport(config).verify(); } catch { return res.status(400).json({ error: 'Could not connect to the email account. Check the SMTP settings and app password.' }); }
      fs.writeFileSync(mailPath, S.encrypt(config, key), { mode: 0o600 });
      mailConfig = config;
    }
    // Recheck after awaiting SMTP/password work to prevent two concurrent setup requests.
    if (adminExists()) return res.status(409).json({ error: 'Administrator setup was already completed.' });
    run('INSERT INTO users VALUES(?,?,?,?,?,?,?)', S.token(), email, Q.text(req.body.name) || 'AG Balloons Administrator', password, 'admin', 0, now());
    fs.unlinkSync(setupPath);
    res.json({ ok: true, message: 'Administrator created. Sign in to receive your email verification code.' });
  });
  app.post('/api/auth/register', async (req, res) => {
    if (!adminExists() || !mailReady()) return res.status(503).json({ error: 'Customer registration will be available once administrator setup and email delivery are complete.' });
    throttle('register:' + req.ip, 8, 3600000);
    const email = Q.email(req.body.email), name = Q.text(req.body.name);
    if (!name) Q.fail('Enter your full name.');
    const password = await S.passwordHash(validPassword(req.body.password));
    if (get('SELECT id FROM users WHERE email=?', email)) Q.fail('Unable to create this account. Try signing in or resetting your password.');
    const user = { id: S.token(), email };
    run('INSERT INTO users VALUES(?,?,?,?,?,?,?)', user.id, email, name, password, 'customer', 0, now());
    await challenge(user, req, res);
  });
  app.post('/api/auth/login', async (req, res) => {
    expireOld();
    const email = Q.email(req.body.email);
    throttle('login-ip:' + req.ip, 30, 900000);
    throttle('login-email:' + email, 10, 900000);
    const user = get('SELECT * FROM users WHERE email=?', email);
    const dummy = '00000000000000000000000000000000:' + '0'.repeat(128);
    const ok = await S.passwordMatches(String(req.body.password || '').slice(0, 128), user?.password || dummy);
    if (!user || !ok) return res.status(401).json({ error: 'Email or password is incorrect.' });
    await challenge(user, req, res);
  });
  app.post('/api/auth/verify', (req, res) => {
    throttle('code-ip:' + req.ip, 30, 900000);
    const raw = cookie(req, 'ag_challenge'), token = S.hash(raw);
    const row = get('SELECT * FROM challenges WHERE token=? AND expires>?', token, Date.now());
    if (!row || row.attempts >= 5) return res.status(401).json({ error: 'Code expired or too many attempts. Sign in again.' });
    run('UPDATE challenges SET attempts=attempts+1 WHERE token=?', token);
    if (!S.same(row.code, S.hash(raw + String(req.body.code || '')))) return res.status(401).json({ error: 'Incorrect verification code.' });
    run('DELETE FROM challenges WHERE token=?', token);
    run('UPDATE users SET verified=1 WHERE id=?', row.user_id);
    const session = S.token();
    run('DELETE FROM sessions WHERE token=?', S.hash(cookie(req, 'ag_session')));
    run('INSERT INTO sessions VALUES(?,?,?)', S.hash(session), row.user_id, Date.now() + 8 * 3600000);
    res.cookie('ag_session', session, { ...cookieOptions, maxAge: 8 * 3600000 });
    res.clearCookie('ag_challenge', cookieOptions);
    const user = get('SELECT id,email,name,role,verified FROM users WHERE id=?', row.user_id);
    res.json({ user });
  });
  app.post('/api/auth/logout', (req, res) => {
    run('DELETE FROM sessions WHERE token=?', S.hash(cookie(req, 'ag_session')));
    run('DELETE FROM challenges WHERE token=?', S.hash(cookie(req, 'ag_challenge')));
    res.clearCookie('ag_session', cookieOptions); res.clearCookie('ag_challenge', cookieOptions); res.json({ ok: true });
  });
  app.post('/api/auth/forgot', async (req, res) => {
    throttle('forgot:' + req.ip, 8, 3600000);
    const email = Q.email(req.body.email);
    throttle('forgot-email:' + email, 3, 3600000);
    if (!mailReady()) return res.status(503).json({ error: 'Email delivery is not configured.' });
    const user = get('SELECT id FROM users WHERE email=?', email);
    if (user) {
      const token = S.token();
      run('DELETE FROM resets WHERE user_id=?', user.id);
      run('INSERT INTO resets VALUES(?,?,?)', S.hash(token), user.id, Date.now() + 1800000);
      await sendMail(email, 'Reset your AG Balloons password', `To reset your password, open ${origin}/login.html#reset=${token}\n\nThis link expires in 30 minutes. If you did not request it, ignore this email.`);
    }
    res.json({ message: 'If an account exists, a password reset link has been emailed.' });
  });
  app.post('/api/auth/reset', async (req, res) => {
    throttle('reset:' + req.ip, 10, 900000);
    const row = get('SELECT * FROM resets WHERE token=? AND expires>?', S.hash(req.body.token), Date.now());
    if (!row) Q.fail('This password reset link has expired or was already used.');
    const password = await S.passwordHash(validPassword(req.body.password));
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!get('SELECT token FROM resets WHERE token=? AND expires>?', row.token, Date.now())) Q.fail('This reset link was already used.');
      run('UPDATE users SET password=? WHERE id=?', password, row.user_id);
      for (const table of ['sessions', 'resets', 'challenges']) run(`DELETE FROM ${table} WHERE user_id=?`, row.user_id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    res.json({ message: 'Password updated. Sign in with your new password and email code.' });
  });

  const productJSON = p => ({ ...p, active: !!p.active });
  app.get('/api/products', (req, res) => res.json(all('SELECT * FROM products WHERE active=1 ORDER BY category,name').map(productJSON)));
  app.get('/api/admin/products', requireAdmin, (req, res) => res.json(all('SELECT * FROM products ORDER BY category,name').map(productJSON)));
  app.post('/api/admin/products', requireAdmin, (req, res) => {
    const b = req.body, name = Q.text(b.name, 120), description = Q.text(b.description, 800), category = b.category;
    if (!name || !description || !['partyware', 'pinatas', 'balloons'].includes(category)) Q.fail('Enter a product name, description and valid category.');
    const price = Q.cents(b.price, true), image = String(b.image || '');
    if (!/^\/(?:assets\/[\w.-]+\.(?:webp|png)|uploads\/[a-f0-9]+\.webp)$/.test(image)) Q.fail('Upload an image or use an existing product image.');
    const onDisk = image.startsWith('/uploads/') ? path.join(dataDir, image.slice(1)) : path.join(root, 'dist', image.slice(1));
    if (!fs.existsSync(onDisk)) Q.fail('Product image could not be found.');
    const id = b.id ? Q.text(b.id, 80) : S.token();
    if (b.id && !get('SELECT id FROM products WHERE id=?', id)) return res.status(404).json({ error: 'Product not found.' });
    run(`INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,description=excluded.description,price_cents=excluded.price_cents,pack_size=excluded.pack_size,image=excluded.image,active=excluded.active,updated=excluded.updated`, id, name, category, description, price, Q.text(b.packSize, 100), image, b.active === false ? 0 : 1, now());
    res.json(productJSON(get('SELECT * FROM products WHERE id=?', id)));
  });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  app.post('/api/admin/images', requireAdmin, upload.single('image'), async (req, res) => {
    if (!req.file) Q.fail('Choose a JPEG, PNG or WebP image (up to 10 MB).');
    const image = sharp(req.file.buffer, { limitInputPixels: 40000000 });
    const meta = await image.metadata().catch(() => null);
    if (!meta || !['jpeg', 'png', 'webp'].includes(meta.format)) Q.fail('Only valid JPEG, PNG and WebP images are accepted.');
    const filename = S.token() + '.webp';
    await image.rotate().resize({ width: 1600, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toFile(path.join(dataDir, 'uploads', filename));
    res.json({ image: '/uploads/' + filename });
  });
  const quoteJSON = row => ({ id: row.id, number: row.number, revision: row.revision, created: row.created, updated: row.updated, ...JSON.parse(row.document) });
  app.get('/api/quotes', requireUser, (req, res) => {
    const rows = req.user.role === 'admin' ? all('SELECT * FROM quotes ORDER BY id DESC') : all("SELECT * FROM quotes WHERE customer_email=? AND status!='draft' ORDER BY id DESC", req.user.email);
    res.json(rows.map(quoteJSON));
  });
  app.get('/api/quotes/:id', requireUser, (req, res) => {
    const row = get('SELECT * FROM quotes WHERE id=?', Number(req.params.id));
    if (!row || (req.user.role !== 'admin' && (row.customer_email !== req.user.email || row.status === 'draft'))) return res.status(404).json({ error: 'Quote not found.' });
    res.json(quoteJSON(row));
  });
  app.get('/api/admin/quotes/:id/history', requireAdmin, (req, res) => res.json(all('SELECT revision,document,created FROM quote_revisions WHERE quote_id=? ORDER BY revision DESC', Number(req.params.id)).map(r => ({ ...r, document: JSON.parse(r.document) }))));
  app.post('/api/admin/quotes', requireAdmin, (req, res) => {
    const doc = Q.quoteInput(req.body), stamp = now(), document = JSON.stringify(doc);
    db.exec('BEGIN IMMEDIATE');
    try {
      let id, revision;
      if (req.body.id) {
        const row = get('SELECT * FROM quotes WHERE id=?', Number(req.body.id));
        if (!row) throw Object.assign(new Error('Quote not found.'), { status: 404 });
        if (row.revision !== Number(req.body.revision)) throw Object.assign(new Error('This quote was updated elsewhere. Reload before saving.'), { status: 409 });
        // Keep the customer association fixed so old revisions cannot expose another customer's data.
        if (row.customer_email !== doc.email) Q.fail('The customer email cannot change on an existing quote. Create a new quote for a different customer.');
        id = row.id; revision = row.revision + 1;
        run('UPDATE quotes SET status=?,revision=?,document=?,updated=? WHERE id=?', doc.status, revision, document, stamp, id);
      } else {
        const result = run('INSERT INTO quotes(customer_email,status,revision,document,created,updated,created_by) VALUES(?,?,?,?,?,?,?)', doc.email, doc.status, 1, document, stamp, stamp, req.user.id);
        id = Number(result.lastInsertRowid); revision = 1;
        run('UPDATE quotes SET number=? WHERE id=?', `AG-${stamp.slice(0,4)}-${String(id).padStart(5, '0')}`, id);
      }
      run('INSERT INTO quote_revisions VALUES(?,?,?,?,?)', id, revision, document, req.user.id, stamp);
      db.exec('COMMIT');
      res.json(quoteJSON(get('SELECT * FROM quotes WHERE id=?', id)));
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  });
  app.post('/api/admin/quotes/:id/email', requireAdmin, async (req, res) => {
    const row = get('SELECT * FROM quotes WHERE id=?', Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Quote not found.' });
    if (row.status === 'draft') Q.fail('Save the quote as sent before emailing it.');
    const q = quoteJSON(row), money = n => 'R' + (n / 100).toFixed(2);
    await sendMail(q.email, `Your AG Balloons quote ${q.number}`, `Hello ${q.customer},\n\n${q.number}\nValid until: ${q.validUntil}\n\n${q.items.map(i => `${i.description} — ${i.quantity} x ${money(i.unitCents)} = ${money(i.totalCents)}`).join('\n')}\n\nSubtotal: ${money(q.subtotalCents)}\nDiscount: ${money(q.discountCents)}\nTax: ${money(q.taxCents)}\nTotal: ${money(q.totalCents)}\n\n${q.notes}\n\nSign in to view your quote: ${origin}/login.html\n\nAG Balloons & Design`);
    res.json({ message: 'Quote emailed successfully.' });
  });
  app.get('/api/admin/health', requireAdmin, (req, res) => res.json({ mailReady: mailReady(), storage: 'SQLite', twoFactor: 'Email verification codes', customers: get("SELECT COUNT(*) AS n FROM users WHERE role='customer' AND verified=1").n }));

  if (!get("SELECT value FROM metadata WHERE key='seeded'")) {
    const seeds = [
      ['Paper Cups','partyware','Colourful paper cups for party drinks and a coordinated table setting.','party-cups'],
      ['Paper Plates','partyware','Party plates for birthday cake, snacks and celebration treats.','party-plates'],
      ['Serviettes','partyware','A finishing touch for place settings, snack tables and cake time.','party-serviettes'],
      ['Party Cutlery','partyware','Forks, knives and spoons to complete your party table.','party-cutlery'],
      ['Paper Straws','partyware','Playful paper straws for drinks and sweet displays.','party-straws'],
      ['Tablecloths','partyware','Bring your colour theme together across dining and gift tables.','party-tablecloths'],
      ['Party Piñatas','pinatas','A playful centrepiece for birthdays and themed celebrations.','party-pinata'],
    ];
    for (const [name, category, description, file] of seeds) run('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?)', file, name, category, description, null, '', '/assets/' + file + '.webp', 1, now());
    run("INSERT INTO metadata VALUES('seeded','1')");
  }
  app.use('/uploads', express.static(path.join(dataDir, 'uploads'), { dotfiles: 'deny', immutable: true, maxAge: '1y' }));
  app.use((req, res, next) => {
    let route;
    try { route = path.posix.normalize(decodeURIComponent(req.path).replace(/\\/g, '/')).toLowerCase(); } catch { return res.status(400).send('Invalid path.'); }
    if (['/admin.html', '/dashboard.html'].includes(route)) {
      res.setHeader('Cache-Control', 'no-store');
      const user = current(req);
      if (!user) return res.redirect('/login.html');
      if (route === '/admin.html' && user.role !== 'admin') return res.status(403).send('Administrator access required.');
    }
    next();
  });
  app.get('/dashboard.html', (req, res) => { res.setHeader('Cache-Control', 'no-store'); return current(req) ? res.sendFile(path.join(root, 'dist/dashboard.html')) : res.redirect('/login.html'); });
  app.get('/admin.html', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const user = current(req);
    if (!user) return res.redirect('/login.html');
    if (user.role !== 'admin') return res.status(403).send('Administrator access required.');
    res.sendFile(path.join(root, 'dist/admin.html'));
  });
  app.use(express.static(path.join(root, 'dist'), { dotfiles: 'deny', etag: true, maxAge: 0 }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || (error instanceof multer.MulterError ? 400 : 500);
    res.status(status).json({ error: status < 500 || status === 503 ? error.message : 'The request could not be completed. Please try again.' });
  });
  app.locals.db = db;
  app.locals.dataDir = dataDir;
  return app;
}
function start() {
  const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 8000);
  const origin = process.env.APP_ORIGIN || 'http://localhost:8000';
  if (!['127.0.0.1', '::1', 'localhost'].includes(host) && (process.env.COOKIE_SECURE !== '1' || !origin.startsWith('https://'))) throw new Error('External hosting requires HTTPS, APP_ORIGIN and COOKIE_SECURE=1.');
  const app = createApp();
  const server = app.listen(port, host, () => console.log(`AG Balloons is running at ${origin}. Complete initial administrator setup at /setup.html.`));
  server.requestTimeout = 30000;
  return server;
}
if (require.main === module) start();
module.exports = { createApp, start };
