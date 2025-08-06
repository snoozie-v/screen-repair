const currentYear = new Date().getFullYear()

document.getElementById('year').textContent = currentYear;

document.getElementById('subscribeForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const phone_number = document.getElementById('phone_number').value;  // Added
    const street_address = document.getElementById('street_address').value;  // Added
    const city = document.getElementById('city').value;  // Added
    const zipcode = document.getElementById('zipcode').value;  // Added
    

    fetch('https://snoozie.vercel.app/api/add-subscriber', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            name: name, 
            email: email,
            phone_number: phone_number,  // Added
            street_address: street_address,  // Added
            city: city,  // Added
            zipcode: zipcode  // Added

        }),
        
    })
    .then(response => response.json())
    .then(data => {
        if(data.success) {
            console.log(data)
            alert('Subscription successful!');
        } else {
            alert('Subscription failed. Please try again.');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
    });
});
