-- Run this in the Vercel Postgres dashboard Query tab

CREATE TABLE IF NOT EXISTS jobs (
  id                SERIAL PRIMARY KEY,
  subscriber_id     INTEGER REFERENCES subscribers(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'completed', -- completed | turned_away
  completed_date    DATE,
  revenue           DECIMAL(10,2),
  materials_cost    DECIMAL(10,2),
  screens_count     INTEGER,
  job_type          VARCHAR(20),  -- window | door | mixed | repair
  payment_method    VARCHAR(20),  -- check | cash | venmo | card
  invoice_number    VARCHAR(30),
  notes             TEXT,
  created_at        TIMESTAMP DEFAULT NOW()
);

-- Index for quick lookup by subscriber
CREATE INDEX IF NOT EXISTS idx_jobs_subscriber ON jobs(subscriber_id);

-- Materials as a business-level pool (not per-job allocation)
CREATE TABLE IF NOT EXISTS materials_purchases (
  id            SERIAL PRIMARY KEY,
  purchase_date DATE NOT NULL,
  vendor        VARCHAR(100),
  amount        DECIMAL(10,2) NOT NULL,
  description   TEXT,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Known receipts to date
INSERT INTO materials_purchases (purchase_date, vendor, amount, description) VALUES
  ('2026-04-18', 'Ace Hardware', 66.25, 'Screen + spline — first bulk purchase (two receipts 4/18–4/19, smallest qty available)'),
  ('2026-05-12', 'Unknown',      43.07, 'Materials for Cavanaugh deck slider door'),
  ('2026-05-17', 'Home Depot',  102.89, 'Screen + spline for Kruger job (4 doors + 2 windows)'),
  ('2026-05-19', 'Amazon',       55.99, 'Additional screen/spline for Kruger job'),
  ('2026-06-16', 'Home Depot',   22.72, 'Materials for Stutelberg 20-screen job');

-- Replenishment reference (not a purchase yet — update when you buy)
-- 100ft screen: $56.00 | 100ft spline: $10.50 | kit total: $66.50/100ft
