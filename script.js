const menuButton = document.querySelector('.menu-toggle');
const header = document.querySelector('.site-header');

menuButton.addEventListener('click', () => {
  const open = header.classList.toggle('menu-open');
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});

document.querySelectorAll('nav a').forEach((link) => link.addEventListener('click', () => {
  header.classList.remove('menu-open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open navigation');
}));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && header.classList.contains('menu-open')) {
    header.classList.remove('menu-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open navigation');
    menuButton.focus();
  }
});

if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));
} else {
  document.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
}

document.querySelectorAll('[data-package]').forEach((link) => {
  link.addEventListener('click', () => {
    const packageSelect = document.querySelector('[name="package"]');
    packageSelect.value = link.dataset.package;
  });
});

const form = document.querySelector('#design-form');
const dialog = document.querySelector('#brief-dialog');
const output = document.querySelector('#brief-output');
const status = document.querySelector('.copy-status');
const formStatus = document.querySelector('.form-status');
const submitButton = form.querySelector('[type="submit"]');
const formLoadedAt = Date.now();
const minimumCompletionTime = 3000;
const submissionCooldown = 60000;
const submissionStorageKey = 'ag-balloons-last-enquiry';
const dateInput = form.querySelector('[name="date"]');

const today = new Date();
const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
  .toISOString()
  .split('T')[0];
dateInput.min = localToday;

function getLastSubmissionTime() {
  try {
    return Number(localStorage.getItem(submissionStorageKey) || 0);
  } catch (error) {
    return 0;
  }
}

function saveSubmissionTime() {
  try {
    localStorage.setItem(submissionStorageKey, String(Date.now()));
  } catch (error) {
    // Submissions still work when storage is blocked by the browser.
  }
}

function createBrief(data) {
  return `AG BALLOONS & DESIGN — NEW ENQUIRY

Name: ${data.get('name')}
Contact number: ${data.get('phone')}
Email: ${data.get('email')}
Event date: ${data.get('date')}
Occasion: ${data.get('occasion')}
Package: ${data.get('package')}
Venue / area: ${data.get('venue') || 'Not specified'}
Colours: ${data.get('colours') || 'Open to suggestions'}
Budget: ${data.get('budget')}
Preferred contact: ${data.get('contact')}

DESIGN IDEA
${data.get('idea')}

Please contact me with a custom quote. Thank you!`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);

  if (String(data.get('_honey') || '').trim()) {
    form.reset();
    formStatus.className = 'form-status success';
    formStatus.textContent = 'Thank you. Your request has been received.';
    return;
  }

  if (Date.now() - formLoadedAt < minimumCompletionTime) {
    formStatus.className = 'form-status error';
    formStatus.textContent = 'Please take a moment to review your details, then submit again.';
    return;
  }

  const waitTime = submissionCooldown - (Date.now() - getLastSubmissionTime());
  if (waitTime > 0) {
    formStatus.className = 'form-status error';
    formStatus.textContent = `Please wait ${Math.ceil(waitTime / 1000)} seconds before sending another enquiry.`;
    return;
  }

  const brief = createBrief(data);
  const originalButtonContent = submitButton.innerHTML;

  submitButton.disabled = true;
  submitButton.textContent = 'Sending your enquiry…';
  formStatus.className = 'form-status sending';
  formStatus.textContent = 'Please wait while we email your design brief.';

  try {
    const payload = Object.fromEntries(data.entries());
    payload.message = brief;

    const response = await fetch('https://formsubmit.co/ajax/anythingoessa@gmail.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok || result.success === false || result.success === 'false') {
      throw new Error('The email service could not accept this enquiry.');
    }

    output.value = brief;
    status.textContent = '';
    formStatus.className = 'form-status success';
    formStatus.textContent = 'Sent successfully. We’ll be in touch soon.';
    saveSubmissionTime();
    dialog.showModal();
    form.reset();
  } catch (error) {
    formStatus.className = 'form-status error';
    formStatus.textContent = 'We could not send your enquiry right now. Please check your connection and try again.';
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = originalButtonContent;
  }
});

document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

async function copyBrief() {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(output.value);
    return;
  }

  output.focus();
  output.select();
  if (!document.execCommand('copy')) throw new Error('Copy was not available.');
}

document.querySelector('#copy-brief').addEventListener('click', async () => {
  try {
    await copyBrief();
    status.textContent = 'Copied — your brief is ready to paste.';
  } catch (error) {
    status.textContent = 'Select the brief above and copy it manually.';
  }
});

document.querySelector('#share-brief').addEventListener('click', async () => {
  try {
    if (navigator.share) {
      await navigator.share({ title: 'My AG Balloons design brief', text: output.value });
      return;
    }

    await copyBrief();
    status.textContent = 'Sharing is not available here, so we copied it for you.';
  } catch (error) {
    if (error.name !== 'AbortError') {
      status.textContent = 'Select the brief above and copy it manually.';
    }
  }
});

document.querySelector('#year').textContent = new Date().getFullYear();
