const express = require('express');
const app = express();

const dotenv = require('dotenv')
dotenv.config();
const port = process.env.PORT || 3001
const path = require('path');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const emailHeader = `
  <div style="background-color:#007BFF;padding:20px 32px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:22px;color:#ffffff;letter-spacing:0.5px;">
      Screen Fix Pro
    </h1>
    <p style="margin:4px 0 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.8);">
      Lakeville · Burnsville · Bloomington
    </p>
  </div>
`;

const emailFooter = `
  <div style="background-color:#f8f9fa;padding:16px 32px;border-radius:0 0 8px 8px;border-top:1px solid #e9ecef;">
    <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#999;">
      Screen Fix Pro · info@screenfixpro.com · screenfixpro.com
    </p>
  </div>
`;

async function sendLeadConfirmation(name, email, service_type) {
  const firstName = name.split(' ')[0];
  const serviceLabel = {
    window_screen: 'Window Screen Repair',
    door_screen: 'Door Screen Repair',
    porch_patio: 'Porch / Patio Rescreen',
    multiple: 'Multiple / Whole House',
    not_sure: 'Screen Repair'
  }[service_type] || 'Screen Repair';

  try {
    await transporter.sendMail({
      from: `Screen Fix Pro <${process.env.SMTP_USER}>`,
      to: email,
      subject: "We got your quote request — Screen Fix Pro",
      html: `
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          ${emailHeader}
          <div style="padding:32px;">
            <h2 style="margin:0 0 16px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:20px;color:#333;">
              Thanks, ${firstName}!
            </h2>
            <p style="margin:0 0 16px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.6;color:#555;">
              We received your <strong>${serviceLabel}</strong> quote request and will reach out within <strong>24 hours</strong> to schedule a convenient time.
            </p>
            <div style="background:#f0f8ff;border-left:4px solid #4CAF50;padding:12px 16px;border-radius:0 4px 4px 0;margin:0 0 20px;">
              <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#333;line-height:1.5;">
                ✓ &nbsp;We typically book within a few days of first contact<br>
                ✓ &nbsp;On-site service — we come to you<br>
                ✓ &nbsp;No obligation, free assessment
              </p>
            </div>
            <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#888;">
              Questions? Reply to this email or reach us at
              <a href="mailto:info@screenfixpro.com" style="color:#007BFF;">info@screenfixpro.com</a>
            </p>
          </div>
          ${emailFooter}
        </div>
      `
    });
    console.log('Confirmation email sent to', email);
  } catch (err) {
    console.error('Lead confirmation email failed:', err.message);
  }
}

async function sendAdminNotification(lead, isInsert) {
  const { name, email, phone_number, street_address, city, zipcode, service_type, job_description, region } = lead;
  const serviceLabel = {
    window_screen: 'Window Screen',
    door_screen: 'Door Screen',
    porch_patio: 'Porch / Patio',
    multiple: 'Multiple / Whole House',
    not_sure: 'Not Sure'
  }[service_type] || service_type || '—';

  const adminEmail = region === 'carlos' && process.env.CARLOS_ADMIN_EMAIL
    ? process.env.CARLOS_ADMIN_EMAIL
    : process.env.ADMIN_EMAIL;
  const regionLabel = region === 'carlos' ? 'Carlos/Alexandria' : 'Lakeville/Twin Cities';

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: adminEmail,
      subject: isInsert ? `New lead: ${name} — ${serviceLabel} (${city})` : `Updated lead: ${name} — ${serviceLabel} (${city})`,
      html: `
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          ${emailHeader}
          <div style="padding:32px;">
            <h2 style="margin:0 0 20px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:18px;color:#333;">
              ${isInsert ? '🆕 New Lead' : '🔄 Updated Lead'}
            </h2>
            <table style="width:100%;border-collapse:collapse;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;">
              <tr><td style="padding:8px 0;color:#888;width:120px;">Name</td><td style="padding:8px 0;color:#333;font-weight:600;">${name}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#007BFF;">${email}</a></td></tr>
              <tr><td style="padding:8px 0;color:#888;">Phone</td><td style="padding:8px 0;"><a href="tel:${phone_number}" style="color:#007BFF;">${phone_number}</a></td></tr>
              <tr><td style="padding:8px 0;color:#888;">Address</td><td style="padding:8px 0;color:#333;">${street_address}<br>${city}, MN ${zipcode}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Service</td><td style="padding:8px 0;color:#333;">${serviceLabel}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Region</td><td style="padding:8px 0;color:#333;">${regionLabel}</td></tr>
              ${job_description ? `<tr><td style="padding:8px 0;color:#888;vertical-align:top;">Notes</td><td style="padding:8px 0;color:#333;">${job_description}</td></tr>` : ''}
            </table>
          </div>
          ${emailFooter}
        </div>
      `
    });
    console.log('Admin notification sent');
  } catch (err) {
    console.error('Admin notification failed:', err.message);
  }
}

app.post('/api/add-subscriber', async (req, res) => {
  console.log('Received POST request:', req.body);
  const { name, email, phone_number, street_address, city, zipcode, service_type, job_description, region } = req.body;

  if (!name || !email || !phone_number || !street_address || !city || !zipcode || !service_type) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  const insertQuery = `
    INSERT INTO subscribers(name, email, phone_number, street_address, city, zipcode, service_type, job_description)
    VALUES($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (email) DO UPDATE
    SET name = EXCLUDED.name,
        phone_number = EXCLUDED.phone_number,
        street_address = EXCLUDED.street_address,
        city = EXCLUDED.city,
        zipcode = EXCLUDED.zipcode,
        service_type = EXCLUDED.service_type,
        job_description = EXCLUDED.job_description
    RETURNING *, (xmax = 0) AS is_insert;
  `;

  try {
    const result = await pool.query(insertQuery, [name, email, phone_number, street_address, city, zipcode, service_type, job_description || null]);
    const newSubscriber = result.rows[0];
    const isInsert = newSubscriber.is_insert;

    await Promise.all([
      sendLeadConfirmation(name, email, service_type),
      sendAdminNotification({ name, email, phone_number, street_address, city, zipcode, service_type, job_description, region }, isInsert)
    ]);

    res.json({ success: true, newSubscriber, action: isInsert ? 'inserted' : 'updated' });
  } catch (error) {
    console.error('Error processing subscriber:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = app;
