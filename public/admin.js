// Super Admin Dashboard JS
const adminLogin = document.getElementById('adminLogin');
const adminDashboard = document.getElementById('adminDashboard');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminEmail = document.getElementById('adminEmail');
const adminPassword = document.getElementById('adminPassword');
const adminLoginMsg = document.getElementById('adminLoginMsg');
const adminContent = document.getElementById('adminContent');
const logoutAdmin = document.getElementById('logoutAdmin');

function setAdminToken(token) {
  localStorage.setItem('adminToken', token);
}
function getAdminToken() {
  return localStorage.getItem('adminToken');
}
function clearAdminToken() {
  localStorage.removeItem('adminToken');
}

function normalizeOrgId(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidOrgId(value) {
  return /^[a-z0-9-]+$/.test(value);
}

function esc(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function adminFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getAdminToken(),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

// Show login form on page load
function initAdmin() {
  const token = getAdminToken();
  if (token) {
    showDashboard();
  } else {
    // Clear any user tokens to ensure clean state
    localStorage.removeItem('authToken');
    localStorage.removeItem('orgId');
    adminLogin.style.display = 'block';
    adminDashboard.style.display = 'none';
  }
}

adminLoginForm.onsubmit = async (e) => {
  e.preventDefault();
  adminLoginMsg.textContent = '';
  const email = adminEmail.value.trim();
  const password = adminPassword.value;
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    console.log('Login response:', data, 'Status:', res.status);
    if (data.ok && data.token) {
      setAdminToken(data.token);
      console.log('Token set:', data.token);
      showDashboard();
    } else {
      adminLoginMsg.textContent = data.error || 'Login failed';
      console.log('Login failed:', data);
    }
  } catch (err) {
    adminLoginMsg.textContent = 'Network error';
    console.log('Network error:', err);
  }
};

logoutAdmin.onclick = () => {
  clearAdminToken();
  location.reload();
};

async function showDashboard() {
  adminLogin.style.display = 'none';
  adminDashboard.style.display = '';
  await loadAdminContent();
}

async function loadAdminContent() {
  adminContent.innerHTML = '<p>Loading...</p>';
  try {
    const token = getAdminToken();
    console.log('Fetching with token:', token);
    const res = await fetch('/api/admin/organizations', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    console.log('Organizations response status:', res.status);
    if (res.status === 401) { 
      console.log('Got 401, reloading page');
      clearAdminToken(); 
      location.reload(); 
      return; 
    }
    const data = await res.json();
    console.log('Organizations data:', data);
    if (!data.ok) throw new Error(data.error);
    renderOrganizations(data.organizations || []);
  } catch (err) {
    console.log('loadAdminContent error:', err);
    adminContent.innerHTML = '<p style="color:#b91c1c">Failed to load: ' + err.message + '</p>';
  }
}

function renderOrganizations(orgs) {
  let html = `<h2>Foundations</h2><p style="margin:6px 0 12px;color:#4b5563;">Foundation ID is unique. Verify by matching the exact ID.</p><button id="addOrgBtn" class="btn">Add Foundation</button>`;
  html += `<div id="orgActionMsg" style="margin:10px 0;color:#0b6e4f;"></div>`;
  html += `<table class="admin-table"><tr><th>Name</th><th>ID</th><th>Actions</th></tr>`;
  for (const org of orgs) {
    html += `<tr><td>${esc(org.name)}</td><td>${esc(org.id)}</td><td>
      <button class="btn secondary" data-edit-orgid="${esc(org.id)}" data-orgname="${esc(org.name)}">Edit</button>
      <button class="btn secondary" data-agents-orgid="${esc(org.id)}" data-orgname="${esc(org.name)}">Agents</button>
      <button class="btn danger" data-orgid="${esc(org.id)}">Delete</button>
    </td></tr>`;
  }
  html += `</table>`;
  adminContent.innerHTML = html;

  const msg = document.getElementById('orgActionMsg');
  document.getElementById('addOrgBtn').onclick = () => showAddOrgForm(orgs);

  for (const btn of adminContent.querySelectorAll('button[data-edit-orgid]')) {
    btn.onclick = () => showEditOrgForm(btn.dataset.editOrgid, btn.dataset.orgname);
  }

  for (const btn of adminContent.querySelectorAll('button[data-agents-orgid]')) {
    btn.onclick = () => showAgentsManager(btn.dataset.agentsOrgid, btn.dataset.orgname);
  }

  for (const btn of adminContent.querySelectorAll('button.danger[data-orgid]')) {
    btn.onclick = async function() {
      if (!confirm('Delete this foundation?')) return;
      try {
        const result = await adminFetch(`/api/admin/organizations/${btn.dataset.orgid}`, {
          method: 'DELETE'
        });
        msg.style.color = '#0b6e4f';
        msg.textContent = result.message || 'Foundation deleted.';
        await loadAdminContent();
      } catch (err) {
        const text = String(err.message || '');
        const needsForce = text.includes('Use force delete');
        if (needsForce) {
          const confirmed = confirm(`${text}\n\nForce delete will remove foundation agents/invites. Continue?`);
          if (confirmed) {
            try {
              const forced = await adminFetch(`/api/admin/organizations/${btn.dataset.orgid}?force=true`, {
                method: 'DELETE'
              });
              msg.style.color = '#0b6e4f';
              msg.textContent = forced.message || 'Foundation force-deleted.';
              await loadAdminContent();
              return;
            } catch (forceErr) {
              msg.style.color = '#b91c1c';
              msg.textContent = forceErr.message;
              return;
            }
          }
        }
        msg.style.color = '#b91c1c';
        msg.textContent = text;
      }
    };
  }
}

function showEditOrgForm(id, currentName) {
  adminContent.innerHTML = `
    <h2>Edit Foundation</h2>
    <form id="editOrgForm">
      <label>Name <input id="editOrgName" value="${esc(currentName)}" required /></label>
      <label>ID <input id="editOrgId" value="${esc(id)}" disabled /></label>
      <div style="color:#4b5563;font-size:12px;margin:4px 0 10px;">Foundation ID cannot be changed.</div>
      <button type="submit" class="btn">Save</button>
      <button type="button" id="cancelEditOrg" class="btn secondary">Cancel</button>
      <div id="editOrgMsg" style="color:#b91c1c;margin-top:8px;"></div>
    </form>
  `;

  document.getElementById('cancelEditOrg').onclick = loadAdminContent;
  document.getElementById('editOrgForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('editOrgName').value.trim();
    const msg = document.getElementById('editOrgMsg');
    msg.textContent = '';
    if (!name) {
      msg.textContent = 'Name is required.';
      return;
    }
    try {
      await adminFetch(`/api/admin/organizations/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name })
      });
      await loadAdminContent();
    } catch (err) {
      msg.textContent = err.message;
    }
  };
}

async function showAgentsManager(orgId, orgName) {
  adminContent.innerHTML = `<h2>Foundation Agents - ${esc(orgName)}</h2><p>Loading agents...</p>`;
  try {
    const data = await adminFetch(`/api/admin/organizations/${orgId}/agents`);
    const agents = data.agents || [];
    let html = `<h2>Foundation Agents - ${esc(orgName)}</h2>`;
    html += `<button id="backToOrgs" class="btn secondary">Back</button>`;
    html += `
      <form id="addAgentForm" style="margin-top:12px;">
        <label>Name <input id="newAgentName" required /></label>
        <label>Email <input id="newAgentEmail" type="email" placeholder="agent@example.com" /></label>
        <button type="submit" class="btn">Add Agent</button>
        <div id="agentMsg" style="color:#b91c1c;margin-top:8px;"></div>
      </form>
    `;
    html += `<table class="admin-table" style="margin-top:12px;"><tr><th>Name</th><th>Email</th><th>Actions</th></tr>`;
    for (const agent of agents) {
      html += `<tr>
        <td>${esc(agent.name)}</td>
        <td>${esc(agent.email)}</td>
        <td>
          <button class="btn secondary" data-edit-agent="${esc(agent.id)}" data-agent-name="${esc(agent.name)}" data-agent-email="${esc(agent.email)}">Edit</button>
          <button class="btn danger" data-delete-agent="${esc(agent.id)}">Delete</button>
        </td>
      </tr>`;
    }
    html += `</table>`;
    adminContent.innerHTML = html;

    document.getElementById('backToOrgs').onclick = loadAdminContent;
    const agentMsg = document.getElementById('agentMsg');

    document.getElementById('addAgentForm').onsubmit = async (e) => {
      e.preventDefault();
      const name = document.getElementById('newAgentName').value.trim();
      const email = document.getElementById('newAgentEmail').value.trim();
      agentMsg.textContent = '';
      try {
        await adminFetch(`/api/admin/organizations/${orgId}/agents`, {
          method: 'POST',
          body: JSON.stringify({ name, email })
        });
        await showAgentsManager(orgId, orgName);
      } catch (err) {
        agentMsg.textContent = err.message;
      }
    };

    for (const btn of adminContent.querySelectorAll('button[data-edit-agent]')) {
      btn.onclick = async () => {
        const currentName = btn.dataset.agentName || '';
        const currentEmail = btn.dataset.agentEmail || '';
        const name = prompt('Agent name:', currentName);
        if (name === null) return;
        const email = prompt('Agent email:', currentEmail);
        if (email === null) return;
        try {
          await adminFetch(`/api/admin/organizations/${orgId}/agents/${btn.dataset.editAgent}`, {
            method: 'PUT',
            body: JSON.stringify({ name: name.trim(), email: email.trim() })
          });
          await showAgentsManager(orgId, orgName);
        } catch (err) {
          alert(err.message);
        }
      };
    }

    for (const btn of adminContent.querySelectorAll('button[data-delete-agent]')) {
      btn.onclick = async () => {
        if (!confirm('Delete this agent?')) return;
        try {
          await adminFetch(`/api/admin/organizations/${orgId}/agents/${btn.dataset.deleteAgent}`, {
            method: 'DELETE'
          });
          await showAgentsManager(orgId, orgName);
        } catch (err) {
          alert(err.message);
        }
      };
    }
  } catch (err) {
    adminContent.innerHTML = `<p style="color:#b91c1c">Failed to load agents: ${esc(err.message)}</p><button id="backToOrgs" class="btn secondary">Back</button>`;
    document.getElementById('backToOrgs').onclick = loadAdminContent;
  }
}

function showAddOrgForm(orgs) {
  adminContent.innerHTML = `
    <h2>Add Foundation</h2>
    <form id="addOrgForm">
      <label>Name <input id="newOrgName" required /></label>
      <label>ID <input id="newOrgId" required placeholder="rahman-foundation" /></label>
      <div style="color:#4b5563;font-size:12px;margin:4px 0 10px;">Use lowercase letters, numbers, and hyphens only.</div>
      <button type="submit" class="btn">Add</button>
      <button type="button" id="cancelAddOrg" class="btn secondary">Cancel</button>
      <div id="addOrgMsg" style="color:#b91c1c;margin-top:8px;"></div>
    </form>
  `;
  document.getElementById('cancelAddOrg').onclick = loadAdminContent;
  document.getElementById('addOrgForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('newOrgName').value.trim();
    const id = normalizeOrgId(document.getElementById('newOrgId').value);
    document.getElementById('newOrgId').value = id;
    const token = getAdminToken();
    const msg = document.getElementById('addOrgMsg');
    msg.textContent = '';
    if (!name || !id) {
      msg.textContent = 'Name and ID are required.';
      return;
    }
    if (!isValidOrgId(id)) {
      msg.textContent = 'ID must contain only lowercase letters, numbers, and hyphens.';
      return;
    }
    // Check if ID already exists in current list
    if (orgs && orgs.some(org => normalizeOrgId(org.id) === id)) {
      msg.textContent = 'Foundation ID already exists. Please use a different ID.';
      return;
    }
    try {
      const res = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ name, id })
      });
      const data = await res.json();
      if (data.ok) {
        await loadAdminContent();
      } else {
        msg.textContent = data.error || 'Failed to add';
      }
    } catch (err) {
      msg.textContent = 'Network error: ' + err.message;
    }
  };
}

// Initialize admin page on load
initAdmin();
