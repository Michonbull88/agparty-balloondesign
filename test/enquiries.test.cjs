const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { createApp } = require('../server.cjs');

const enquiry = { name: 'Enquiry Customer', phone: '082 123 4567', email: 'customer@example.com', date: '2099-12-01', occasion: 'Birthday', idea: 'A pink balloon arch for a birthday.', partyware: 'Yes, please', party_details: '20 paper cups', venue: 'Johannesburg' };
async function fixture(options, run) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-enquiry-test-'));
  const app = createApp({ dataDir, test: true, adminEmail: 'admin@example.com', ...options });
  const post = body => request(app).post('/api/enquiries').set('X-AG-Request', '1').send(body);
  try { await run(post, app); }
  finally { app.locals.db.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
}
test('anonymous enquiry reaches the business with customer reply address and full details', async () => {
  const mailbox = [];
  await fixture({ sendMail: async mail => mailbox.push(mail) }, async post => {
    assert.equal((await post(enquiry).expect(200)).body.ok, true);
    assert.equal(mailbox.length, 1);
    assert.equal(mailbox[0].to, 'admin@example.com');
    assert.equal(mailbox[0].replyTo, enquiry.email);
    assert.match(mailbox[0].text, /20 paper cups/);
    assert.match(mailbox[0].text, /Johannesburg/);
    assert(mailbox[0].text.includes(enquiry.idea));
  });
});
test('invalid enquiries and spam traps do not send email', async () => {
  const mailbox = [];
  await fixture({ sendMail: async mail => mailbox.push(mail) }, async post => {
    await post({ ...enquiry, email: 'invalid' }).expect(400);
    await post({ ...enquiry, date: '2099-02-30' }).expect(400);
    await post({ ...enquiry, date: '2000-01-01' }).expect(400);
    await post({ ...enquiry, idea: '' }).expect(400);
    await post({ ...enquiry, _honey: 'spam' }).expect(200);
    assert.equal(mailbox.length, 0);
  });
});
test('enquiry requires a same-origin website request and limits email abuse', async () => {
  await fixture({ sendMail: async () => {} }, async (post, app) => {
    await request(app).post('/api/enquiries').send(enquiry).expect(403);
    await request(app).post('/api/enquiries').set('X-AG-Request', '1').set('Origin', 'https://example.com').send(enquiry).expect(403);
    for (let i = 0; i < 5; i++) await post(enquiry).expect(200);
    await post(enquiry).expect(429);
  });
});
test('mail delivery failure never reports a successful enquiry', async () => {
  await fixture({ sendMail: async () => { throw Object.assign(new Error('Email could not be sent. Please try again.'), { status: 503 }); } }, async post => {
    const result = await post(enquiry).expect(503);
    assert.equal(result.body.ok, undefined);
    assert.match(result.body.error, /could not be sent/);
  });
});
