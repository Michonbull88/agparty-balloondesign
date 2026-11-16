const setupForm = document.querySelector('#setup-form');
AG.api('/api/auth/status').then(data => {
  if (!data.setupRequired) { setupForm.hidden = true; AG.status('Administrator setup is complete. Use the sign-in page.'); }
  if (data.mailReady) {
    document.querySelector('#smtp-fields').hidden = true;
    document.querySelectorAll('#smtp-fields input').forEach(el => el.required = false);
  }
}).catch(error => AG.status(error.message, true));
setupForm.addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(setupForm));
  if (data.password !== data.confirmation) { AG.status('The passwords do not match.', true); return; }
  const button = setupForm.querySelector('button'); button.disabled = true; AG.status('Connecting your email account…');
  try {
    const result = await AG.post('/api/auth/setup', data);
    setupForm.reset(); setupForm.hidden = true; AG.status(result.message);
  } catch (error) { AG.status(error.message, true); }
  finally { button.disabled = false; }
});
