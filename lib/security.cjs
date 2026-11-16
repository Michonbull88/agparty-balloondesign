const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const token = () => crypto.randomBytes(32).toString('hex');
function same(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
async function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${key.toString('hex')}`;
}
async function passwordMatches(password, stored) {
  const [salt, expected] = stored.split(':');
  const key = await scrypt(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 });
  return same(key.toString('hex'), expected);
}
function encrypt(value, key) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
function decrypt(value, key) {
  const bytes = Buffer.from(value, 'base64');
  const cipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'));
}
module.exports = { hash, token, same, passwordHash, passwordMatches, encrypt, decrypt };
