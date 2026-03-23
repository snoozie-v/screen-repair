const form = document.getElementById('subscribeForm');
const formMessage = document.getElementById('formMessage');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Submitting...';
  formMessage.textContent = '';
  formMessage.className = '';

  const body = {
    name: form.name.value.trim(),
    business_name: form.business_name.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    territories: form.territories.value.trim()
  };

  try {
    const res = await fetch('/api/contractor-apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (res.ok && data.success) {
      formMessage.textContent = "Thanks! We'll be in touch shortly to discuss territory availability.";
      formMessage.className = 'form-message form-message--success';
      form.reset();
    } else {
      formMessage.textContent = data.error || 'Something went wrong. Please try again.';
      formMessage.className = 'form-message form-message--error';
    }
  } catch {
    formMessage.textContent = 'Something went wrong. Please try again.';
    formMessage.className = 'form-message form-message--error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Application';
  }
});
