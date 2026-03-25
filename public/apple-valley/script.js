const currentYear = new Date().getFullYear()

document.getElementById('year').textContent = currentYear;

document.getElementById('subscribeForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const phone_number = document.getElementById('phone_number').value;
    const street_address = document.getElementById('street_address').value;
    const city = document.getElementById('city').value;
    const zipcode = document.getElementById('zipcode').value;
    const service_type = document.getElementById('service_type').value;
    const job_description = document.getElementById('job_description').value;

    const btn = this.querySelector('button[type="submit"]');
    const msg = document.getElementById('formMessage');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    msg.className = '';
    msg.textContent = '';

    fetch('/api/add-subscriber', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone_number, street_address, city, zipcode, service_type, job_description, region: 'apple-valley' }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            msg.className = 'form-message form-message--success';
            msg.textContent = "Thanks! We'll be in touch shortly to schedule your free quote.";
            e.target.reset();
        } else {
            msg.className = 'form-message form-message--error';
            msg.textContent = data.error || 'Something went wrong. Please try again.';
        }
    })
    .catch(() => {
        msg.className = 'form-message form-message--error';
        msg.textContent = 'Network error. Please check your connection and try again.';
    })
    .finally(() => {
        btn.disabled = false;
        btn.textContent = 'Request Free Quote';
    });
});
