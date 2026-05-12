const monthPicker = document.getElementById('monthPicker');
const refreshBtn = document.getElementById('refreshBtn');
const donationForm = document.getElementById('donationForm');
const formMessage = document.getElementById('formMessage');

const totalAmountEl = document.getElementById('totalAmount');
const totalDonorsEl = document.getElementById('totalDonors');
const paidCountEl = document.getElementById('paidCount');
const pendingCountEl = document.getElementById('pendingCount');

const paidTable = document.getElementById('paidTable');
const pendingTableWithBox = document.getElementById('pendingTableWithBox');
const pendingTableWithoutBox = document.getElementById('pendingTableWithoutBox');
const withBoxContainer = document.getElementById('withBoxContainer');
const withoutBoxContainer = document.getElementById('withoutBoxContainer');
const tabWithBox = document.getElementById('tabWithBox');
const tabWithoutBox = document.getElementById('tabWithoutBox');
const paidSearch = document.getElementById('paidSearch');
const pendingSearch = document.getElementById('pendingSearch');

const boxNoSelect = document.getElementById('boxNo');
const amountInput = document.getElementById('amount');
const paidOnInput = document.getElementById('paidOn');
const methodInput = document.getElementById('method');
const agentInput = document.getElementById('agent');
const notesInput = document.getElementById('notes');

const templateInput = document.getElementById('template');
const copyTemplateBtn = document.getElementById('copyTemplateBtn');
const downloadCsv = document.getElementById('downloadCsv');
const downloadAgentCsv = document.getElementById('downloadAgentCsv');
const agentTable = document.getElementById('agentTable');

let latestData = null;
let latestReminders = [];
let latestAgentReport = null;
let currentPendingTab = 'withBox';

function esc(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function setMessage(msg, isError = false) {
  formMessage.textContent = msg;
  formMessage.style.color = isError ? '#b91c1c' : '#0b6e4f';
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Request failed');
  }
  return body;
}

function renderSummary(data) {
  totalAmountEl.textContent = `Rs ${Number(data.totalAmount || 0).toLocaleString('en-IN')}`;
  totalDonorsEl.textContent = String(data.totalDonors || 0);
  paidCountEl.textContent = String(data.paidCount || 0);
  pendingCountEl.textContent = String(data.pendingCount || 0);
}

function renderBoxOptions(data) {
  const paidMap = new Map(data.paid.map((d) => [String(d.boxNo) || d.internalId, d]));
  const all = [...data.paid, ...data.pending].sort((a, b) => {
    const aNum = Number(a.boxNo) || Infinity;
    const bNum = Number(b.boxNo) || Infinity;
    return aNum - bNum;
  });

  boxNoSelect.innerHTML = all
    .map((d) => {
      const paid = paidMap.get(String(d.boxNo) || d.internalId);
      const boxDisplay = d.boxNo || '(No Box)';
      const paidText = paid ? ` | Paid Rs ${Number(paid.amount || 0).toLocaleString('en-IN')}` : ' | Pending';
      const selectValue = d.boxNo || d.internalId || '';
      return `<option value="${esc(selectValue)}">Box ${esc(boxDisplay)} - ${esc(d.name)}${esc(paidText)}</option>`;
    })
    .join('');
}

function matchesSearch(rowText, term) {
  return rowText.toLowerCase().includes(term.toLowerCase());
}

function renderPaidTable(search = '') {
  const rows = (latestData?.paid || []).filter((d) => {
    if (!search.trim()) return true;
    const indexText = `${d.boxNo} ${d.name} ${d.city} ${d.area} ${d.mobile} ${d.agent || ''}`;
    return matchesSearch(indexText, search);
  });

  paidTable.innerHTML = rows
    .map(
      (d) => `
      <tr>
        <td>${esc(d.boxNo || '-')}</td>
        <td>${esc(d.name)}</td>
        <td>${esc(d.city)}</td>
        <td>${esc(d.mobile || '-')}</td>
        <td>Rs ${Number(d.amount || 0).toLocaleString('en-IN')}</td>
        <td>${esc(d.paidOn || '-')}</td>
        <td>${esc(d.agent || 'Unassigned')}</td>
        <td>
          <div class="small-links">
            <a href="#" onclick="printReceipt('${esc(d.boxNo)}'); return false;">Print Receipt</a>
            <a href="#" onclick="removeDonation('${esc(d.internalId || d.boxNo)}'); return false;">Remove</a>
          </div>
        </td>
      </tr>
    `
    )
    .join('');
}

function renderAgentTable() {
  const rows = latestAgentReport?.rows || [];
  agentTable.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td>${esc(r.agent)}</td>
        <td>${Number(r.collectedCount || 0)}</td>
        <td>Rs ${Number(r.totalAmount || 0).toLocaleString('en-IN')}</td>
        <td>Rs ${Number(r.averageAmount || 0).toLocaleString('en-IN')}</td>
        <td>${esc(r.lastPaidOn || '-')}</td>
      </tr>
    `
    )
    .join('');
}

function renderPendingTable(search = '') {
  const reminderMap = new Map(latestReminders.map((d) => [String(d.boxNo) || d.internalId, d]));
  const allPending = latestData?.pending || [];
  
  const withBox = allPending.filter(d => d.boxNo && d.boxNo.trim() !== '');
  const withoutBox = allPending.filter(d => !d.boxNo || d.boxNo.trim() === '');

  const renderTable = (rows, tableEl, isWithBox) => {
    const filtered = rows.filter((d) => {
      if (!search.trim()) return true;
      const indexText = `${d.boxNo || ''} ${d.name} ${d.city} ${d.area} ${d.mobile}`;
      return matchesSearch(indexText, search);
    });

    tableEl.innerHTML = filtered
      .map((d) => {
        const rem = reminderMap.get(String(d.boxNo) || d.internalId);
        const wa = rem?.whatsappUrl ? `<a href="${esc(rem.whatsappUrl)}" target="_blank" rel="noopener">WhatsApp</a>` : '';
        const sms = rem?.smsUrl ? `<a href="${esc(rem.smsUrl)}">SMS</a>` : '';
        
        if (isWithBox) {
          return `
          <tr>
            <td>${esc(d.boxNo)}</td>
            <td>${esc(d.name)}</td>
            <td>${esc(d.city)}</td>
            <td>${esc(d.mobile || '-')}</td>
            <td><div class="small-links">${wa}${sms}</div></td>
          </tr>
        `;
        } else {
          return `
          <tr>
            <td>${esc(d.name)}</td>
            <td>${esc(d.city)}</td>
            <td>${esc(d.mobile || '-')}</td>
            <td><div class="small-links">${wa}${sms}</div></td>
          </tr>
        `;
        }
      })
      .join('');
  };

  renderTable(withBox, pendingTableWithBox, true);
  renderTable(withoutBox, pendingTableWithoutBox, false);
}

async function loadData() {
  const month = monthPicker.value;
  const template = encodeURIComponent(templateInput.value.trim());

  const [donorData, reminderData, agentReport] = await Promise.all([
    fetchJson(`/api/donors?month=${month}`),
    fetchJson(`/api/reminders?month=${month}&template=${template}`),
    fetchJson(`/api/reports/agents?month=${month}`),
  ]);

  latestData = donorData;
  latestReminders = reminderData.reminders || [];
  latestAgentReport = agentReport;

  renderSummary(donorData);
  renderBoxOptions(donorData);
  renderPaidTable(paidSearch.value);
  renderPendingTable(pendingSearch.value);
  renderAgentTable();

  downloadCsv.href = `/api/export/reminders.csv?month=${month}&template=${template}`;
  downloadAgentCsv.href = `/api/export/agents.csv?month=${month}`;
}

window.removeDonation = async function removeDonation(donorRef) {
  const box = donorRef || 'Unknown';
  if (!confirm(`Remove donation for ${box} in ${monthPicker.value}?`)) {
    return;
  }

  try {
    await fetchJson(`/api/donations/${encodeURIComponent(donorRef)}?month=${monthPicker.value}`, { method: 'DELETE' });
    setMessage(`Removed donation for ${box}.`);
    await loadData();
  } catch (error) {
    setMessage(error.message, true);
  }
};

window.copyReminder = async function copyReminder(boxNo) {
  const reminder = latestReminders.find((r) => String(r.boxNo) === String(boxNo));
  if (!reminder) {
    return;
  }

  await navigator.clipboard.writeText(reminder.message);
  setMessage(`Reminder copied for Box ${boxNo}.`);
};

window.printReceipt = async function printReceipt(boxNo) {
  try {
    if (!boxNo || boxNo.trim() === '') {
      setMessage('Cannot print receipt: No box number assigned.', true);
      return;
    }
    const receipt = await fetchJson(`/api/receipt/${boxNo}?month=${monthPicker.value}`);
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      setMessage('Pop-up blocked. Please allow pop-ups to print receipt.', true);
      return;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${esc(receipt.receiptNo)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
    .card { border: 2px solid #0b6e4f; border-radius: 8px; padding: 18px; max-width: 760px; }
    h1 { margin: 0 0 6px; color: #0b6e4f; }
    h2 { margin: 0 0 14px; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    td { border: 1px solid #d1d5db; padding: 8px; vertical-align: top; }
    .label { width: 28%; font-weight: bold; background: #f9fafb; }
    .row { display: flex; justify-content: space-between; margin-top: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${esc(receipt.organization.name)}</h1>
    <h2>${esc(receipt.organization.title)}</h2>
    <div class="row"><span>Receipt No: ${esc(receipt.receiptNo)}</span><span>Month: ${esc(receipt.month)}</span></div>
    <table>
      <tr><td class="label">Box Number</td><td>${esc(receipt.donor.boxNo)}</td></tr>
      <tr><td class="label">Donor Name</td><td>${esc(receipt.donor.name)}</td></tr>
      <tr><td class="label">Address</td><td>${esc(receipt.donor.street)}, ${esc(receipt.donor.area)}, ${esc(receipt.donor.city)}</td></tr>
      <tr><td class="label">Mobile</td><td>${esc(receipt.donor.mobile || '-')}</td></tr>
      <tr><td class="label">Amount</td><td>Rs ${Number(receipt.payment.amount || 0).toLocaleString('en-IN')}</td></tr>
      <tr><td class="label">Paid On</td><td>${esc(receipt.payment.paidOn || '-')}</td></tr>
      <tr><td class="label">Method</td><td>${esc(receipt.payment.method || '-')}</td></tr>
      <tr><td class="label">Collected By</td><td>${esc(receipt.payment.agent || 'Unassigned')}</td></tr>
      <tr><td class="label">Notes</td><td>${esc(receipt.payment.notes || '-')}</td></tr>
    </table>
    <div class="row"><span>Issued At: ${new Date(receipt.issuedAt).toLocaleString()}</span><span>Authorized Signature: _____________________</span></div>
  </div>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    setMessage(error.message, true);
  }
};

refreshBtn.addEventListener('click', async () => {
  try {
    await loadData();
    setMessage('Data refreshed.');
  } catch (error) {
    setMessage(error.message, true);
  }
});

copyTemplateBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(templateInput.value.trim());
  setMessage('Template copied.');
});

donationForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    boxNo: boxNoSelect.value,
    month: monthPicker.value,
    amount: Number(amountInput.value),
    paidOn: paidOnInput.value,
    method: methodInput.value,
    agent: agentInput.value,
    notes: notesInput.value,
  };

  try {
    await fetchJson('/api/donations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setMessage(`Saved collection for Box ${payload.boxNo}.`);
    amountInput.value = '';
    notesInput.value = '';
    await loadData();
  } catch (error) {
    setMessage(error.message, true);
  }
});

paidSearch.addEventListener('input', () => renderPaidTable(paidSearch.value));
pendingSearch.addEventListener('input', () => renderPendingTable(pendingSearch.value));

tabWithBox.addEventListener('click', () => {
  currentPendingTab = 'withBox';
  tabWithBox.classList.add('active');
  tabWithoutBox.classList.remove('active');
  withBoxContainer.style.display = 'block';
  withoutBoxContainer.style.display = 'none';
});

tabWithoutBox.addEventListener('click', () => {
  currentPendingTab = 'withoutBox';
  tabWithoutBox.classList.add('active');
  tabWithBox.classList.remove('active');
  withBoxContainer.style.display = 'none';
  withoutBoxContainer.style.display = 'block';
});

templateInput.addEventListener('change', () => {
  downloadCsv.href = `/api/export/reminders.csv?month=${monthPicker.value}&template=${encodeURIComponent(templateInput.value.trim())}`;
});

(async function init() {
  try {
    const defaultMonth = await fetchJson('/api/month/default');
    monthPicker.value = defaultMonth.month;
    paidOnInput.value = todayIsoDate();
    agentInput.value = 'Unassigned';
    await loadData();
  } catch (error) {
    setMessage(error.message, true);
  }
})();
