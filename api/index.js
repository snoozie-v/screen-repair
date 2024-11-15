const express = require('express');
const app = express();
const dotenv = require('dotenv')
dotenv.config();

const port = 3001
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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

// const db = new pg.Client({
//     user: process.env.DB_USER,
//     host: process.env.DB_HOST,
//     database: process.env.DB_NAME,
//     password: process.env.DB_PASSWORD,
//     port: process.env.DB_PORT,
// });

// db.connect();

async function checkEmails() {
    const emailQuery = 'SELECT name, email FROM subscribers';
    try {
      const result = await pool.query(emailQuery);
      const subscribers = result.rows.map(row => ({ name: row.name, email: row.email }));
      return subscribers;
    } catch (error) {
      console.error('Error executing query', error);
      throw error;
    }
  }

app.get("/", async (req, res) => {
    const currentDate = new Date();
    console.log(`get request received${currentDate}`)
    try {
      const subscribers = await checkEmails();
      res.json(subscribers);
    } catch (error) {
      console.error('Error in / route', error);
      res.status(500).json({ error: 'Could not retrieve subscriber information' });
  }
    })

    app.post('/add-email', async (req, res) => {
      console.log('Received POST request:', req.body)
      const {name, email} = req.body
  
      const insertSubscriberQuery = 'INSERT INTO subscribers(name, email) VALUES($1, $2) RETURNING *';
      try {
          const result = await pool.query(insertSubscriberQuery, [name, email]);
          const newEmail = result.rows[0].email;
          res.json({ success: true, newEmail });
      } catch (error) {
          console.error('Error adding new subscriber:', error.message);
          res.status(500).json({ error: 'Internal Server Error' });
      }
  });

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });