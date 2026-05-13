const monthPicker = document.getElementById('monthPicker');
const refreshBtn = document.getElementById('refreshBtn');
const donationForm = document.getElementById('donationForm');
const formMessage = document.getElementById('formMessage');

const totalAmountEl = document.getElementById('totalAmount');
const totalDonorsEl = document.getElementById('totalDonors');
const paidCountEl = document.getElementById('paidCount');
const pendingCountEl = document.getElementById('pendingCount');

const paidTable = document.getElementById('paidTable');
const zeroDonationTable = document.getElementById('zeroDonationTable');
const paidSearch = document.getElementById('paidSearch');
const boxSearchInput = document.getElementById('boxSearch');

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
const downloadPaidCsv = document.getElementById('downloadPaidCsv');
const downloadZeroCsv = document.getElementById('downloadZeroCsv');
const agentTable = document.getElementById('agentTable');

let latestData = null;
let latestReminders = [];
let latestAgentReport = null;
let sentWhatsAppIds = new Set();
let allDonorOptions = [];

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
  allDonorOptions = [...data.paid, ...data.pending].sort((a, b) => {
    const aNum = Number(a.boxNo) || Infinity;
    const bNum = Number(b.boxNo) || Infinity;
    return aNum - bNum;
  });

  renderFilteredBoxOptions(boxSearchInput?.value || '');
}

function renderFilteredBoxOptions(search = '') {
  const selectedValue = boxNoSelect.value;
  const term = search.trim().toLowerCase();

  const filtered = !term
    ? allDonorOptions
    : allDonorOptions.filter((d) => {
        const boxDisplay = d.boxNo || 'no-box';
        const searchText = `${boxDisplay} ${d.name}`.toLowerCase();
        return searchText.includes(term);
      });

  boxNoSelect.innerHTML = filtered
    .map((d) => {
      const boxDisplay = d.boxNo || '(No Box)';
      const selectValue = d.boxNo || d.internalId || '';
      return `<option value="${esc(selectValue)}">Box ${esc(boxDisplay)} - ${esc(d.name)}</option>`;
    })
    .join('');

  if (selectedValue && filtered.some((d) => (d.boxNo || d.internalId || '') === selectedValue)) {
    boxNoSelect.value = selectedValue;
  }
}

function matchesSearch(rowText, term) {
  return rowText.toLowerCase().includes(term.toLowerCase());
}

function renderPaidTable(search = '') {
  const rows = (latestData?.paid || []).filter((d) => {
    if (Number(d.amount || 0) === 0) return false;
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
            <button class="whatsapp-btn ${sentWhatsAppIds.has(d.internalId || d.boxNo) ? 'disabled' : ''}" onclick="sendWhatsAppMsg('${esc(d.internalId || d.boxNo)}', '${esc(d.name)}', '${esc(d.mobile)}'); return false;" ${sentWhatsAppIds.has(d.internalId || d.boxNo) ? 'disabled' : ''}>Send WhatsApp</button>
            <a href="#" onclick="removeDonation('${esc(d.internalId || d.boxNo)}'); return false;">Remove</a>
          </div>
        </td>
      </tr>
    `
    )
    .join('');
}

function renderZeroDonationTable(search = '') {
  const rows = (latestData?.paid || []).filter((d) => {
    if (Number(d.amount || 0) !== 0) return false;
    if (!search.trim()) return true;
    const indexText = `${d.boxNo || ''} ${d.name} ${d.city} ${d.area} ${d.mobile}`;
    return matchesSearch(indexText, search);
  });

  if (rows.length === 0) {
    zeroDonationTable.innerHTML = `
      <tr>
        <td colspan="7">No 0-donation records found for this month.</td>
      </tr>
    `;
    return;
  }

  zeroDonationTable.innerHTML = rows
    .map(
      (d) => {
        const donorRef = d.internalId || d.boxNo;
        return `
      <tr>
        <td>${esc(d.boxNo || '-')}</td>
        <td>${esc(d.name)}</td>
        <td>${esc(d.city)}</td>
        <td>${esc(d.mobile || '-')}</td>
        <td>0 / Nill</td>
        <td>${esc(d.agent || 'Unassigned')}</td>
        <td>
          <div class="small-links">
            ${d.mobile ? `<button class="whatsapp-btn ${sentWhatsAppIds.has(donorRef) ? 'disabled' : ''}" onclick="sendWhatsAppMsg('${esc(donorRef)}', '${esc(d.name)}', '${esc(d.mobile)}'); return false;" ${sentWhatsAppIds.has(donorRef) ? 'disabled' : ''}>Send WhatsApp</button>` : ''}
            <a href="#" onclick="removeDonation('${esc(donorRef)}'); return false;">Remove</a>
          </div>
        </td>
      </tr>
    `;
      }
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
  renderZeroDonationTable(paidSearch.value);
  renderAgentTable();

  downloadCsv.href = `/api/export/reminders.csv?month=${month}&template=${template}`;
  downloadAgentCsv.href = `/api/export/agents.csv?month=${month}`;
  downloadPaidCsv.href = `/api/export/collected.csv?month=${month}`;
  downloadZeroCsv.href = `/api/export/zero-donation.csv?month=${month}`;
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

window.sendWhatsAppMsg = async function sendWhatsAppMsg(donorId, name, mobile) {
  if (!mobile || mobile.trim() === '') {
    setMessage('No mobile number available for this donor.', true);
    return;
  }
  
  const donor = (latestData?.paid || []).find((d) => (d.internalId || d.boxNo) === donorId)
    || { name, boxNo: donorId, mobile };
  
  const month = monthPicker.value;
  const template = (templateInput.value || 'Assalamu Alaikum 🌸\n\nAapke yahan rakha donation box aaj khola kiya gaya jisme ₹{amount} jama hue.\n\nAapse guzarish hai ke rozana thodi si Sadaqah (₹5, 10 ya 20) is donation box mein zarur dalein aur apne ghar ke afraad aur bachchon ko bhi is nek kaam mein hissa lene ki targeeb dein. 🤲\n\nAapki ye madad kisi bhooke ka khana, kisi bewa ka sahara aur kisi gareeb family ki madad ban sakti hai.\n\nSadaqah Allah ke gusse ko thanda karta hai aur ye rizq mein barkat, bimari me shifa, musibat se hifazat aur akhirat me sawaab ka zariya hai.\n\nJazakAllah Khair\n\nRF Sangli').trim();
  const msg = template
    .replaceAll('{name}', donor.name || 'Donor')
    .replaceAll('{boxNo}', donor.boxNo || '')
    .replaceAll('{month}', month)
    .replaceAll('{amount}', Number(donor.amount || 0));
  
  const digits = String(mobile || '').replace(/\D/g, '');
  let phone = digits;
  if (digits.length === 10) phone = `91${digits}`;
  if (!phone.startsWith('+')) phone = `+${phone}`;
  
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  
  sentWhatsAppIds.add(donorId);
  renderPaidTable(paidSearch.value);
  renderZeroDonationTable(paidSearch.value);
  window.open(url, '_blank', 'width=600,height=700');
  setMessage(`WhatsApp message sent to ${name}. Button disabled.`);
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
if (boxSearchInput) {
  boxSearchInput.addEventListener('input', () => renderFilteredBoxOptions(boxSearchInput.value));
}

templateInput.addEventListener('change', () => {
  downloadCsv.href = `/api/export/reminders.csv?month=${monthPicker.value}&template=${encodeURIComponent(templateInput.value.trim())}`;
});

(async function init() {
  try {
    const defaultMonth = await fetchJson('/api/month/default');
    monthPicker.value = defaultMonth.month;
    paidOnInput.value = todayIsoDate();
    agentInput.value = 'MOHSIN MUJAWAR';
    await loadData();
  } catch (error) {
    setMessage(error.message, true);
  }
})();
