'use strict';
window.AG = {
  escape: value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  money: cents => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format((cents || 0) / 100),
  date: value => new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeZone: 'Africa/Johannesburg' }).format(new Date(value)),
  async api(url, options = {}) {
    const multipart = options.body instanceof FormData;
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'X-AG-Request': '1', ...(multipart ? {} : {'Content-Type':'application/json'}), ...options.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'The request could not be completed.'), { status: response.status });
    return data;
  },
  post(url, data) { return this.api(url, { method: 'POST', body: JSON.stringify(data) }); },
  status(message = '', error = false) {
    const el = document.querySelector('#status');
    if (el) { el.textContent = message; el.className = 'status' + (error ? ' error' : ''); }
  },
  async signOut() { await this.post('/api/auth/logout', {}); location.href = '/login.html'; },
  async user(admin = false) {
    const { user } = await this.api('/api/auth/status');
    if (!user) { location.replace('/login.html'); return null; }
    if (admin && user.role !== 'admin') { location.replace('/dashboard.html'); return null; }
    document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = user.name);
    document.querySelectorAll('[data-user-email]').forEach(el => el.textContent = user.email);
    document.querySelectorAll('[data-admin-only]').forEach(el => el.hidden = user.role !== 'admin');
    document.querySelectorAll('[data-sign-out]').forEach(el => el.addEventListener('click', () => this.signOut().catch(e => this.status(e.message, true))));
    return user;
  },
  quoteHTML(q) {
    const e = this.escape, m = this.money;
    return `<article class="quote-paper"><header class="quote-brand"><div class="quote-business"><img src="/assets/ag-logo.webp" alt="AG Balloons and Design" width="120" height="120"><div class="quote-business-info"><h2>AG Balloons &amp; Design</h2><p>Custom balloon decor &amp; event styling</p><a href="mailto:anythingoessa@gmail.com">anythingoessa@gmail.com</a></div></div><div class="quote-title"><h1>Quotation</h1><div class="quote-meta">${e(q.number)} · Revision ${q.revision}</div></div></header><div class="quote-details"><div><p class="eyebrow">Prepared for</p><h2>${e(q.customer)}</h2><p>${e(q.email)}${q.phone ? '<br>' + e(q.phone) : ''}</p></div><div><p class="eyebrow">Quote details</p><p>Issued: ${this.date(q.created)}<br>Valid until: ${this.date(q.validUntil + 'T12:00:00Z')}<br>Status: ${e(q.status)}</p></div></div><div class="table-wrap"><table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${q.items.map(i => `<tr><td>${e(i.description)}</td><td>${i.quantity}</td><td>${m(i.unitCents)}</td><td>${m(i.totalCents)}</td></tr>`).join('')}</tbody></table></div><div class="totals"><div><span>Subtotal</span><strong>${m(q.subtotalCents)}</strong></div><div><span>Discount</span><strong>− ${m(q.discountCents)}</strong></div><div><span>Tax (${q.taxBasisPoints / 100}%)</span><strong>${m(q.taxCents)}</strong></div><div class="grand-total"><span>Total</span><strong>${m(q.totalCents)}</strong></div></div>${q.notes ? `<p class="quote-notes">${e(q.notes)}</p>` : ''}<p class="quote-footer">AG Balloons &amp; Design · anythingoessa@gmail.com<br>Thank you for letting us be part of your celebration.</p></article>`;
  }
};
