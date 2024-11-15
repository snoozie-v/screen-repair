document.getElementById('subscribeForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    fetch('http://localhost:3001/add-email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: name, email: email }),
    })
    .then(response => response.json())
    .then(data => {
        if(data.success) {
            alert('Subscription successful!');
        } else {
            alert('Subscription failed. Please try again.');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
    });
});