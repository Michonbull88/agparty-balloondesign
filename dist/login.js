const form = document.querySelector('#auth-form');
let mode = 'login';
const params = new URLSearchParams(location.hash.slice(1));
const resetToken = params.get('reset');
if (resetToken) history.replaceState(null, '', '/login.html');
function setMode(next) {
  mode = next; AG.status('');
  const show = (id, visible) => document.querySelector(id).hidden = !visible;
  show('#name-label', mode === 'register');
  show('#email-label', ['login','register','forgot'].includes(mode));
  show('#password-label', ['login','register','reset'].includes(mode));
  show('#code-label', mode === 'verify');
  form.elements.name.required = mode === 'register';
  form.elements.email.required = ['login','register','forgot'].includes(mode);
  form.elements.password.required = ['login','register','reset'].includes(mode);
  form.elements.password.minLength = ['register','reset'].includes(mode) ? 12 : 1;
  form.elements.password.autocomplete = ['register','reset'].includes(mode) ? 'new-password' : 'current-password';
  form.elements.code.required = mode === 'verify';
  const titles = { login:'Welcome back.', register:'Your party starts here.', verify:'Check your inbox.', forgot:'Forgot your password?', reset:'Choose a new password.' };
  const intros = { login:'Sign in with your email and password. We’ll email a verification code to complete your sign-in.', register:'Create an account to view your quotes. Use a password of at least 12 characters.', verify:'Enter the six-digit code we emailed you. It expires in 10 minutes. Check your spam folder if needed.', forgot:'Enter your email address to request a password reset link.', reset:'Use a password of 12 to 128 characters. You will still need an email code when you sign in.' };
  document.querySelector('#auth-title').textContent = titles[mode];
  document.querySelector('#auth-intro').textContent = intros[mode];
  document.querySelector('#auth-submit').textContent = {login:'Sign in',register:'Create account',verify:'Verify & continue',forgot:'Email reset link',reset:'Update password'}[mode];
  show('#switch-register', mode === 'login'); show('#switch-forgot', mode === 'login'); show('#switch-login', mode !== 'login');
  if (mode === 'verify') form.elements.code.focus();
}
document.querySelector('#switch-register').addEventListener('click', () => setMode('register'));
document.querySelector('#switch-forgot').addEventListener('click', () => setMode('forgot'));
document.querySelector('#switch-login').addEventListener('click', () => { form.elements.password.value = ''; form.elements.code.value = ''; setMode('login'); });
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.querySelector('#auth-submit'); button.disabled = true; AG.status('Please wait…');
  try {
    const data = Object.fromEntries(new FormData(form));
    if (mode === 'reset') data.token = resetToken;
    const result = await AG.post('/api/auth/' + mode, data);
    form.elements.password.value = '';
    if (result.needsCode) { setMode('verify'); AG.status(result.message); }
    else if (result.user) location.href = result.user.role === 'admin' ? '/admin.html' : '/dashboard.html';
    else { if (mode === 'reset') setMode('login'); AG.status(result.message); }
  } catch (error) { AG.status(error.message, true); }
  finally { button.disabled = false; }
});
AG.api('/api/auth/status').then(({ user, setupRequired }) => {
  if (user && !resetToken && location.hash !== '#forgot') location.replace(user.role === 'admin' ? '/admin.html' : '/dashboard.html');
  document.querySelector('#setup-notice').hidden = !setupRequired;
}).catch(error => AG.status(error.message, true));
if (resetToken) setMode('reset');
else if (location.hash === '#forgot') setMode('forgot');
