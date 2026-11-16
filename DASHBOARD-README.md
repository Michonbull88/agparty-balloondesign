# AG Balloons local dashboard

This is a local Node.js application with SQLite storage, customer accounts and an administrator workspace. It replaces the previous static-only preview server. Node.js 24 or newer is required.

## Run

From this folder, run `npm.cmd install` once, then `npm.cmd start`. Open http://localhost:8000. The server binds to this computer only by default.

## First administrator setup

1. Open http://localhost:8000/setup.html on this computer.
2. Copy the code from `.local/setup-code.txt` into the setup form. It is generated at first startup and deleted after setup; it is never committed to Git.
3. The administrator email is `anythingoessa@gmail.com`. Set your own password (12–128 characters) in the form.
4. Connect email delivery. Gmail defaults are prefilled: `smtp.gmail.com`, port 465, and the administrator email. Use a Google app password after enabling two-step verification on the Google account. Do not enter your normal Google password. Alternatively, configure an SMTP provider using `.env` (copy `.env.example`).
5. Sign in at http://localhost:8000/login.html and enter the six-digit code sent to your email.

Email sending must work before setup finishes. There is no demo password or bypass for email codes. No credentials have been preconfigured. SMTP settings saved through setup are encrypted using the local master key.

## Accounts and access

- All visitors see Sign in on the main website. Customers can register, verify their email with a one-time code, and see their own non-draft quotes.
- After administrator sign-in, an Admin dashboard link appears on the main website. Anonymous visitors and customer accounts cannot access administrator APIs.
- Passwords use salted scrypt hashing. Session cookies are HttpOnly and SameSite=Strict; sessions expire after eight hours. One-time email codes expire after 10 minutes, allow five attempts, and are invalidated after use. Authentication and email sending are rate limited.
- Forgot password sends a single-use link valid for 30 minutes. Resetting a password revokes existing sessions and still requires an email code on the next login.
- Email and the password provide the requested two-step login. Access to the email account is required to sign in or recover access.

## Quotes

Create quotes with customer contact details, expiry date, free-text or catalogue line items, quantities, discount, tax percentage and notes. All amounts are calculated on the server in integer cents. Tax starts at zero; add VAT only if appropriate for the business.

Quote numbers are assigned automatically. Every save records an immutable revision with the original descriptions, prices and totals. Updating product prices does not change existing quotes. Customer email cannot be changed on an existing quote: create a new quote for a different customer.

Drafts remain administrator-only. A quote saved as Sent appears in the verified customer's account. This status does not itself send email: use Email quote to send it. Print / Save PDF opens the browser's print dialog for a clean quote document. Accepted and Declined statuses are managed by the administrator.

## Products

Edit or add products in Partyware, Piñatas or Balloons. Upload JPEG, PNG or WebP images (10 MB maximum); the server validates and converts images to WebP. Product prices may stay blank to show To be confirmed. Use Archived / hidden to remove an item from the public catalogue without deleting it. Existing seven party products are seeded once with unconfirmed prices.

Published products populate the public catalogue when the page loads or is refreshed. Existing marketing package prices are separate from the product catalogue.

## Storage and backup

Private data lives in `.local/`, outside the public `dist/` folder and ignored by Git:

- `ag-balloons.sqlite`: accounts, quotes, complete revision history, products and sessions
- `uploads/`: uploaded product images
- `master.key` and `mail.enc`: local encryption key and encrypted mail configuration

For a consistent backup, stop the server, copy the entire `.local/` folder to a private backup destination, then restart. Keep the key with its encrypted configuration, and keep the backup private. Do not publish or commit `.local/` or `.env`.

## Hosting

This change runs locally. It has not been deployed. The old static hosting manifest does not provide the backend required for accounts, quotes or uploads. Do not deploy this application as a static-only website or on GitHub Pages. Public hosting needs a Node.js 24 server with persistent disk, HTTPS, an SMTP service, `APP_ORIGIN` set to the exact HTTPS URL and `COOKIE_SECURE=1`. A platform migration, storage and email configuration must be completed before going live. Proxy deployments must deliberately configure trusted proxy handling rather than trusting forwarded headers from arbitrary callers.

## Validation

`npm.cmd test` runs server tests against isolated temporary databases and mock email delivery. `node test/browser-check.cjs` checks the interface in headless Microsoft Edge against an isolated local test server. Neither sends actual email or changes live business data.

Security references: [Express security guidance](https://expressjs.com/en/advanced/best-practice-security/), [OWASP MFA guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html), [Nodemailer SMTP transport](https://nodemailer.com/smtp).
