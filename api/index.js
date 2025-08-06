const express = require('express');
const app = express();
const dotenv = require('dotenv')
dotenv.config();
const port = process.env.PORT || 3001
const path = require('path');
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

const cors = require('cors');
app.use(cors())

const pg = require('pg');
const { Pool } = pg
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL
})
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err)
  process.exit(-1)
})

console.log('POSTGRES_URL:', process.env.POSTGRES_URL);

const nodemailer = require('nodemailer')

console.log('SMTP Config:', {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE,
  user: process.env.SMTP_USER
});

// Create a reusable transporter object using SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',  // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function checkEmails() {  // Renamed to checkSubscribers for clarity
    const subscriberQuery = 'SELECT name, email, phone_number, street_address, city, zipcode FROM subscribers';  // Updated to select new fields
    try {
      const result = await pool.query(subscriberQuery);
      const subscribers = result.rows.map(row => ({
        name: row.name,
        email: row.email,
        phone_number: row.phone_number,  // Added
        street_address: row.street_address,  // Added
        city: row.city,  // Added
        zipcode: row.zipcode  // Added
      }));
      return subscribers;
    } catch (error) {
      console.error('Error executing query', error);
      throw error;
    }
  }

app.get("/api", async (req, res) => {
    const currentDate = new Date();
    console.log(`get request received ${currentDate}`)
    try {
      const subscribers = await checkEmails();  // Function name updated if renamed
      res.json(subscribers);
    } catch (error) {
      console.error('Error in /api route', error);
      res.status(500).json({ error: 'Could not retrieve subscriber information' });
    }
})

app.post('/api/add-email', async (req, res) => {  // Consider renaming to /api/add-subscriber
  console.log('Received POST request:', req.body);
  const { name, email, phone_number, street_address, city, zipcode } = req.body;  // Added new fields to destructuring

  const insertSubscriberQuery = `
    INSERT INTO subscribers(name, email, phone_number, street_address, city, zipcode)
    VALUES($1, $2, $3, $4, $5, $6)
    RETURNING *`;  // Updated to insert new fields
  try {
    const result = await pool.query(insertSubscriberQuery, [name, email, phone_number, street_address, city, zipcode]);  // Added params
    const newSubscriber = result.rows[0];  // Return full subscriber object now

    // Send email notification after successful insert
    const mailOptions = {
      from: process.env.SMTP_USER,  // Sender: your business email
      to: process.env.ADMIN_EMAIL,  // Recipient: your admin email (yourself)
      subject: 'New Subscriber Added',
      text: `A new subscriber has joined:\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone_number}\nAddress: ${street_address}, ${city} ${zipcode}`
      // You can use HTML instead: html: '<p>Details here...</p>'
    };

    await transporter.sendMail(mailOptions);
    console.log('Notification email sent successfully');

    res.json({ success: true, newSubscriber });
  } catch (error) {
    console.error('Error adding new subscriber or sending email:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = app;
