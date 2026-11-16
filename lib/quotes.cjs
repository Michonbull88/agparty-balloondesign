function fail(message) { throw Object.assign(new Error(message), { status: 400 }); }
function text(value, max = 200) { return String(value ?? '').trim().slice(0, max); }
function email(value) {
  const valueText = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valueText)) fail('Enter a valid email address.');
  return valueText;
}
function cents(value, nullable = false) {
  if (nullable && (value === '' || value == null)) return null;
  const s = String(value ?? '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) fail('Enter a valid amount with up to two decimal places.');
  return Math.round(Number(s) * 100);
}
function quoteInput(body) {
  const customer = text(body.customer), customerEmail = email(body.email);
  if (!customer) fail('Enter the customer name.');
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) fail('Add between 1 and 100 quote items.');
  const items = body.items.map(item => {
    const description = text(item.description, 500), quantity = Number(item.quantity), unitCents = cents(item.unitPrice);
    if (!description || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000) fail('Each item needs a description and a whole quantity between 1 and 10,000.');
    return { description, quantity, unitCents, totalCents: quantity * unitCents };
  });
  const subtotalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents > 10000000000) fail('Quote total is too large.');
  const discountCents = cents(body.discount || '0');
  if (discountCents > subtotalCents) fail('Discount cannot exceed the subtotal.');
  const taxBasisPoints = cents(body.taxRate || '0');
  if (taxBasisPoints > 10000) fail('Tax rate must be between 0 and 100 percent.');
  const taxCents = Math.round((subtotalCents - discountCents) * taxBasisPoints / 10000);
  const validUntil = text(body.validUntil, 10);
  const parsedDate = new Date(validUntil + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== validUntil) fail('Enter a valid expiry date.');
  const status = body.status || 'draft';
  if (!['draft', 'sent', 'accepted', 'declined'].includes(status)) fail('Choose a valid quote status.');
  return { customer, email: customerEmail, phone: text(body.phone, 40), validUntil, status, notes: text(body.notes, 4000), items, subtotalCents, discountCents, taxBasisPoints, taxCents, totalCents: subtotalCents - discountCents + taxCents };
}
module.exports = { fail, text, email, cents, quoteInput };
