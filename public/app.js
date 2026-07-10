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
const downloadPaidCsv = document.getElementById('downloadPaidCsv');
const downloadZeroCsv = document.getElementById('downloadZeroCsv');
const dailyReportDateInput = document.getElementById('dailyReportDate');
const dailySummaryDateEl = document.getElementById('dailySummaryDate');
const dailyVisitedCountEl = document.getElementById('dailyVisitedCount');
const dailyZeroCountEl = document.getElementById('dailyZeroCount');
const dailyCollectionAmountEl = document.getElementById('dailyCollectionAmount');
const dailyWhatsAppCountEl = document.getElementById('dailyWhatsAppCount');

let latestData = null;
let latestReminders = [];
let sentWhatsAppIds = new Set();
let allDonorOptions = [];
const WHATSAPP_LOG_KEY = 'donation_whatsapp_sent_log_v1';
let whatsappSentLog = loadWhatsAppSentLog();

const WHATSAPP_TEMPLATE_OPENED = `Assalamu Alaikum 🌸

Date: {collectionDate}

Aapke yahan rakha donation box aaj {collectorName} ki taraf se khola gaya, jisme ₹{collectedAmount} jama hue.

Aapse guzarish hai ke rozana thodi si Sadaqah (₹5, ₹10 ya ₹20) is donation box mein zarur dalein aur apne ghar ke afraad aur bachchon ko bhi is nek kaam mein hissa lene ki targeeb dein. 🤲

Aapki ye madad kisi bhooke ka khana, kisi bewa ka sahara aur kisi gareeb family ki madad ban sakti hai.

Sadaqah Allah ke gusse ko thanda karta hai aur ye rizq mein barkat, bimari mein shifa, musibat se hifazat aur aakhirat mein sawaab ka zariya hai.

JazakAllah Khair

RF Sangli
📞7030962065`;

const WHATSAPP_TEMPLATE_NOT_OPENED = `Assalamu Alaikum 🌸

Date: {collectionDate}

Aaj {collectorName} aapke ghar visit par aaye the, lekin kisi wajah se aapke yahan rakha donation box khola nahi ja saka.

Aapse guzarish hai ke rozana thodi si Sadaqah (₹5, ₹10 ya ₹20) is donation box mein zarur dalein aur apne ghar ke afraad aur bachchon ko bhi is nek kaam mein hissa lene ki targeeb dein. 🤲

Aapki ye madad kisi bhooke ka khana, kisi bewa ka sahara aur kisi gareeb family ki madad ban sakti hai.

Sadaqah Allah ke gusse ko thanda karta hai aur ye rizq mein barkat, bimari mein shifa, musibat se hifazat aur aakhirat mein sawaab ka zariya hai.

JazakAllah Khair

RF Sangli
📞7030962065`;

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

function formatMessageDate(dateValue) {
  const value = String(dateValue || '').trim();
  if (!value) return todayIsoDate();
  const parts = value.split('-');
  if (parts.length !== 3) return value;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function resolveCollectorName(preferredName = '') {
  const fromStorage = [
    localStorage.getItem('collectorName'),
    localStorage.getItem('userName'),
    localStorage.getItem('agentName'),
    localStorage.getItem('collector'),
  ].find((v) => String(v || '').trim());

  return String(preferredName || fromStorage || agentInput.value || 'Unassigned').trim();
}

function buildDonationWhatsAppMessage(donor) {
  const amount = Number(donor?.amount || 0);
  const isOpened = amount > 0;
  const template = isOpened ? WHATSAPP_TEMPLATE_OPENED : WHATSAPP_TEMPLATE_NOT_OPENED;

  return {
    message: template
      .replaceAll('{collectionDate}', formatMessageDate(donor?.paidOn || todayIsoDate()))
      .replaceAll('{collectorName}', resolveCollectorName(donor?.agent))
      .replaceAll('{collectedAmount}', Number(amount || 0).toLocaleString('en-IN')),
    templateType: isOpened ? 'Donation Box Opened' : 'Donation Box Not Opened',
  };
}

function normalizePhoneForWhatsApp(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

function normalizeDonorRef(donor) {
  return String(donor?.internalId || donor?.boxNo || '').trim();
}

function loadWhatsAppSentLog() {
  try {
    const raw = localStorage.getItem(WHATSAPP_LOG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function saveWhatsAppSentLog() {
  localStorage.setItem(WHATSAPP_LOG_KEY, JSON.stringify(whatsappSentLog));
}

function getMonthWhatsAppSentIds(month) {
  const monthLog = whatsappSentLog?.[month] || {};
  const ids = new Set();
  Object.values(monthLog).forEach((arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((id) => {
      const clean = String(id || '').trim();
      if (clean) ids.add(clean);
    });
  });
  return ids;
}

function getDailyWhatsAppSentIds(month, date) {
  const monthLog = whatsappSentLog?.[month] || {};
  const dayLog = monthLog?.[date];
  if (!Array.isArray(dayLog)) return new Set();
  return new Set(dayLog.map((id) => String(id || '').trim()).filter(Boolean));
}

function trackWhatsAppSent(month, date, donorRef) {
  if (!month || !date || !donorRef) return;
  if (!whatsappSentLog[month]) {
    whatsappSentLog[month] = {};
  }
  if (!Array.isArray(whatsappSentLog[month][date])) {
    whatsappSentLog[month][date] = [];
  }

  const bucket = whatsappSentLog[month][date];
  if (!bucket.includes(donorRef)) {
    bucket.push(donorRef);
    saveWhatsAppSentLog();
  }
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
            <a href="#" class="disabled-link" title="Completed donations cannot be edited" onclick="return false;">Remove</a>
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
        <td colspan="8">No 0-donation records found for this month.</td>
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
        <td>${esc(d.paidOn || '-')}</td>
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

function getDailyMetrics(date) {
  const dailyRows = (latestData?.paid || []).filter((d) => (d.paidOn || '') === date);
  const visited = dailyRows.length;
  const zero = dailyRows.filter((row) => Number(row.amount || 0) === 0).length;
  const amount = dailyRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const month = monthPicker.value;
  const dailySent = getDailyWhatsAppSentIds(month, date).size;

  return { visited, zero, amount, dailySent };
}

function renderDailySummary() {
  const date = dailyReportDateInput.value || todayIsoDate();
  if (dailySummaryDateEl) {
    dailySummaryDateEl.textContent = date;
  }

  const metrics = getDailyMetrics(date);
  dailyVisitedCountEl.textContent = String(metrics.visited);
  dailyZeroCountEl.textContent = String(metrics.zero);
  dailyCollectionAmountEl.textContent = `Rs ${Number(metrics.amount || 0).toLocaleString('en-IN')}`;
  dailyWhatsAppCountEl.textContent = String(metrics.dailySent);
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

  const [donorData, reminderData] = await Promise.all([
    fetchJson(`/api/donors?month=${month}`),
    fetchJson(`/api/reminders?month=${month}&template=${template}`),
  ]);

  latestData = donorData;
  latestReminders = reminderData.reminders || [];
  sentWhatsAppIds = getMonthWhatsAppSentIds(month);

  if (!dailyReportDateInput.value || !dailyReportDateInput.value.startsWith(month)) {
    const today = todayIsoDate();
    dailyReportDateInput.value = today.startsWith(month) ? today : `${month}-01`;
  }

  renderSummary(donorData);
  renderBoxOptions(donorData);
  renderPaidTable(paidSearch.value);
  renderZeroDonationTable(paidSearch.value);
  renderDailySummary();

  downloadCsv.href = `/api/export/reminders.csv?month=${month}&template=${template}`;
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

async function openDonationWhatsApp(donor, donorRef, source = 'manual') {
  const phone = normalizePhoneForWhatsApp(donor?.mobile || '');
  if (!phone) {
    setMessage('No mobile number available for this donor.', true);
    return false;
  }

  const { message, templateType } = buildDonationWhatsAppMessage(donor);
  const url = `https://wa.me/+${phone}?text=${encodeURIComponent(message)}`;

  const month = monthPicker.value;
  const messageDate = donor.paidOn || dailyReportDateInput.value || todayIsoDate();
  trackWhatsAppSent(month, messageDate, donorRef);

  sentWhatsAppIds.add(donorRef);
  renderPaidTable(paidSearch.value);
  renderZeroDonationTable(paidSearch.value);
  renderDailySummary();

  window.open(url, '_blank', 'width=600,height=700');
  setMessage(`${templateType} message sent to ${donor.name || 'donor'} (${source}). Button disabled.`);
  return true;
}

window.sendWhatsAppMsg = async function sendWhatsAppMsg(donorId, name, mobile) {
  if (!mobile || mobile.trim() === '') {
    setMessage('No mobile number available for this donor.', true);
    return;
  }
  
  const donor = (latestData?.paid || []).find((d) => (d.internalId || d.boxNo) === donorId)
    || { name, boxNo: donorId, mobile };
  const donorRef = normalizeDonorRef(donor) || String(donorId || '').trim();
  await openDonationWhatsApp(donor, donorRef, 'manual');
};

refreshBtn.addEventListener('click', async () => {
  try {
    await loadData();
    setMessage('Data refreshed.');
  } catch (error) {
    setMessage(error.message, true);
  }
});

monthPicker.addEventListener('change', async () => {
  try {
    await loadData();
    setMessage(`Showing data for ${monthPicker.value}.`);
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

  const systemDate = todayIsoDate();
  const selectedDate = String(paidOnInput.value || '').trim() || systemDate;
  const collectorName = resolveCollectorName();

  const payload = {
    boxNo: boxNoSelect.value,
    month: monthPicker.value,
    amount: Number(amountInput.value),
    paidOn: selectedDate,
    method: methodInput.value,
    agent: collectorName,
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
    paidOnInput.value = systemDate;
    agentInput.value = collectorName;
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

dailyReportDateInput.addEventListener('change', () => {
  renderDailySummary();
});

(async function init() {
  try {
    const defaultMonth = await fetchJson('/api/month/default');
    monthPicker.value = defaultMonth.month;
    paidOnInput.value = todayIsoDate();
    agentInput.value = resolveCollectorName('MOHSIN MUJAWAR');
    await loadData();
  } catch (error) {
    setMessage(error.message, true);
  }
})();
