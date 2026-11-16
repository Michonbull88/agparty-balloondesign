# AG Balloons & Design

The current application is a Node.js 24+ website with customer accounts, administrator tools, products, quotations and Gmail/SMTP enquiry delivery.

## Run the current application

```sh
npm install
npm start
```

Open http://localhost:8000. The server serves the website from `dist/`. See [DASHBOARD-README.md](DASHBOARD-README.md) for first administrator setup, email configuration, backups and hosting requirements.

Recent updates include a business logo and contact details on quotations, WhatsApp and email sharing, enquiry delivery through the configured SMTP connection, and the corrected login decoration.

## GitHub Pages and application hosting

The HTML, CSS, JavaScript and assets at the repository root are the previous static GitHub Pages site, retained so uploading the application source does not interrupt that public page. The current application lives in `dist/`, `server.cjs` and `lib/`.

GitHub Pages cannot run this application's Node.js server, database, sign-in or SMTP email delivery. Publishing the current application requires a Node.js 24+ host with persistent private storage, HTTPS and SMTP configuration. Do not point GitHub Pages at `dist/` as a replacement for application hosting.

Passwords, SMTP credentials, customer records and uploaded business files stay in the private `.local/` directory or environment variables. They are excluded from this repository. A new server requires secure configuration and administrator setup; copying source code does not copy your local account or data.

## Checks

```sh
npm test
node test/browser-check.cjs
```

The browser checks require Microsoft Edge. Tests use temporary databases and mocked email delivery.
