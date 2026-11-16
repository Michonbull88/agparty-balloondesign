'use strict';
const view = document.querySelector('#view');
let user, products = [], quotes = [], currentQuote = null;
const e = AG.escape, m = AG.money;
const statusBadge = q => {
  const localDate = new Intl.DateTimeFormat('en-CA', {timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const status = q.status === 'sent' && q.validUntil < localDate ? 'expired' : q.status;
  return `<span class="badge ${e(status)}">${e(status)}</span>`;
};
const blankQuote = () => ({ customer:'',email:'',phone:'',validUntil:new Date(Date.now()+30*86400000).toISOString().slice(0,10),status:'draft',notes:'',items:[{description:'',quantity:1,unitCents:0}],discountCents:0,taxBasisPoints:0 });
function heading(title, subtitle, action = '') { return `<div class="page-heading"><div><p class="eyebrow">${user.role === 'admin' ? 'Business workspace' : 'Your celebrations'}</p><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`; }
function quoteTable(rows) {
  if (!rows.length) return '<div class="empty"><strong>No quotes to show yet.</strong>Your quotes will appear here once they are prepared.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Quote</th><th>Customer</th><th>Status</th><th>Total</th><th>Updated</th><th>Actions</th></tr></thead><tbody>${rows.map(q => `<tr><td><strong>${e(q.number)}</strong><small>Revision ${q.revision}</small></td><td>${e(q.customer)}<small>${e(q.email)}</small></td><td>${statusBadge(q)}</td><td><strong>${m(q.totalCents)}</strong></td><td>${AG.date(q.updated)}</td><td><a class="btn small" href="#quote/${q.id}">View</a>${user.role === 'admin' ? `<a class="btn small" href="#edit-quote/${q.id}">Edit</a>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
function metrics() {
  const accepted = quotes.filter(q => q.status === 'accepted');
  return `<div class="metrics"><div class="metric"><span>Total quotes</span><strong>${quotes.length}</strong></div><div class="metric"><span>Awaiting response</span><strong>${quotes.filter(q => q.status === 'sent').length}</strong></div><div class="metric"><span>Accepted value</span><strong>${m(accepted.reduce((n,q)=>n+q.totalCents,0))}</strong></div><div class="metric"><span>Published products</span><strong>${products.filter(p=>p.active).length}</strong></div></div>`;
}
function overview() {
  view.innerHTML = heading('A little business magic.', `Welcome back, ${e(user.name)}. Here’s your celebration business at a glance.`, '<a class="btn primary" href="#new-quote">+ Create quote</a>') + metrics() + `<section class="panel"><div class="panel-head"><h2>Recent quotes</h2><a href="#quotes">View all quotes →</a></div>${quoteTable(quotes.slice(0,6))}</section><section class="panel"><div class="panel-head"><h2>Make it yours.</h2><a class="btn" href="#products">Manage products</a></div><p class="muted">Update your partyware and piñata images, descriptions, pack sizes and prices. Published products appear on the main website.</p><p class="help">Prices remain “To be confirmed” until you set them. Quotes keep their original prices when catalogue pricing changes.</p></section>`;
}
function quoteList() {
  view.innerHTML = heading(user.role === 'admin' ? 'Every quote, in one place.' : 'Your quotes.', user.role === 'admin' ? 'Create, review and keep a complete record of your quotations.' : 'View the quotations prepared for your celebrations.', user.role === 'admin' ? '<a class="btn primary" href="#new-quote">+ Create quote</a>' : '') + `<section class="panel"><div class="filters"><input id="quote-search" type="search" aria-label="Search quotes" placeholder="Search quote number, customer or email"><select id="quote-status" aria-label="Filter quote status"><option value="">All statuses</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="accepted">Accepted</option><option value="declined">Declined</option></select></div><div id="quote-results">${quoteTable(quotes)}</div></section>`;
  function filter() {
    const search = document.querySelector('#quote-search').value.toLowerCase(), status = document.querySelector('#quote-status').value;
    document.querySelector('#quote-results').innerHTML = quoteTable(quotes.filter(q => (!status || q.status === status) && `${q.number} ${q.customer} ${q.email}`.toLowerCase().includes(search)));
  }
  document.querySelector('#quote-search').addEventListener('input', filter);
  document.querySelector('#quote-status').addEventListener('change', filter);
}
function productList() {
  view.innerHTML = heading('The party collection.', 'Manage the items, images and prices customers see on your website.', '<a class="btn primary" href="#new-product">+ Add product</a>') + `<section class="panel"><div class="filters"><input id="product-search" type="search" aria-label="Search products" placeholder="Search products"><select id="product-category" aria-label="Filter category"><option value="">All categories</option><option value="partyware">Partyware</option><option value="pinatas">Piñatas</option><option value="balloons">Balloons</option></select></div><div class="product-list" id="product-results"></div></section>`;
  function filter() {
    const search = document.querySelector('#product-search').value.toLowerCase(), category = document.querySelector('#product-category').value;
    const rows = products.filter(p => (!category || p.category === category) && `${p.name} ${p.description}`.toLowerCase().includes(search));
    document.querySelector('#product-results').innerHTML = rows.length ? rows.map(p => `<article class="product-tile ${p.active ? '' : 'archived'}"><img src="${e(p.image)}" alt="${e(p.name)}" loading="lazy"><div class="details"><span class="badge">${e(p.category === 'pinatas' ? 'Piñatas' : p.category)}</span> ${p.active ? '' : '<span class="badge">Archived</span>'}<h3>${e(p.name)}</h3><p>${e(p.description)}</p><strong>${p.price_cents == null ? 'To be confirmed' : m(p.price_cents)}</strong><p>${e(p.pack_size)}</p><div class="button-row"><a class="btn small" href="#edit-product/${e(p.id)}">Edit product</a></div></div></article>`).join('') : '<div class="empty">No products match your search.</div>';
  }
  document.querySelector('#product-search').addEventListener('input', filter);
  document.querySelector('#product-category').addEventListener('change', filter); filter();
}
function productEditor(product) {
  const p = product || {name:'',category:'partyware',description:'',price_cents:null,pack_size:'',image:'',active:true};
  view.innerHTML = heading(p.id ? 'Edit product.' : 'Something for the party.', 'Add a photo, description and price for your public catalogue.', '<a class="btn" href="#products">← Products</a>') + `<section class="panel"><form id="product-form"><div class="row"><label>Product name<input name="name" value="${e(p.name)}" maxlength="120" required></label><label>Category<select name="category">${[['partyware','Partyware'],['pinatas','Piñatas'],['balloons','Balloons']].map(([v,t])=>`<option value="${v}" ${v===p.category?'selected':''}>${t}</option>`).join('')}</select></label></div><label>Description<textarea name="description" rows="3" maxlength="800" required>${e(p.description)}</textarea></label><div class="row three"><label>Price (R)<input name="price" type="number" min="0" max="9999999" step="0.01" value="${p.price_cents == null ? '' : (p.price_cents/100).toFixed(2)}" placeholder="Leave blank if unconfirmed"></label><label>Pack size / unit<input name="packSize" value="${e(p.pack_size)}" maxlength="100" placeholder="e.g. pack of 10 / each"></label><label>Visibility<select name="active"><option value="true" ${p.active?'selected':''}>Published on website</option><option value="false" ${!p.active?'selected':''}>Archived / hidden</option></select></label></div><label>Product image<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" ${p.image?'':'required'}></label><p class="help">JPEG, PNG or WebP, up to 10 MB. Images are resized and optimised automatically.</p><img class="image-preview" id="image-preview" src="${e(p.image || '')}" alt="Product preview" ${p.image?'':'hidden'}><div class="button-row"><button class="btn primary" type="submit">Save product</button><a class="btn" href="#products">Cancel</a></div></form></section>`;
  const form = document.querySelector('#product-form'); let previewURL;
  form.elements.photo.addEventListener('change', () => {
    if (previewURL) URL.revokeObjectURL(previewURL);
    const file = form.elements.photo.files[0];
    if (file) { previewURL=URL.createObjectURL(file); const img=document.querySelector('#image-preview');img.src=previewURL;img.hidden=false; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button=form.querySelector('button');button.disabled=true;AG.status('Saving product…');
    try {
      let image=p.image;const file=form.elements.photo.files[0];
      if (file) { const body=new FormData();body.append('image',file);image=(await AG.api('/api/admin/images',{method:'POST',body})).image; }
      const values=Object.fromEntries(new FormData(form));delete values.photo;
      await AG.post('/api/admin/products',{...values,id:p.id,image,active:values.active==='true'});
      products=await AG.api('/api/admin/products');location.hash='products';AG.status('Product saved. The public catalogue has been updated.');
      if(previewURL)URL.revokeObjectURL(previewURL);
    } catch(error){AG.status(error.message,true);}finally{button.disabled=false;}
  });
}
function quoteEditor(quote) {
  const q=quote || blankQuote();currentQuote=q;
  view.innerHTML=heading(q.id ? `Edit ${e(q.number)}.` : 'Make their moment.', 'Build a clear quotation. Every saved revision stays in your history.', '<a class="btn" href="#quotes">← Quotes</a>') + `<section class="panel"><form id="quote-form"><div class="row"><label>Customer name<input name="customer" value="${e(q.customer)}" required maxlength="200"></label><label>Customer email<input name="email" type="email" value="${e(q.email)}" ${q.id?'readonly':''} required maxlength="254"></label></div><div class="row three"><label>Contact number<input name="phone" value="${e(q.phone)}" maxlength="40"></label><label>Valid until<input name="validUntil" type="date" value="${e(q.validUntil)}" required></label><label>Status<select name="status">${['draft','sent','accepted','declined'].map(s=>`<option value="${s}" ${s===q.status?'selected':''}>${s[0].toUpperCase()+s.slice(1)}</option>`).join('')}</select></label></div><p class="help">Drafts stay private. Saving as “Sent” makes the quote available to the verified customer account; use “Email quote” to send it by email.</p><div class="panel-head"><h2>Quote items</h2><select id="catalogue-add" aria-label="Add a product from the catalogue"><option value="">Add from catalogue…</option>${products.filter(p=>p.active).map(p=>`<option value="${e(p.id)}">${e(p.name)}${p.price_cents==null?' · price unconfirmed':''}</option>`).join('')}</select></div><div class="table-wrap"><table class="line-items"><thead><tr><th>Description</th><th>Quantity</th><th>Unit price (R)</th><th>Amount</th><th></th></tr></thead><tbody id="item-rows"></tbody></table></div><button class="text-button" type="button" id="add-item">+ Add custom item</button><div class="row"><label>Discount (R)<input name="discount" type="number" min="0" max="9999999" step="0.01" value="${(q.discountCents/100).toFixed(2)}"></label><label>Tax rate (%)<input name="taxRate" type="number" min="0" max="100" step="0.01" value="${q.taxBasisPoints/100}"></label></div><p class="help">Tax defaults to 0%. Only add VAT if it applies to your business.</p><div class="totals" id="live-totals"></div><label>Notes / terms<textarea name="notes" rows="4" maxlength="4000" placeholder="Event details, collection, payment terms and any other information">${e(q.notes)}</textarea></label><div class="button-row"><button class="btn primary" type="submit">Save quote</button><a class="btn" href="#quotes">Cancel</a></div></form></section>`;
  const form=document.querySelector('#quote-form'),tbody=document.querySelector('#item-rows');
  function addItem(i={description:'',quantity:1,unitCents:0}) {
    const tr=document.createElement('tr');tr.innerHTML=`<td><input name="description" aria-label="Item description" value="${e(i.description)}" maxlength="500" required></td><td><input class="quantity" name="quantity" aria-label="Quantity" type="number" min="1" max="10000" step="1" value="${i.quantity}" required></td><td><input class="unit-price" name="unitPrice" aria-label="Unit price in rand" type="number" min="0" max="9999999" step="0.01" value="${(i.unitCents/100).toFixed(2)}" required></td><td class="line-total"></td><td><button type="button" class="btn small danger" data-remove-item aria-label="Remove item">×</button></td>`;tbody.append(tr);totals();
  }
  function items(){return [...tbody.rows].map(tr=>({description:tr.querySelector('[name=description]').value,quantity:tr.querySelector('[name=quantity]').value,unitPrice:tr.querySelector('[name=unitPrice]').value}));}
  function totals(){let subtotal=0;[...tbody.rows].forEach(tr=>{const amount=Math.round(Number(tr.querySelector('[name=unitPrice]').value)*100)*Number(tr.querySelector('[name=quantity]').value);tr.querySelector('.line-total').textContent=m(amount);subtotal+=amount;});const discount=Math.round(Number(form.elements.discount.value)*100)||0;const tax=Math.round((subtotal-discount)*(Math.round(Number(form.elements.taxRate.value)*100)||0)/10000);document.querySelector('#live-totals').innerHTML=`<div><span>Subtotal</span><strong>${m(subtotal)}</strong></div><div><span>Discount</span><strong>− ${m(discount)}</strong></div><div><span>Tax</span><strong>${m(tax)}</strong></div><div class="grand-total"><span>Total</span><strong>${m(subtotal-discount+tax)}</strong></div>`;}
  q.items.forEach(addItem);form.addEventListener('input',totals);
  tbody.addEventListener('click',event=>{if(event.target.closest('[data-remove-item]')){event.target.closest('tr').remove();totals();}});
  document.querySelector('#add-item').addEventListener('click',()=>addItem());
  document.querySelector('#catalogue-add').addEventListener('change',event=>{const p=products.find(p=>p.id===event.target.value);if(p){addItem({description:p.name+(p.pack_size?' · '+p.pack_size:''),quantity:1,unitCents:p.price_cents||0});if(p.price_cents==null)AG.status('This product has no confirmed price. Enter the unit price before saving.',true);}event.target.value='';});
  form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;AG.status('Saving quote…');try{const values=Object.fromEntries(new FormData(form));const saved=await AG.post('/api/admin/quotes',{...values,id:q.id,revision:q.revision,items:items()});quotes=await AG.api('/api/quotes');location.hash='quote/'+saved.id;AG.status('Quote saved.');}catch(error){AG.status(error.message,true);}finally{button.disabled=false;}});
}
async function quoteView(id) {
  const q=await AG.api('/api/quotes/'+id);currentQuote=q;
  view.innerHTML=heading(e(q.number), `Prepared for ${e(q.customer)} · Revision ${q.revision}`, '<a class="btn" href="#quotes">← Quotes</a>') + `<div class="button-row no-print" style="margin:0 0 24px"><button class="btn primary" type="button" id="print-quote">Print / Save PDF</button>${user.role==='admin'?`<a class="btn" href="#edit-quote/${q.id}">Edit quote</a><button class="btn" id="email-quote" type="button">Email quote</button><button class="btn" id="quote-history" type="button">Revision history</button>`:''}</div>${AG.quoteHTML(q)}<section class="panel no-print" id="history" hidden></section>`;
  document.querySelector('#print-quote').addEventListener('click',()=>window.print());
  document.querySelector('#email-quote')?.addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;AG.status('Emailing quote…');try{const r=await AG.post(`/api/admin/quotes/${q.id}/email`,{});AG.status(r.message);}catch(error){AG.status(error.message,true);}finally{button.disabled=false;}});
  document.querySelector('#quote-history')?.addEventListener('click',async()=>{try{const rows=await AG.api(`/api/admin/quotes/${q.id}/history`);const el=document.querySelector('#history');el.hidden=false;el.innerHTML='<h2>Revision history</h2>'+rows.map(r=>`<details class="history-entry"><summary>Revision ${r.revision} · ${AG.date(r.created)} · ${m(r.document.totalCents)}</summary><p>Status: ${e(r.document.status)} · Valid until ${e(r.document.validUntil)}</p><div class="table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${r.document.items.map(i=>`<tr><td>${e(i.description)}</td><td>${i.quantity}</td><td>${m(i.unitCents)}</td><td>${m(i.totalCents)}</td></tr>`).join('')}</tbody></table></div><p>Discount: ${m(r.document.discountCents)} · Tax: ${m(r.document.taxCents)}</p><p class="quote-notes">${e(r.document.notes)}</p></details>`).join('');el.scrollIntoView({behavior:'smooth'});}catch(error){AG.status(error.message,true);}});
}
async function settings() {
  const data=await AG.api('/api/admin/health');
  view.innerHTML=heading('Workspace details.', 'Your account, security and business records.')+`<section class="panel"><h2>Account security</h2><p><strong>${e(user.name)}</strong><br>${e(user.email)}</p><p class="muted">Every sign-in requires your password and a one-time email verification code. Sessions expire after eight hours.</p><a class="btn" href="/login.html#forgot">Reset password</a></section><section class="panel"><h2>Business records</h2><p>Email delivery: <strong>${data.mailReady?'Connected':'Not configured'}</strong><br>Verified customer accounts: <strong>${data.customers}</strong></p><p class="help">Products, quotes and revision history are stored on this computer. Follow the backup instructions in DASHBOARD-README.md to keep a safe copy of the database, uploaded images and encryption key.</p></section>`;
}
async function route() {
  const [page,id]=(location.hash.slice(1)|| (user.role==='admin'?'overview':'quotes')).split('/');AG.status('');
  document.querySelectorAll('.side-nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+page || (a.hash==='#quotes'&&['quote','edit-quote','new-quote'].includes(page)) || (a.hash==='#products'&&['edit-product','new-product'].includes(page))));
  try {
    if(page==='quote')await quoteView(id);
    else if(user.role!=='admin')quoteList();
    else if(page==='quotes')quoteList();
    else if(page==='products')productList();
    else if(page==='new-product')productEditor();
    else if(page==='edit-product'){const p=products.find(p=>p.id===id);if(!p)throw new Error('Product not found.');productEditor(p);}
    else if(page==='new-quote')quoteEditor();
    else if(page==='edit-quote')quoteEditor(await AG.api('/api/quotes/'+id));
    else if(page==='settings')await settings();
    else overview();
  }catch(error){AG.status(error.message,true);}
}
(async()=>{try{user=await AG.user(document.body.dataset.admin==='true');if(!user)return;quotes=await AG.api('/api/quotes');if(user.role==='admin')products=await AG.api('/api/admin/products');window.addEventListener('hashchange',route);await route();}catch(error){AG.status(error.message,true);}})();
