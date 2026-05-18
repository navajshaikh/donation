const express = require('express');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const dayjs = require('dayjs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3100;
const IS_VERCEL = process.env.VERCEL === '1';
const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
const HAS_DATABASE = Boolean(DATABASE_URL);

const EXCEL_FILE = path.join(__dirname, 'Donation Box Master List.xlsx');
const DATA_DIR = path.join(__dirname, 'data');
const DONATION_FILE = path.join(DATA_DIR, 'donations.json');
let pool;

function getPool() {
  if (!HAS_DATABASE) {
    return null;
  }
  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: IS_VERCEL ? { rejectUnauthorized: false } : false,
      max: IS_VERCEL ? 2 : 10,
      idleTimeoutMillis: IS_VERCEL ? 10000 : 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

async function ensureDonationTable() {
  const db = getPool();
  if (!db) {
    return;
  }
  await db.query(`
    CREATE TABLE IF NOT EXISTS donations (
      donor_id TEXT NOT NULL,
      box_no TEXT NOT NULL DEFAULT '',
      month TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL,
      paid_on TEXT NOT NULL,
      method TEXT NOT NULL,
      agent TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (donor_id, month)
    );
  `);
}

if (IS_VERCEL && !global.__DONATION_ENTRIES__) {
  global.__DONATION_ENTRIES__ = [];
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

function ensureDataFile() {
  if (IS_VERCEL) {
    return;
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DONATION_FILE)) {
    fs.writeFileSync(DONATION_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return digits;
}

function isValidMonth(month) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

function detectHeaderRow(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    const firstCell = normalizeText(rows[i][0]).toLowerCase();
    if (firstCell === 'box no' || firstCell === 'box no.') {
      return i;
    }
  }
  return -1;
}

function loadDonors() {
  if (!fs.existsSync(EXCEL_FILE)) {
    throw new Error('Excel file not found. Place Donation Box Master List.xlsx in project root.');
  }

  const workbook = xlsx.readFile(EXCEL_FILE);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const headerRow = detectHeaderRow(rows);

  if (headerRow < 0) {
    throw new Error('Could not find header row (Box No) in Excel.');
  }

  const donorsByBox = new Map();
  let unboxedCounter = 0;

  for (let i = headerRow + 1; i < rows.length; i += 1) {
    const row = rows[i];

    const boxNo = normalizeText(row[0]);
    const name = normalizeText(row[1]);
    const street = normalizeText(row[2]);
    const area = normalizeText(row[3]);
    const city = normalizeText(row[4]);
    const mobile = normalizePhone(row[5]);

    if (!boxNo && !name && !street && !area && !city && !mobile) {
      continue;
    }

    if (!name) {
      continue;
    }

    let finalBoxNo = boxNo;
    if (!boxNo || Number.isNaN(Number(boxNo))) {
      finalBoxNo = `no-box-${unboxedCounter}`;
      unboxedCounter += 1;
    }

    donorsByBox.set(finalBoxNo, {
      boxNo: boxNo || '',
      name,
      street,
      area,
      city,
      mobile,
      internalId: finalBoxNo,
    });
  }

  return Array.from(donorsByBox.values()).sort((a, b) => {
    const aNum = Number(a.boxNo) || Infinity;
    const bNum = Number(b.boxNo) || Infinity;
    return aNum - bNum;
  });
}

async function loadDonationEntries() {
  if (HAS_DATABASE) {
    await ensureDonationTable();
    const db = getPool();
    const result = await db.query(`
      SELECT
        donor_id AS "donorId",
        box_no AS "boxNo",
        month,
        amount,
        paid_on AS "paidOn",
        method,
        agent,
        notes,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM donations
    `);

    return result.rows.map((row) => ({
      ...row,
      amount: Number(row.amount) || 0,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : '',
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
    }));
  }

  if (IS_VERCEL) {
    return Array.isArray(global.__DONATION_ENTRIES__) ? global.__DONATION_ENTRIES__ : [];
  }
  ensureDataFile();
  const raw = fs.readFileSync(DONATION_FILE, 'utf8');
  const parsed = JSON.parse(raw || '[]');
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed;
}

async function saveDonationEntries(entries) {
  if (HAS_DATABASE) {
    await ensureDonationTable();
    const db = getPool();
    const values = Array.isArray(entries) ? entries : [];

    await db.query('BEGIN');
    try {
      await db.query('DELETE FROM donations');
      for (const row of values) {
        await db.query(
          `
            INSERT INTO donations (
              donor_id, box_no, month, amount, paid_on, method, agent, notes, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()), COALESCE($10::timestamptz, NOW()))
          `,
          [
            normalizeText(row.donorId),
            normalizeText(row.boxNo),
            normalizeText(row.month),
            Number(row.amount) || 0,
            normalizeText(row.paidOn),
            normalizeText(row.method),
            normalizeText(row.agent),
            normalizeText(row.notes),
            normalizeText(row.createdAt) || null,
            normalizeText(row.updatedAt) || null,
          ]
        );
      }
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    return;
  }

  if (IS_VERCEL) {
    global.__DONATION_ENTRIES__ = Array.isArray(entries) ? entries : [];
    return;
  }
  fs.writeFileSync(DONATION_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

async function upsertDonationEntry(payload) {
  if (HAS_DATABASE) {
    await ensureDonationTable();
    const db = getPool();
    await db.query(
      `
        INSERT INTO donations (
          donor_id, box_no, month, amount, paid_on, method, agent, notes, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        ON CONFLICT (donor_id, month)
        DO UPDATE SET
          box_no = EXCLUDED.box_no,
          amount = EXCLUDED.amount,
          paid_on = EXCLUDED.paid_on,
          method = EXCLUDED.method,
          agent = EXCLUDED.agent,
          notes = EXCLUDED.notes,
          updated_at = NOW()
      `,
      [
        normalizeText(payload.donorId),
        normalizeText(payload.boxNo),
        normalizeText(payload.month),
        Number(payload.amount) || 0,
        normalizeText(payload.paidOn),
        normalizeText(payload.method),
        normalizeText(payload.agent),
        normalizeText(payload.notes),
      ]
    );
    return;
  }

  const entries = await loadDonationEntries();
  const existingIndex = entries.findIndex((e) => entryMatchKey(e) === payload.donorId && e.month === payload.month);

  if (existingIndex >= 0) {
    entries[existingIndex] = {
      ...entries[existingIndex],
      ...payload,
      updatedAt: new Date().toISOString(),
    };
  } else {
    entries.push({
      ...payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  await saveDonationEntries(entries);
}

async function deleteDonationEntry(donorRef, month) {
  if (HAS_DATABASE) {
    await ensureDonationTable();
    const db = getPool();
    await db.query(
      `
        DELETE FROM donations
        WHERE (donor_id = $1 OR box_no = $1)
          AND month = $2
      `,
      [normalizeText(donorRef), normalizeText(month)]
    );
    return;
  }

  const entries = await loadDonationEntries();
  const filtered = entries.filter((e) => !(entryMatchKey(e) === donorRef && e.month === month));
  await saveDonationEntries(filtered);
}

async function importLocalDonationsToDatabase() {
  if (!HAS_DATABASE) {
    throw new Error('DATABASE_URL is not configured.');
  }
  if (!fs.existsSync(DONATION_FILE)) {
    return { imported: 0, skipped: 0 };
  }

  const raw = fs.readFileSync(DONATION_FILE, 'utf8');
  const parsed = JSON.parse(raw || '[]');
  const rows = Array.isArray(parsed) ? parsed : [];

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const donorId = normalizeText(row.donorId) || normalizeText(row.boxNo);
    const month = normalizeText(row.month);
    const paidOn = normalizeText(row.paidOn);
    const amount = Number(row.amount);

    if (!donorId || !isValidMonth(month) || Number.isNaN(amount) || !paidOn) {
      skipped += 1;
      continue;
    }

    await upsertDonationEntry({
      donorId,
      boxNo: normalizeText(row.boxNo),
      month,
      amount,
      paidOn,
      method: normalizeText(row.method) || 'cash',
      agent: normalizeText(row.agent) || 'Unassigned',
      notes: normalizeText(row.notes),
    });
    imported += 1;
  }

  return { imported, skipped };
}

function donorMatchKey(donor) {
  return normalizeText(donor.internalId) || normalizeText(donor.boxNo);
}

function entryMatchKey(entry) {
  return normalizeText(entry.donorId) || normalizeText(entry.boxNo);
}

async function buildMonthData(month) {
  const donors = loadDonors();
  const entries = await loadDonationEntries();

  const monthEntries = entries.filter((e) => e.month === month);
  const entryByBox = new Map(monthEntries.map((e) => [entryMatchKey(e), e]));

  const paid = [];
  const pending = [];

  donors.forEach((donor) => {
    const found = entryByBox.get(donorMatchKey(donor));
    if (found) {
      paid.push({
        ...donor,
        amount: Number(found.amount) || 0,
        paidOn: found.paidOn || '',
        method: found.method || '',
        agent: found.agent || 'Unassigned',
        notes: found.notes || '',
      });
    } else {
      pending.push(donor);
    }
  });

  const totalAmount = paid.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  return {
    month,
    totalDonors: donors.length,
    paidCount: paid.length,
    pendingCount: pending.length,
    totalAmount,
    paid,
    pending,
  };
}

async function buildAgentPerformance(month) {
  const data = await buildMonthData(month);
  const grouped = new Map();

  data.paid.forEach((row) => {
    const agent = normalizeText(row.agent) || 'Unassigned';
    const current = grouped.get(agent) || {
      agent,
      collectedCount: 0,
      totalAmount: 0,
      lastPaidOn: '',
    };

    current.collectedCount += 1;
    current.totalAmount += Number(row.amount) || 0;
    if (row.paidOn && (!current.lastPaidOn || row.paidOn > current.lastPaidOn)) {
      current.lastPaidOn = row.paidOn;
    }

    grouped.set(agent, current);
  });

  const rows = Array.from(grouped.values())
    .map((r) => ({
      ...r,
      averageAmount: r.collectedCount > 0 ? Number((r.totalAmount / r.collectedCount).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  return {
    month,
    totalCollections: data.paidCount,
    totalAmount: data.totalAmount,
    totalAgents: rows.length,
    rows,
  };
}

async function buildReceipt(month, boxNo) {
  const data = await buildMonthData(month);
  const receipt = data.paid.find((item) => String(item.boxNo) === String(boxNo));
  if (!receipt) {
    return null;
  }

  return {
    receiptNo: `${month.replace('-', '')}-${String(receipt.boxNo).padStart(4, '0')}`,
    month,
    issuedAt: new Date().toISOString(),
    donor: {
      boxNo: receipt.boxNo,
      name: receipt.name,
      street: receipt.street,
      area: receipt.area,
      city: receipt.city,
      mobile: receipt.mobile,
    },
    payment: {
      amount: Number(receipt.amount) || 0,
      paidOn: receipt.paidOn,
      method: receipt.method || 'cash',
      agent: receipt.agent || 'Unassigned',
      notes: receipt.notes || '',
    },
    organization: {
      name: 'Rahman Foundation Sangli',
      title: 'Donation Collection Receipt',
    },
  };
}

function composeReminderMessage(donor, month, customTemplate) {
  const baseTemplate = customTemplate || 'Assalamu Alaikum {name}, this is a kind reminder for your donation box (Box #{boxNo}) for {month}. Please keep your donation ready. Thank you.';
  return baseTemplate
    .replaceAll('{name}', donor.name || 'Donor')
    .replaceAll('{boxNo}', donor.boxNo)
    .replaceAll('{month}', month);
}

function toWhatsAppUrl(phone, message) {
  if (!phone) {
    return '';
  }
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function toSmsUrl(phone, message) {
  if (!phone) {
    return '';
  }
  return `sms:${phone}?body=${encodeURIComponent(message)}`;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, at: new Date().toISOString() });
});

app.post('/api/admin/import-local', async (_req, res) => {
  try {
    if (!HAS_DATABASE) {
      return res.status(400).json({ error: 'DATABASE_URL is not configured.' });
    }

    const result = await importLocalDonationsToDatabase();
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/month/default', (_req, res) => {
  res.json({ month: dayjs().format('YYYY-MM') });
});

app.get('/api/donors', async (req, res) => {
  try {
    const month = normalizeText(req.query.month) || dayjs().format('YYYY-MM');
    if (!isValidMonth(month)) {
      return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM.' });
    }

    const data = await buildMonthData(month);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/donations', async (req, res) => {
  try {
    const donorRef = normalizeText(req.body.boxNo);
    const month = normalizeText(req.body.month);
    const amount = Number(req.body.amount);
    const paidOn = normalizeText(req.body.paidOn) || dayjs().format('YYYY-MM-DD');
    const method = normalizeText(req.body.method) || 'cash';
    const agent = normalizeText(req.body.agent) || 'Unassigned';
    const notes = normalizeText(req.body.notes);

    if (!donorRef) {
      return res.status(400).json({ error: 'Invalid donor reference.' });
    }
    if (!isValidMonth(month)) {
      return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM.' });
    }
    if (Number.isNaN(amount) || amount < 0) {
      return res.status(400).json({ error: 'Invalid amount.' });
    }

    const donors = loadDonors();
    const matchedDonor = donors.find((d) => donorMatchKey(d) === donorRef || normalizeText(d.boxNo) === donorRef);
    if (!matchedDonor) {
      return res.status(400).json({ error: 'Donor not found in master list.' });
    }

    const matchedKey = donorMatchKey(matchedDonor);

    const payload = {
      donorId: matchedKey,
      boxNo: normalizeText(matchedDonor.boxNo),
      month,
      amount,
      paidOn,
      method,
      agent,
      notes,
      updatedAt: new Date().toISOString(),
    }

    await upsertDonationEntry(payload);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/donations/:boxNo', async (req, res) => {
  try {
    const donorRef = normalizeText(req.params.boxNo);
    const month = normalizeText(req.query.month);

    if (!donorRef) {
      return res.status(400).json({ error: 'Invalid donor reference.' });
    }
    if (!isValidMonth(month)) {
      return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM.' });
    }

    await deleteDonationEntry(donorRef, month);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/agents', async (req, res) => {
  try {
    const month = normalizeText(req.query.month) || dayjs().format('YYYY-MM');
    if (!isValidMonth(month)) {
      return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM.' });
    }

    return res.json(await buildAgentPerformance(month));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/export/agents.csv', async (req, res) => {
  try {
    const month = normalizeText(req.query.month) || dayjs().format('YYYY-MM');
    if (!isValidMonth(month)) {
      return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM.' });
    }

    const data = await buildMonthData(month);
    const collectedRows = data.paid.filter((row) => Number(row.amount) > 0);
    
    // Group by date
    const byDate = {};
    collectedRows.forEach((row) => {
      const date = normalizeText(row.paidOn) || 'Unknown';
      if (!byDate[date]) {
        byDate[date] = { date, amount: 0, agent: row.agent };
      }
      byDate[date].amount += Number(row.amount) || 0;
    });
    
    const rows = [
      ['Collection Date', 'Amount', 'Agent'],
      ...Object.values(byDate)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map((row) => [
          row.date,
          row.amount,
          row.agent || 'Unassigned',
        ]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="daily-collection-${month}.csv"`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/export/zero-donation.csv', async (req, res) => {
  try {
    const month = normalizeText(req.query.month) || dayjs().format('YYYY-MM');
    if (!isValidMonth(month)) {
      return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM.' });
    }

    const data = await buildMonthData(month);
    const zeroRows = data.paid.filter((row) => Number(row.amount) === 0);
    const rows = [
      ['Box No', 'Name', 'City', 'Mobile', 'Amount', 'Paid On', 'Agent', 'Notes'],
      ...zeroRows.map((row) => [
        row.boxNo,
        row.name,
        row.city,
        row.mobile,
        Number(row.amount) || 0,
        row.paidOn || '',
        row.agent || 'Unassigned',
        row.notes || '',
      ]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="zero-donation-${month}.csv"`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/export/collected.csv', async (req, res) => {
  try {
    const month = normalizeText(req.query.month) || dayjs().format('YYYY-MM');
    if (!isValidMonth(month)) {
      return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM.' });
    }

    const data = await buildMonthData(month);
    const collectedRows = data.paid.filter((row) => Number(row.amount) > 0);
    const rows = [
      ['Box No', 'Name', 'City', 'Mobile', 'Amount', 'Paid On', 'Method', 'Agent', 'Notes'],
      ...collectedRows.map((row) => [
        row.boxNo,
        row.name,
        row.city,
        row.mobile,
        Number(row.amount) || 0,
        row.paidOn || '',
        row.method || 'cash',
        row.agent || 'Unassigned',
        row.notes || '',
      ]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="collected-donations-${month}.csv"`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/receipt/:boxNo', async (req, res) => {
  try {
    const month = normalizeText(req.query.month);
    const boxNo = normalizeText(req.params.boxNo);

    if (!isValidMonth(month)) {
      return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM.' });
    }
    if (!boxNo || Number.isNaN(Number(boxNo))) {
      return res.status(400).json({ error: 'Invalid box number.' });
    }

    const receipt = await buildReceipt(month, String(Number(boxNo)));
    if (!receipt) {
      return res.status(404).json({ error: 'No donation found for this donor in selected month.' });
    }

    return res.json(receipt);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/reminders', async (req, res) => {
  try {
    const month = normalizeText(req.query.month) || dayjs().format('YYYY-MM');
    const template = normalizeText(req.query.template);

    if (!isValidMonth(month)) {
      return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM.' });
    }

    const data = await buildMonthData(month);
    const reminders = data.pending.map((donor) => {
      const message = composeReminderMessage(donor, month, template);
      return {
        ...donor,
        message,
        whatsappUrl: toWhatsAppUrl(donor.mobile, message),
        smsUrl: toSmsUrl(donor.mobile, message),
      };
    });

    return res.json({ month, total: reminders.length, reminders });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/export/reminders.csv', async (req, res) => {
  try {
    const month = normalizeText(req.query.month) || dayjs().format('YYYY-MM');
    const template = normalizeText(req.query.template);

    if (!isValidMonth(month)) {
      return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM.' });
    }

    const data = await buildMonthData(month);
    const rows = [
      ['Box No', 'Name', 'Mobile', 'Area', 'City', 'Message', 'WhatsApp URL', 'SMS URL'],
      ...data.pending.map((donor) => {
        const message = composeReminderMessage(donor, month, template).replace(/\r?\n/g, ' ');
        return [
          donor.boxNo,
          donor.name,
          donor.mobile,
          donor.area,
          donor.city,
          message,
          toWhatsAppUrl(donor.mobile, message),
          toSmsUrl(donor.mobile, message),
        ];
      }),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell || '').replaceAll('"', '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="donation-reminders-${month}.csv"`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    ensureDataFile();
    console.log(`Donation site running at http://localhost:${PORT}`);
  });
}

module.exports = app;
