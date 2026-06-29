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
const rateLimit = require('express-rate-limit');

const allowedOrigins = [
  'https://www.screenfixpro.com',
  'https://screenfixpro.com',
];
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Vercel server-side, same-origin) and allowed list
    if (!origin || allowedOrigins.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  }
}));

// Rate limit all admin API routes: 30 requests per 15 minutes per IP
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' },
});
app.use('/api/jobs', adminLimiter);
app.use('/api/leads', adminLimiter);
app.use('/api/report', adminLimiter);

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

const BASE_URL = process.env.BASE_URL || 'https://www.screenfixpro.com';

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

const serviceLabels = {
  window_screen: 'Window Screen',
  door_screen: 'Door Screen',
  porch_patio: 'Porch / Patio',
  multiple: 'Multiple / Whole House',
  not_sure: 'Not Sure'
};

const regionLabels = {
  lakeville: 'Lakeville',
  burnsville: 'Burnsville',
  bloomington: 'Bloomington',
  carlos: 'Carlos/Alexandria',
  main: 'South Metro (general)'
};

// --- Email helpers ---

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
  const serviceLabel = serviceLabels[service_type] || service_type || '—';
  const regionLabel = regionLabels[region] || region || 'Unknown';
  const adminEmail = (region === 'carlos' && process.env.CARLOS_ADMIN_EMAIL)
    ? process.env.CARLOS_ADMIN_EMAIL
    : process.env.ADMIN_EMAIL;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: adminEmail,
      subject: isInsert === 'passed' ? `Lead passed — no contractors available: ${name} — ${serviceLabel} (${city})` : isInsert ? `New lead: ${name} — ${serviceLabel} (${city})` : `Updated lead: ${name} — ${serviceLabel} (${city})`,
      html: `
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          ${emailHeader}
          <div style="padding:32px;">
            <h2 style="margin:0 0 20px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:18px;color:#333;">
              ${isInsert === 'passed' ? '📋 Lead Passed — No Contractors Available' : isInsert ? '🆕 New Lead' : '🔄 Updated Lead'}
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

async function sendContractorLeadNotification(contractor, lead, token) {
  const { city, service_type, job_description } = lead;
  const serviceLabel = serviceLabels[service_type] || service_type || 'Screen Repair';
  const acceptUrl = `${BASE_URL}/api/lead/accept?token=${token}`;
  const rejectUrl = `${BASE_URL}/api/lead/reject?token=${token}`;

  try {
    await transporter.sendMail({
      from: `Screen Fix Pro <${process.env.SMTP_USER}>`,
      to: contractor.email,
      subject: `New lead: ${serviceLabel} in ${city}`,
      html: `
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          ${emailHeader}
          <div style="padding:32px;">
            <h2 style="margin:0 0 8px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:20px;color:#333;">New Lead Available</h2>
            <p style="margin:0 0 20px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#888;">Hi ${contractor.name} — a new lead just came in for your area.</p>
            <table style="width:100%;border-collapse:collapse;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;margin-bottom:24px;">
              <tr><td style="padding:8px 0;color:#888;width:120px;">City</td><td style="padding:8px 0;color:#333;font-weight:600;">${city}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Service</td><td style="padding:8px 0;color:#333;">${serviceLabel}</td></tr>
              ${job_description ? `<tr><td style="padding:8px 0;color:#888;vertical-align:top;">Notes</td><td style="padding:8px 0;color:#333;">${job_description}</td></tr>` : ''}
            </table>
            <p style="margin:0 0 16px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#555;">Accept to receive the customer's full contact details and $15 charge. Pass if you're unavailable.</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding-right:8px;">
                  <a href="${acceptUrl}" style="display:block;background:#2e7d32;color:#fff;text-align:center;padding:14px;border-radius:4px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;">Accept Lead</a>
                </td>
                <td style="padding-left:8px;">
                  <a href="${rejectUrl}" style="display:block;background:#888;color:#fff;text-align:center;padding:14px;border-radius:4px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;">Pass</a>
                </td>
              </tr>
            </table>
          </div>
          ${emailFooter}
        </div>
      `
    });
    console.log('Contractor lead notification sent to', contractor.email);
  } catch (err) {
    console.error('Contractor lead notification failed:', err.message);
  }
}

async function sendContractorLeadDetails(contractor, lead) {
  const { name, email, phone_number, street_address, city, zipcode, service_type, job_description } = lead;
  const serviceLabel = serviceLabels[service_type] || service_type || 'Screen Repair';

  try {
    await transporter.sendMail({
      from: `Screen Fix Pro <${process.env.SMTP_USER}>`,
      to: contractor.email,
      subject: `Lead details — ${name}`,
      html: `
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          ${emailHeader}
          <div style="padding:32px;">
            <h2 style="margin:0 0 8px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:20px;color:#333;">Customer Details</h2>
            <p style="margin:0 0 20px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#888;">Here are the full contact details for the lead you accepted.</p>
            <table style="width:100%;border-collapse:collapse;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;">
              <tr><td style="padding:8px 0;color:#888;width:120px;">Name</td><td style="padding:8px 0;color:#333;font-weight:600;">${name}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Phone</td><td style="padding:8px 0;"><a href="tel:${phone_number}" style="color:#007BFF;">${phone_number}</a></td></tr>
              <tr><td style="padding:8px 0;color:#888;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#007BFF;">${email}</a></td></tr>
              <tr><td style="padding:8px 0;color:#888;">Address</td><td style="padding:8px 0;color:#333;">${street_address}<br>${city}, MN ${zipcode}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Service</td><td style="padding:8px 0;color:#333;">${serviceLabel}</td></tr>
              ${job_description ? `<tr><td style="padding:8px 0;color:#888;vertical-align:top;">Notes</td><td style="padding:8px 0;color:#333;">${job_description}</td></tr>` : ''}
            </table>
          </div>
          ${emailFooter}
        </div>
      `
    });
    console.log('Lead details sent to contractor', contractor.email);
  } catch (err) {
    console.error('Lead details email failed:', err.message);
  }
}

async function sendAdminLeadAccepted(contractor, lead) {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.ADMIN_EMAIL,
      subject: `Lead accepted by ${contractor.name} — ${lead.name}`,
      html: `
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          ${emailHeader}
          <div style="padding:32px;">
            <h2 style="margin:0 0 20px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:18px;color:#333;">✅ Lead Accepted</h2>
            <table style="width:100%;border-collapse:collapse;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;">
              <tr><td style="padding:8px 0;color:#888;width:140px;">Contractor</td><td style="padding:8px 0;color:#333;font-weight:600;">${contractor.name}${contractor.business_name ? ` (${contractor.business_name})` : ''}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Customer</td><td style="padding:8px 0;color:#333;">${lead.name}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">City</td><td style="padding:8px 0;color:#333;">${lead.city}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Service</td><td style="padding:8px 0;color:#333;">${serviceLabels[lead.service_type] || lead.service_type}</td></tr>
            </table>
          </div>
          ${emailFooter}
        </div>
      `
    });
    console.log('Admin lead accepted notification sent');
  } catch (err) {
    console.error('Admin lead accepted notification failed:', err.message);
  }
}

// --- Contractor routing helpers ---

async function getNextContractor(region, excludeIds) {
  const result = await pool.query(
    `SELECT c.id, c.name, c.business_name, c.email, c.phone
     FROM contractor_zones cz
     JOIN contractors c ON c.id = cz.contractor_id
     WHERE cz.region = $1 AND c.active = true AND c.id != ALL($2)
     ORDER BY cz.priority ASC
     LIMIT 1`,
    [region, excludeIds.length > 0 ? excludeIds : [0]]
  );
  return result.rows[0] || null;
}

// --- Response page helper for accept/reject endpoints ---

function routingResponsePage(title, message, color) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Screen Fix Pro</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f0f8ff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 480px; width: 90%; overflow: hidden; }
    .header { background: #007BFF; padding: 20px 32px; }
    .header h1 { margin: 0; color: #fff; font-size: 20px; }
    .body { padding: 32px; }
    .body h2 { margin: 0 0 12px; font-size: 22px; color: ${color}; }
    .body p { margin: 0; color: #555; font-size: 15px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header"><h1>Screen Fix Pro</h1></div>
    <div class="body">
      <h2>${title}</h2>
      <p>${message}</p>
    </div>
  </div>
</body>
</html>`;
}

// --- Routes ---

app.post('/api/contractor-apply', async (req, res) => {
  const { name, business_name, email, phone, territories } = req.body;

  if (!name || !email || !territories) {
    return res.status(400).json({ error: 'Name, email, and territories are required' });
  }
  if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  try {
    await pool.query(
      `INSERT INTO contractor_applications(name, business_name, email, phone, territories)
       VALUES($1, $2, $3, $4, $5)`,
      [name, business_name || null, email, phone || null, territories]
    );

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.ADMIN_EMAIL,
      subject: `New contractor application: ${name}${business_name ? ` (${business_name})` : ''}`,
      html: `
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          ${emailHeader}
          <div style="padding:32px;">
            <h2 style="margin:0 0 20px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:18px;color:#333;">
              New Contractor Application
            </h2>
            <table style="width:100%;border-collapse:collapse;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;">
              <tr><td style="padding:8px 0;color:#888;width:130px;">Name</td><td style="padding:8px 0;color:#333;font-weight:600;">${name}</td></tr>
              ${business_name ? `<tr><td style="padding:8px 0;color:#888;">Business</td><td style="padding:8px 0;color:#333;">${business_name}</td></tr>` : ''}
              <tr><td style="padding:8px 0;color:#888;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#007BFF;">${email}</a></td></tr>
              ${phone ? `<tr><td style="padding:8px 0;color:#888;">Phone</td><td style="padding:8px 0;"><a href="tel:${phone}" style="color:#007BFF;">${phone}</a></td></tr>` : ''}
              <tr><td style="padding:8px 0;color:#888;vertical-align:top;">Territories</td><td style="padding:8px 0;color:#333;">${territories}</td></tr>
            </table>
          </div>
          ${emailFooter}
        </div>
      `
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Contractor application error:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

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
    INSERT INTO subscribers(name, email, phone_number, street_address, city, zipcode, service_type, job_description, region)
    VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (email) DO UPDATE
    SET name = EXCLUDED.name,
        phone_number = EXCLUDED.phone_number,
        street_address = EXCLUDED.street_address,
        city = EXCLUDED.city,
        zipcode = EXCLUDED.zipcode,
        service_type = EXCLUDED.service_type,
        job_description = EXCLUDED.job_description,
        region = EXCLUDED.region
    RETURNING *, (xmax = 0) AS is_insert;
  `;

  try {
    const result = await pool.query(insertQuery, [name, email, phone_number, street_address, city, zipcode, service_type, job_description || null, region || null]);
    const newSubscriber = result.rows[0];
    const isInsert = newSubscriber.is_insert;
    const lead = { ...newSubscriber, region };

    // Attempt contractor routing
    const contractor = await getNextContractor(region || 'main', []);

    if (contractor) {
      const token = require('crypto').randomUUID();
      await pool.query(
        `INSERT INTO lead_routing(lead_id, contractor_id, token) VALUES($1, $2, $3)`,
        [newSubscriber.id, contractor.id, token]
      );
      await Promise.all([
        sendLeadConfirmation(name, email, service_type),
        sendContractorLeadNotification(contractor, lead, token),
        sendAdminNotification(lead, isInsert)
      ]);
    } else {
      // No contractor for this region — fall back to admin
      await Promise.all([
        sendLeadConfirmation(name, email, service_type),
        sendAdminNotification(lead, isInsert)
      ]);
    }

    res.json({ success: true, action: isInsert ? 'inserted' : 'updated' });
  } catch (error) {
    console.error('Error processing subscriber:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/lead/accept', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.send(routingResponsePage('Invalid Link', 'This link is invalid or has expired.', '#c62828'));

  try {
    // Conditional update — only succeeds if still pending
    const updateResult = await pool.query(
      `UPDATE lead_routing SET status='accepted', responded_at=NOW()
       WHERE token=$1 AND status='pending' RETURNING *`,
      [token]
    );

    if (updateResult.rows.length === 0) {
      // Already handled — check current status
      const existing = await pool.query(`SELECT status FROM lead_routing WHERE token=$1`, [token]);
      if (!existing.rows.length) return res.send(routingResponsePage('Invalid Link', 'This link is invalid or has expired.', '#c62828'));
      const status = existing.rows[0].status;
      if (status === 'accepted') return res.send(routingResponsePage('Already Accepted', 'You already accepted this lead. Check your email for the customer details.', '#2e7d32'));
      return res.send(routingResponsePage('Lead Unavailable', 'This lead has already been routed to another contractor.', '#888'));
    }

    const routing = updateResult.rows[0];

    // Fetch lead and contractor in parallel
    const [leadResult, contractorResult] = await Promise.all([
      pool.query(`SELECT * FROM subscribers WHERE id=$1`, [routing.lead_id]),
      pool.query(`SELECT * FROM contractors WHERE id=$1`, [routing.contractor_id])
    ]);

    const lead = leadResult.rows[0];
    const contractor = contractorResult.rows[0];

    await Promise.all([
      sendContractorLeadDetails(contractor, lead),
      sendAdminLeadAccepted(contractor, lead)
    ]);

    res.send(routingResponsePage('Lead Accepted!', "Customer details have been sent to your email. Good luck with the job!", '#2e7d32'));
  } catch (err) {
    console.error('Accept endpoint error:', err.message);
    res.send(routingResponsePage('Error', 'Something went wrong. Please try again or contact info@screenfixpro.com.', '#c62828'));
  }
});

app.get('/api/lead/reject', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.send(routingResponsePage('Invalid Link', 'This link is invalid or has expired.', '#c62828'));

  try {
    const updateResult = await pool.query(
      `UPDATE lead_routing SET status='rejected', responded_at=NOW()
       WHERE token=$1 AND status='pending' RETURNING *`,
      [token]
    );

    if (updateResult.rows.length === 0) {
      const existing = await pool.query(`SELECT status FROM lead_routing WHERE token=$1`, [token]);
      if (!existing.rows.length) return res.send(routingResponsePage('Invalid Link', 'This link is invalid or has expired.', '#c62828'));
      return res.send(routingResponsePage('Already Responded', 'This lead has already been handled.', '#888'));
    }

    const routing = updateResult.rows[0];

    // Get all contractor IDs already tried for this lead
    const triedResult = await pool.query(
      `SELECT contractor_id FROM lead_routing WHERE lead_id=$1`,
      [routing.lead_id]
    );
    const triedIds = triedResult.rows.map(r => r.contractor_id);

    const leadResult = await pool.query(`SELECT * FROM subscribers WHERE id=$1`, [routing.lead_id]);
    const lead = leadResult.rows[0];

    const nextContractor = await getNextContractor(lead.region || 'main', triedIds);

    if (nextContractor) {
      const newToken = require('crypto').randomUUID();
      await pool.query(
        `INSERT INTO lead_routing(lead_id, contractor_id, token) VALUES($1, $2, $3)`,
        [routing.lead_id, nextContractor.id, newToken]
      );
      await sendContractorLeadNotification(nextContractor, lead, newToken);
      res.send(routingResponsePage('Lead Passed', 'No problem — the lead has been routed to the next available contractor.', '#555'));
    } else {
      // All contractors exhausted — notify admin
      await sendAdminNotification(lead, 'passed');
      res.send(routingResponsePage('Lead Passed', 'No problem — the owner has been notified to follow up directly.', '#555'));
    }
  } catch (err) {
    console.error('Reject endpoint error:', err.message);
    res.send(routingResponsePage('Error', 'Something went wrong. Please try again or contact info@screenfixpro.com.', '#c62828'));
  }
});

// --- Admin report endpoint ---

app.get('/api/report', async (req, res) => {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const [jobsResult, materialsResult, inventoryResult] = await Promise.all([
      pool.query(`
        SELECT
          j.id, j.status, j.completed_date, j.revenue, j.materials_cost,
          j.screens_count, j.job_type, j.payment_method, j.invoice_number, j.notes,
          s.name, s.email, s.phone_number, s.street_address, s.city, s.zipcode,
          s.service_type, s.job_description, s.created_at AS lead_date
        FROM jobs j
        JOIN subscribers s ON s.id = j.subscriber_id
        ORDER BY j.completed_date ASC
      `),
      pool.query(`
        SELECT * FROM materials_purchases ORDER BY purchase_date ASC
      `),
      pool.query(`
        SELECT COALESCE(SUM(amount), 0) AS total_spent FROM materials_purchases
      `)
    ]);

    const jobs = jobsResult.rows;
    const completedJobs = jobs.filter(j => j.status === 'completed');
    const totalRevenue = completedJobs.reduce((sum, j) => sum + parseFloat(j.revenue || 0), 0);
    const totalMaterialsSpent = parseFloat(inventoryResult.rows[0].total_spent);
    const grossProfit = totalRevenue - totalMaterialsSpent;

    res.json({
      jobs,
      materials: {
        purchases: materialsResult.rows,
        total_spent: totalMaterialsSpent
      },
      inventory: {
        screen_ft_on_hand: 75,
        spline_ft_on_hand: 75,
        replenishment_per_100ft: 66.50
      },
      summary: {
        total_revenue: totalRevenue,
        total_materials_spent: totalMaterialsSpent,
        gross_profit: grossProfit,
        gross_margin_pct: totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0,
        jobs_completed: completedJobs.length,
        jobs_turned_away: jobs.filter(j => j.status === 'turned_away').length,
        avg_revenue_per_job: completedJobs.filter(j => j.revenue > 0).length > 0
          ? Math.round(totalRevenue / completedJobs.filter(j => j.revenue > 0).length * 100) / 100
          : 0
      }
    });
  } catch (err) {
    console.error('Report endpoint error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- Admin API middleware ---

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// GET /api/jobs
app.get('/api/jobs', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT j.*, s.name, s.email, s.phone_number, s.city, s.street_address, s.zipcode,
             s.job_description, s.created_at AS lead_date
      FROM jobs j
      JOIN subscribers s ON s.id = j.subscriber_id
      ORDER BY j.completed_date DESC, j.id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/jobs error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/leads
app.get('/api/leads', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM subscribers ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/leads error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/jobs
app.post('/api/jobs', requireAdmin, async (req, res) => {
  const { subscriber_id, status, completed_date, revenue, materials_cost, screens_count, job_type, payment_method, invoice_number, notes } = req.body;
  if (!subscriber_id || !status) return res.status(400).json({ error: 'subscriber_id and status are required' });
  try {
    const result = await pool.query(
      `INSERT INTO jobs (subscriber_id, status, completed_date, revenue, materials_cost, screens_count, job_type, payment_method, invoice_number, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [subscriber_id, status, completed_date || null, revenue || null, materials_cost || null, screens_count || null, job_type || null, payment_method || null, invoice_number || null, notes || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('POST /api/jobs error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PATCH /api/jobs/:id
app.patch('/api/jobs/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status, completed_date, revenue, materials_cost, screens_count, job_type, payment_method, invoice_number, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE jobs SET status=$1, completed_date=$2, revenue=$3, materials_cost=$4,
        screens_count=$5, job_type=$6, payment_method=$7, invoice_number=$8, notes=$9
       WHERE id=$10 RETURNING *`,
      [status, completed_date || null, revenue || null, materials_cost || null, screens_count || null, job_type || null, payment_method || null, invoice_number || null, notes || null, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Job not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PATCH /api/jobs error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/jobs/:id
app.delete('/api/jobs/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM jobs WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Job not found' });
    res.json({ deleted: result.rows[0].id });
  } catch (err) {
    console.error('DELETE /api/jobs error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = app;
