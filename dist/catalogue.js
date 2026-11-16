(async () => {
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = cents => new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(cents/100);
  function cards(products, pinatas = false) {
    return products.map(p => `<article class="party-card ${pinatas?'pinata-card':''}"><div class="party-image"><img src="${e(p.image)}" width="1200" height="900" loading="lazy" decoding="async" alt="${e(p.name)}"></div><div class="party-details"><${pinatas?'h4':'h3'}>${e(p.name)}</${pinatas?'h4':'h3'}><p>${e(p.description)}</p>${p.pack_size?`<p class="party-note">${e(p.pack_size)}</p>`:''}<p class="party-price"><span>Price</span><strong>${p.price_cents==null?'To be confirmed':money(p.price_cents)}</strong></p></div></article>`).join('');
  }
  try {
    const r=await fetch('/api/products');
    if(r.ok){
      const products=await r.json();
      document.querySelector('#party-stuff > .party-grid').innerHTML=cards(products.filter(p=>p.category==='partyware'));
      const pinatas=document.querySelector('#pinatas');
      pinatas.querySelectorAll('.pinata-card').forEach(el=>el.remove());
      const list=document.createElement('div');list.className='pinata-products';list.innerHTML=cards(products.filter(p=>p.category==='pinatas'),true);
      pinatas.querySelector('.pinata-heading').after(list);
      const balloons=products.filter(p=>p.category==='balloons');
      document.querySelector('#balloon-products').hidden=!balloons.length;
      document.querySelector('#balloon-product-grid').innerHTML=cards(balloons);
    }
  } catch { /* Keep the static catalogue available if the backend is offline. */ }
  try {
    const r=await fetch('/api/auth/status');if(!r.ok)return;
    const {user}=await r.json();
    if(user){const link=document.querySelector('#account-link');link.textContent='My account';link.href='/dashboard.html';document.querySelector('#admin-link').hidden=user.role!=='admin';}
  } catch { /* Sign-in link remains available. */ }
})();
