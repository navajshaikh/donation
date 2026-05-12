# Donation Box Tracker

A lightweight monthly donation collection site for home donation boxes with agent-wise performance tracking.

## Features
- Imports donor list from `Donation Box Master List.xlsx`
- Monthly total donation amount
- Paid donor list with amount and date
- Pending donor list (not donated this month)
- Add or update monthly donation entry by box number
- **Collect By Agent** field to track which agent collected each donation
- Remove wrong donation entry
- **Agent Monthly Performance Report** with metrics per collector
- **Printable Donation Receipt** with full donor and payment details
- WhatsApp reminder link per pending donor
- SMS reminder link per pending donor
- Copy reminder text
- Export pending reminders to CSV
- Export agent performance report to CSV
- Search in paid and pending lists

## Excel Format
The app auto-detects the row containing `Box No` and reads these columns:
- Box No
- Name
- Street/Galli
- Area
- City
- Mobile Number

## Run
1. Open terminal in this folder.
2. Install dependencies:
   npm install
3. Start server:
   npm start
4. Open:
   http://localhost:3100

## Vercel (Free, No DB)
This project is now Vercel-compatible using `vercel.json` and `api/index.cjs`.

Important behavior:
- Local run: donations are saved to `data/donations.json`.
- Vercel run: donations are stored in memory (no paid DB required), so data can reset after redeploy/cold start.

Deploy steps:
1. Push folder to GitHub.
2. Import the repo in Vercel.
3. Framework preset: Other.
4. Deploy.

## New Features (v2)

### Agent Wise Monthly Performance (Point 2)
- When saving a donation, enter the agent/collector name in the **"Collected By Agent"** field.
- View complete **Agent Monthly Performance** table showing:
  - Agent name
  - Count of donors collected
  - Total amount collected
  - Average donation per donor
  - Last collection date
- Download agent report as CSV for record-keeping and performance analysis.

### Printable Donation Receipt (Point 3)
- Click **"Print Receipt"** button on any paid donor row.
- A formatted receipt window opens in your browser showing:
  - Receipt number (format: YYYYMM-BOXNO)
  - Organization name (Rahman Foundation Sangli)
  - Donor full address and contact
  - Payment amount and method
  - Collection date and agent name
  - Notes
  - Signature line for authorization
- Use browser print feature (Ctrl+P / Cmd+P) to save as PDF or print physically.
- Receipts can be given to donors or archived for auditing.

## Data Storage
- Monthly collections are stored in `data/donations.json`.
- Excel file remains your donor master source.

## Notes
- WhatsApp/SMS are provided as click-to-send links from browser.
- For automated bulk sending, integrate Twilio or WhatsApp Cloud API later.
- Agent field defaults to "Unassigned" if left empty.

