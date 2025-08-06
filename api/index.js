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

const nodemailer = require('nodemailer')

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

// app.get("/api", async (req, res) => {
//     const currentDate = new Date();
//     console.log(`get request received ${currentDate}`)
//     try {
//       const subscribers = await checkEmails();  // Function name updated if renamed
//       res.json(subscribers);
//     } catch (error) {
//       console.error('Error in /api route', error);
//       res.status(500).json({ error: 'Could not retrieve subscriber information' });
//     }
// })

app.post('/api/add-subscriber', async (req, res) => {
  console.log('Received POST request:', req.body);
  const { name, email, phone_number, street_address, city, zipcode } = req.body;

  // Input validation
  if (!name || !email || !phone_number || !street_address || !city || !zipcode) {
    console.log('Validation failed: Missing required fields');
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    console.log('Validation failed: Invalid email format');
    return res.status(400).json({ error: 'Invalid email format' });
  }

  const insertSubscriberQuery = `
    INSERT INTO subscribers(name, email, phone_number, street_address, city, zipcode)
    VALUES($1, $2, $3, $4, $5, $6)
    ON CONFLICT (email) DO UPDATE
    SET name = EXCLUDED.name,
        phone_number = EXCLUDED.phone_number,
        street_address = EXCLUDED.street_address,
        city = EXCLUDED.city,
        zipcode = EXCLUDED.zipcode
    RETURNING *, (xmax = 0) AS is_insert;
  `;
  try {
    const result = await pool.query(insertSubscriberQuery, [name, email, phone_number, street_address, city, zipcode]);
    const newSubscriber = result.rows[0];
    const isInsert = newSubscriber.is_insert; // True if inserted, false if updated

    // Log SMTP configuration for debugging
    console.log('Attempting to send email with config:', {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE,
      user: process.env.SMTP_USER
    });

    // Send email notification with HTML content
    const mailOptions = {
      from: process.env.SMTP_USER, // Sender: your business email
      to: process.env.ADMIN_EMAIL, // Recipient: your admin email
      subject: isInsert ? 'New Subscriber Added' : 'Subscriber Updated',
      html: `
        <h3 style="color: #333;">${isInsert ? 'New Subscriber' : 'Updated Subscriber'}</h3>
        <p style="font-size: 16px; line-height: 1.5;">
          <strong>Name:</strong> ${name}<br>
          <strong>Email:</strong> ${email}<br>
          <strong>Phone:</strong> ${phone_number}<br>
          <strong>Address:</strong> ${street_address}, ${city} ${zipcode}
        </p>
        <p style="color: #666; font-size: 14px;">This email was sent from ScreenFixPro's subscription system.</p>
      `
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', info.messageId);
    } catch (emailError) {
      console.error('Email sending failed:', {
        error: emailError.message,
        code: emailError.code,
        command: emailError.command
      });
      // Continue despite email failure
    }

    res.json({ success: true, newSubscriber, action: isInsert ? 'inserted' : 'updated' });
  } catch (error) {
    console.error('Error processing subscriber:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = app;
