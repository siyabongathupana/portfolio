// timesheet.js – FIXED: correctly decrypts encrypted timesheet.json
(function() {
  const user = window.SessionManager?.getCurrentUser();
  if (!user) {
    window.location.href = "login.html?redirect=timesheet";
    return;
  }

  // ======================== TOKEN EXPIRY HANDLING ========================
  async function handleUnauthorized(showMessage = true) {
    if (showMessage) showToast("❌ Your GitHub token has expired. Please log in again.", "error");
    await window.Logger?.log('token_expired', 'GitHub token invalid or expired');
    window.SessionManager.logout();
    setTimeout(() => window.location.href = "login.html?redirect=timesheet&reason=token_expired", 2000);
  }

  async function githubFetchWithAuth(url, options) {
    const response = await fetch(url, options);
    if (response.status === 401 || response.status === 403) {
      await handleUnauthorized(true);
      throw new Error("Token expired – redirecting");
    }
    return response;
  }

  // ======================== ENCRYPTION HELPERS (EXACT MATCH WITH shared.js) ========================
  async function encryptDataBlob(obj, passphrase) {
    const json = JSON.stringify(obj);
    const encrypted = await window.CryptoUtil.encrypt(json, passphrase);
    return encrypted;
  }

  async function decryptDataBlob(encryptedBlob, passphrase) {
    const decrypted = await window.CryptoUtil.decrypt(encryptedBlob, passphrase);
    return JSON.parse(decrypted);
  }

  async function getUserEncryptionKey() {
    if (!window._userPassphrase) {
      const pwd = prompt("🔐 Enter your passphrase to access timesheet data:", "");
      if (!pwd) throw new Error('Passphrase required');
      window._userPassphrase = pwd;
    }
    return window._userPassphrase;
  }

  function getUserDataPath(username, filename) {
    const { dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(username);
    return `${dataPath}/users/${encUser}/${filename}`;
  }

  // ======================== CONFIGURATION ========================
  const TIMESHEET_FILE = "timesheet.json";
  const TIMESHEET_PROJECTS_FILE = "timesheet_projects.json";
  const USER_META_FILE = "user_meta.json";
  const PREFS_FILE = "preferences.json";

  let entries = [];
  let timesheetProjects = [];
  let mainPortfolioProjects = [];
  let allProjectOptions = [];
  let userFullName = "";
  let notificationsEnabled = false;
  let autoRefreshInterval = null;

  let projectChart = null, categoryChart = null, billableChart = null;

  function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toastId = "toast-" + Date.now();
    const bgClass = type === "success" ? "bg-success" : (type === "error" ? "bg-danger" : "bg-info");
    const html = `<div id="${toastId}" class="toast ${bgClass} text-white" role="alert" data-autohide="true" data-delay="5000"><div class="toast-body">${message}</div></div>`;
    container.insertAdjacentHTML("beforeend", html);
    const toastEl = document.getElementById(toastId);
    $(toastEl).toast("show");
    toastEl.addEventListener("hidden.bs.toast", () => toastEl.remove());
  }

  // ======================== DATA LOAD & SAVE (with proper decryption) ========================
  async function loadTimesheet() {
    const { owner, repo, branch } = window.REPO_CONFIG;
    const path = getUserDataPath(user.username, TIMESHEET_FILE);
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    try {
      const resp = await githubFetchWithAuth(url, { headers: { Authorization: `token ${user.pat}`, Accept: 'application/vnd.github.v3+json' } });
      if (resp.ok) {
        const data = await resp.json();
        let content = data.content;
        let parsed = null;
        
        // Detect if content is a base64 string or already an object
        let rawStr;
        if (typeof content === 'string') {
          rawStr = atob(content);
        } else {
          rawStr = JSON.stringify(content);
        }
        
        let parsedContent;
        try {
          parsedContent = JSON.parse(rawStr);
        } catch(e) {
          parsedContent = rawStr;
        }
        
        // Check if it's an encrypted blob (has salt, iv, ciphertext)
        if (parsedContent && typeof parsedContent === 'object' && parsedContent.salt && parsedContent.iv && parsedContent.ciphertext) {
          const passphrase = await getUserEncryptionKey();
          parsed = await decryptDataBlob(parsedContent, passphrase);
          console.log("✅ Timesheet decrypted successfully");
        } else {
          // Plain JSON (legacy)
          parsed = parsedContent;
          console.log("📄 Timesheet loaded as plain JSON");
        }
        
        entries = Array.isArray(parsed) ? parsed : [];
        entries = entries.map(e => ({ ...e, updatedAt: e.updatedAt || e.id }));
        entries.sort((a, b) => new Date(b.date) - new Date(a.date));
      } else if (resp.status === 404) {
        entries = [];
      } else {
        throw new Error(`HTTP ${resp.status}`);
      }
    } catch(e) {
      console.error("Error loading timesheet:", e);
      if (!e.message.includes("Token expired")) showToast("Failed to load timesheet: " + e.message, "error");
      entries = [];
    }
  }

  async function saveTimesheet(dataToSave) {
    if (!Array.isArray(dataToSave)) throw new Error("Invalid data: expected array");
    const passphrase = await getUserEncryptionKey();
    const encryptedBlob = await encryptDataBlob(dataToSave, passphrase);
    const { owner, repo, branch } = window.REPO_CONFIG;
    const path = getUserDataPath(user.username, TIMESHEET_FILE);
    const content = JSON.stringify(encryptedBlob);
    const encodedContent = btoa(unescape(encodeURIComponent(content)));

    let sha = null;
    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    try {
      const getResp = await githubFetchWithAuth(getUrl, { headers: { Authorization: `token ${user.pat}` } });
      if (getResp.ok) { const data = await getResp.json(); sha = data.sha; }
    } catch(e) {}

    const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const body = { message: `Update timesheet – ${new Date().toISOString()} – ${dataToSave.length} entries`, content: encodedContent, branch };
    if (sha) body.sha = sha;

    let retries = 3;
    while (retries > 0) {
      try {
        const putResp = await githubFetchWithAuth(putUrl, { method: 'PUT', headers: { Authorization: `token ${user.pat}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!putResp.ok) throw new Error(`GitHub API error: ${putResp.status}`);
        entries = [...dataToSave];
        console.log("✅ Timesheet saved and encrypted");
        return true;
      } catch (err) { 
        retries--; 
        if (retries === 0) throw err; 
        await new Promise(r => setTimeout(r, 1000)); 
      }
    }
  }

  async function loadTimesheetProjects() {
    const { owner, repo, branch } = window.REPO_CONFIG;
    const path = getUserDataPath(user.username, TIMESHEET_PROJECTS_FILE);
    try {
      const resp = await githubFetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, { headers: { Authorization: `token ${user.pat}` } });
      if (resp.ok) {
        const data = await resp.json();
        let rawStr = typeof data.content === 'string' ? atob(data.content) : JSON.stringify(data.content);
        let parsed = JSON.parse(rawStr);
        if (parsed && parsed.salt && parsed.iv && parsed.ciphertext) {
          const passphrase = await getUserEncryptionKey();
          timesheetProjects = await decryptDataBlob(parsed, passphrase);
        } else {
          timesheetProjects = parsed;
        }
      } else if (resp.status === 404) {
        timesheetProjects = [];
      }
    } catch(e) { timesheetProjects = []; }
  }

  async function saveTimesheetProjects(projectsArray) {
    const passphrase = await getUserEncryptionKey();
    const encryptedBlob = await encryptDataBlob(projectsArray, passphrase);
    const { owner, repo, branch } = window.REPO_CONFIG;
    const path = getUserDataPath(user.username, TIMESHEET_PROJECTS_FILE);
    const content = JSON.stringify(encryptedBlob);
    let sha = null;
    try {
      const getResp = await githubFetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, { headers: { Authorization: `token ${user.pat}` } });
      if (getResp.ok) sha = (await getResp.json()).sha;
    } catch(e) {}
    const putResp = await githubFetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT', headers: { Authorization: `token ${user.pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Update timesheet projects', content: btoa(unescape(encodeURIComponent(content))), branch, ...(sha && { sha }) })
    });
    if (!putResp.ok) throw new Error('Failed to save timesheet projects');
    timesheetProjects = projectsArray;
  }

  async function loadPortfolioProjects() {
    try {
      const projectsData = await window.portfolioData.loadProjects();
      mainPortfolioProjects = Object.values(projectsData).map(p => p.title).filter(p => p);
    } catch(e) { mainPortfolioProjects = []; }
  }

  function updateCombinedProjectList() {
    const combined = [...new Set([...mainPortfolioProjects, ...timesheetProjects])];
    combined.sort();
    allProjectOptions = combined;
  }

  async function loadProjectsForTimesheet() {
    await loadPortfolioProjects();
    await loadTimesheetProjects();
    updateCombinedProjectList();
    const selects = ['taskProject', 'editProject', 'filterProject'];
    for (let id of selects) {
      const sel = document.getElementById(id);
      if (!sel) continue;
      const currentVal = sel.value;
      sel.innerHTML = id === 'filterProject' ? '<option value="all">All Projects</option>' : '';
      allProjectOptions.forEach(proj => { const opt = document.createElement('option'); opt.value = proj; opt.textContent = proj; sel.appendChild(opt); });
      if (currentVal && allProjectOptions.includes(currentVal)) sel.value = currentVal;
    }
  }

  async function createTimesheetOnlyProject(projectName) {
    if (allProjectOptions.includes(projectName)) return false;
    await saveTimesheetProjects([...timesheetProjects, projectName]);
    await loadProjectsForTimesheet();
    return true;
  }

  async function deleteTimesheetProject(projectName) {
    if (!timesheetProjects.includes(projectName)) return false;
    const updated = timesheetProjects.filter(p => p !== projectName);
    await saveTimesheetProjects(updated);
    await loadProjectsForTimesheet();
    showToast(`Project "${projectName}" deleted from timesheet list.`, "success");
    return true;
  }

  // ======================== UI HELPERS (unchanged from original) ========================
  function formatDate(date) { return new Date(date).toISOString().split('T')[0]; }
  function calcHours(start, end) {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let minutes = (eh * 60 + em) - (sh * 60 + sm);
    if (minutes < 0) minutes += 24 * 60;
    return +(minutes / 60).toFixed(2);
  }
  function updateHoursAuto() {
    const start = document.getElementById('startTime').value;
    const end = document.getElementById('endTime').value;
    document.getElementById('hoursAuto').value = calcHours(start, end).toFixed(2);
  }

  async function addEntry(duplicateData = null) {
    let date, start, end, project, category, billable, notes;
    if (duplicateData) {
      date = duplicateData.date; start = duplicateData.start; end = duplicateData.end;
      project = duplicateData.project; category = duplicateData.category;
      billable = duplicateData.billable; notes = duplicateData.notes ? duplicateData.notes + " (copy)" : "copy";
    } else {
      date = document.getElementById('logDate').value;
      start = document.getElementById('startTime').value;
      end = document.getElementById('endTime').value;
      project = document.getElementById('taskProject').value;
      category = document.getElementById('taskCategory').value;
      billable = document.getElementById('billable').value;
      notes = document.getElementById('taskNotes').value.trim();
    }
    if (!date || !start || !end || !project || !category) { showToast("Please fill all required fields.", "error"); return; }
    const hours = calcHours(start, end);
    if (hours <= 0) { showToast("End time must be after start time.", "error"); return; }
    const addBtn = document.getElementById('addEntryBtn');
    addBtn.disabled = true; addBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Adding...';
    try {
      const newEntry = { id: Date.now(), date, start, end, hours, project, category, billable, notes, updatedAt: Date.now() };
      await saveTimesheet([newEntry, ...entries]);
      showToast(duplicateData ? "Entry duplicated!" : "Entry saved.");
      await refreshView();
      if (!duplicateData) {
        document.getElementById('startTime').value = '';
        document.getElementById('endTime').value = '';
        document.getElementById('taskNotes').value = '';
        document.getElementById('hoursAuto').value = '';
      }
    } catch(err) { if (!err.message.includes("Token expired")) showToast("Failed to add entry: " + err.message, "error"); }
    finally { addBtn.disabled = false; addBtn.innerHTML = '<i class="fa fa-plus"></i> Add Entry'; }
  }

  async function deleteEntry(id) {
    if (!confirm("Delete this entry?")) return;
    try {
      await saveTimesheet(entries.filter(e => e.id != id));
      showToast("Entry deleted.");
      await refreshView();
    } catch(err) { if (!err.message.includes("Token expired")) showToast("Delete failed: " + err.message, "error"); }
  }

  async function saveEdit() {
    const id = parseInt(document.getElementById('editEntryId').value);
    const date = document.getElementById('editDate').value;
    const start = document.getElementById('editStart').value;
    const end = document.getElementById('editEnd').value;
    const project = document.getElementById('editProject').value;
    const category = document.getElementById('editCategory').value;
    const billable = document.getElementById('editBillable').value;
    const notes = document.getElementById('editNotes').value.trim();
    if (!date || !start || !end || !project || !category) { showToast("Please fill all fields.", "error"); return; }
    const hours = calcHours(start, end);
    if (hours <= 0) { showToast("End time must be after start.", "error"); return; }
    const saveBtn = document.getElementById('saveEditBtn');
    saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Saving...';
    try {
      const index = entries.findIndex(e => e.id == id);
      if (index === -1) throw new Error("Entry not found");
      const updatedEntry = { ...entries[index], date, start, end, hours, project, category, billable, notes, updatedAt: Date.now() };
      const newEntries = [...entries]; newEntries[index] = updatedEntry;
      await saveTimesheet(newEntries);
      $('#editModal').modal('hide');
      showToast("Entry updated.");
      await refreshView();
    } catch(err) { if (!err.message.includes("Token expired")) showToast("Update failed: " + err.message, "error"); }
    finally { saveBtn.disabled = false; saveBtn.innerHTML = 'Save Changes'; }
  }

  async function duplicateEntry(entry) { await addEntry(entry); }
  async function editEntry(id) {
    const entry = entries.find(e => e.id == id);
    if (!entry) return;
    document.getElementById('editEntryId').value = id;
    document.getElementById('editDate').value = entry.date;
    document.getElementById('editStart').value = entry.start;
    document.getElementById('editEnd').value = entry.end;
    document.getElementById('editProject').value = entry.project;
    document.getElementById('editCategory').value = entry.category;
    document.getElementById('editBillable').value = entry.billable;
    document.getElementById('editNotes').value = entry.notes || '';
    $('#editModal').modal('show');
  }

  // ======================== FILTERS & RENDERING (unchanged) ========================
  function getFilteredEntries() {
    const range = document.getElementById('filterRange').value;
    const project = document.getElementById('filterProject').value;
    const category = document.getElementById('filterCategory').value;
    const now = new Date();
    let filtered = [...entries];
    if (range !== 'all') {
      filtered = filtered.filter(entry => {
        const d = new Date(entry.date);
        if (range === 'day') return d.toDateString() === now.toDateString();
        if (range === 'week') {
          const startOfWeek = new Date(now); const day = now.getDay(); const diff = (day === 0 ? 6 : day - 1);
          startOfWeek.setDate(now.getDate() - diff); startOfWeek.setHours(0,0,0,0);
          const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6); endOfWeek.setHours(23,59,59,999);
          return d >= startOfWeek && d <= endOfWeek;
        }
        if (range === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        return true;
      });
    }
    if (project !== 'all') filtered = filtered.filter(e => e.project === project);
    if (category !== 'all') filtered = filtered.filter(e => e.category === category);
    return filtered;
  }

  function renderHistory() {
    const filtered = getFilteredEntries();
    const tbody = document.getElementById('historyBody');
    const tfoot = document.getElementById('historyFoot');
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center">No entries found.  </td>';
      tfoot.style.display = 'none';
      return;
    }
    tbody.innerHTML = '';
    let totalHours = 0;
    filtered.forEach(entry => {
      totalHours += entry.hours;
      const row = tbody.insertRow();
      row.insertCell(0).innerText = entry.date;
      row.insertCell(1).innerText = entry.start;
      row.insertCell(2).innerText = entry.end;
      row.insertCell(3).innerText = entry.hours.toFixed(2);
      row.insertCell(4).innerText = entry.project;
      row.insertCell(5).innerText = entry.category;
      row.insertCell(6).innerText = entry.billable === 'yes' ? 'Billable' : 'Non-billable';
      row.insertCell(7).innerText = entry.notes || '-';
      const actionCell = row.insertCell(8); actionCell.className = 'print-hide';
      const editBtn = document.createElement('button'); editBtn.className = 'btn btn-sm btn-edit mr-1'; editBtn.innerHTML = '<i class="fa fa-pencil"></i>'; editBtn.onclick = () => editEntry(entry.id);
      const dupBtn = document.createElement('button'); dupBtn.className = 'btn btn-sm btn-duplicate mr-1'; dupBtn.innerHTML = '<i class="fa fa-copy"></i>'; dupBtn.onclick = () => duplicateEntry(entry);
      const delBtn = document.createElement('button'); delBtn.className = 'btn btn-sm btn-danger'; delBtn.innerHTML = '<i class="fa fa-trash"></i>'; delBtn.onclick = () => deleteEntry(entry.id);
      actionCell.appendChild(editBtn); actionCell.appendChild(dupBtn); actionCell.appendChild(delBtn);
    });
    document.getElementById('totalHoursCell').innerHTML = '<strong>' + totalHours.toFixed(2) + '</strong>';
    tfoot.style.display = 'table-footer-group';
  }

  function calculateOvertimeForPeriod(entriesList) {
    const dailyHours = {};
    entriesList.forEach(e => { dailyHours[e.date] = (dailyHours[e.date] || 0) + e.hours; });
    return Object.values(dailyHours).reduce((sum, hrs) => sum + (hrs > 8 ? hrs - 8 : 0), 0);
  }

  function updateSummaryAndProgress() {
    const filtered = getFilteredEntries();
    const totalHours = filtered.reduce((s,e) => s + e.hours, 0);
    const billable = filtered.filter(e => e.billable === 'yes').reduce((s,e) => s + e.hours, 0);
    const nonBillable = totalHours - billable;
    const overtime = calculateOvertimeForPeriod(filtered);
    document.getElementById('summaryTotalHours').innerText = totalHours.toFixed(1);
    document.getElementById('summaryBillable').innerText = billable.toFixed(1);
    document.getElementById('summaryNonBillable').innerText = nonBillable.toFixed(1);
    document.getElementById('summaryOvertime').innerText = overtime.toFixed(1);
    document.getElementById('summaryCard').style.display = 'flex';

    const today = formatDate(new Date());
    const todayHours = entries.filter(e => e.date === today).reduce((s,e) => s + e.hours, 0);
    const percent = Math.min(100, (todayHours / 8) * 100);
    const fill = document.getElementById('dailyProgressFill');
    fill.style.width = percent + '%';
    fill.innerText = todayHours.toFixed(1) + 'h';
    if (todayHours > 8) { fill.classList.add('overtime'); document.getElementById('overtimeWarning').style.display = 'block'; document.getElementById('overtimeWarning').innerHTML = `<i class="fa fa-exclamation-triangle"></i> Overtime: ${(todayHours-8).toFixed(1)}h over 8h today`; }
    else { fill.classList.remove('overtime'); document.getElementById('overtimeWarning').style.display = 'none'; }
  }

  function updateCharts() {
    const filtered = getFilteredEntries();
    const projMap = {}; filtered.forEach(e => { projMap[e.project] = (projMap[e.project] || 0) + e.hours; });
    if (projectChart) projectChart.destroy();
    const ctxProj = document.getElementById('projectChart');
    if (ctxProj) projectChart = new Chart(ctxProj, { type: 'pie', data: { labels: Object.keys(projMap), datasets: [{ data: Object.values(projMap), backgroundColor: ['#2fc7ff','#ffc107','#28a745','#dc3545','#6f42c1','#fd7e14','#17a2b8','#e83e8c'] }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } } } });

    const catMap = {}; filtered.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.hours; });
    if (categoryChart) categoryChart.destroy();
    const ctxCat = document.getElementById('categoryChart');
    if (ctxCat) categoryChart = new Chart(ctxCat, { type: 'pie', data: { labels: Object.keys(catMap), datasets: [{ data: Object.values(catMap), backgroundColor: ['#2fc7ff','#ffc107','#28a745','#dc3545','#6f42c1','#fd7e14'] }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } } } });

    let billable = 0, nonBill = 0; filtered.forEach(e => { if (e.billable === 'yes') billable += e.hours; else nonBill += e.hours; });
    if (billableChart) billableChart.destroy();
    const ctxBill = document.getElementById('billableChart');
    if (ctxBill) billableChart = new Chart(ctxBill, { type: 'pie', data: { labels: ['Billable', 'Non-billable'], datasets: [{ data: [billable, nonBill], backgroundColor: ['#28a745','#dc3545'] }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } } } });
  }

  // ======================== USER META & NOTIFICATIONS (with encryption) ========================
  async function loadUserMeta() {
    const { owner, repo, branch } = window.REPO_CONFIG;
    const path = getUserDataPath(user.username, USER_META_FILE);
    try {
      const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (file && file.content) {
        let rawStr = typeof file.content === 'string' ? file.content : JSON.stringify(file.content);
        let parsed = JSON.parse(rawStr);
        if (parsed && parsed.salt && parsed.iv && parsed.ciphertext) {
          const passphrase = await getUserEncryptionKey();
          const decrypted = await decryptDataBlob(parsed, passphrase);
          userFullName = decrypted.fullName || "";
        } else {
          userFullName = parsed.fullName || "";
        }
      }
    } catch(e) { userFullName = ""; }
    document.getElementById('userFullName').value = userFullName;
    document.getElementById('reportName').value = userFullName;
  }

  async function saveUserMeta(fullName) {
    const passphrase = await getUserEncryptionKey();
    const encryptedBlob = await encryptDataBlob({ fullName }, passphrase);
    const { owner, repo, branch } = window.REPO_CONFIG;
    const path = getUserDataPath(user.username, USER_META_FILE);
    let sha = null;
    try { const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat); if (existing) sha = existing.sha; } catch(e) {}
    await GitHubAPI.updateFile(owner, repo, path, encryptedBlob, "Update user name", branch, user.pat, sha);
    userFullName = fullName;
  }

  async function loadNotificationPreference() {
    const { owner, repo, branch } = window.REPO_CONFIG;
    const path = getUserDataPath(user.username, PREFS_FILE);
    try {
      const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (file && file.content) {
        let rawStr = typeof file.content === 'string' ? file.content : JSON.stringify(file.content);
        let parsed = JSON.parse(rawStr);
        if (parsed && parsed.salt && parsed.iv && parsed.ciphertext) {
          const passphrase = await getUserEncryptionKey();
          const decrypted = await decryptDataBlob(parsed, passphrase);
          notificationsEnabled = decrypted.notifications === true;
        } else {
          notificationsEnabled = parsed.notifications === true;
        }
      } else notificationsEnabled = false;
    } catch(e) { notificationsEnabled = false; }
    document.getElementById('notificationsToggle').checked = notificationsEnabled;
  }

  async function saveNotificationPreference(enabled) {
    const passphrase = await getUserEncryptionKey();
    const encryptedBlob = await encryptDataBlob({ notifications: enabled }, passphrase);
    const { owner, repo, branch } = window.REPO_CONFIG;
    const path = getUserDataPath(user.username, PREFS_FILE);
    let sha = null;
    try { const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat); if (existing) sha = existing.sha; } catch(e) {}
    await GitHubAPI.updateFile(owner, repo, path, encryptedBlob, "Update notification preference", branch, user.pat, sha);
    notificationsEnabled = enabled;
  }

  // ======================== REFRESH & AUTO REFRESH ========================
  async function refreshView() {
    window.showLoading("Refreshing timesheet...");
    try {
      await loadTimesheet();
      await loadProjectsForTimesheet();
      renderHistory();
      updateSummaryAndProgress();
      updateCharts();
    } catch(err) { if (!err.message.includes("Token expired")) showToast("Refresh failed: " + err.message, "error"); }
    finally { window.hideLoading(); }
  }

  function startAutoRefresh() { if (autoRefreshInterval) clearInterval(autoRefreshInterval); autoRefreshInterval = setInterval(() => { if (!document.hidden) refreshView(); }, 600000); }

  // ======================== INITIALISATION ========================
  async function init() {
    document.getElementById('logDate').value = formatDate(new Date());
    document.getElementById('startTime')?.addEventListener('change', updateHoursAuto);
    document.getElementById('endTime')?.addEventListener('change', updateHoursAuto);
    document.getElementById('nowStartBtn').onclick = () => { document.getElementById('startTime').value = new Date().toTimeString().slice(0,5); updateHoursAuto(); };
    document.getElementById('nowEndBtn').onclick = () => { document.getElementById('endTime').value = new Date().toTimeString().slice(0,5); updateHoursAuto(); };
    document.getElementById('addEntryBtn').onclick = () => addEntry();
    document.getElementById('refreshHistoryBtn').onclick = () => refreshView();
    document.getElementById('exportExcelBtn').onclick = () => { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 30); document.getElementById('reportStartDate').value = formatDate(start); document.getElementById('reportEndDate').value = formatDate(end); document.getElementById('reportType').value = 'excel'; $('#reportModal').modal('show'); };
    document.getElementById('printBtn').onclick = () => window.print();
    document.getElementById('filterRange').onchange = () => { renderHistory(); updateSummaryAndProgress(); updateCharts(); };
    document.getElementById('filterProject').onchange = () => { renderHistory(); updateSummaryAndProgress(); updateCharts(); };
    document.getElementById('filterCategory').onchange = () => { renderHistory(); updateSummaryAndProgress(); updateCharts(); };
    document.getElementById('saveNameBtn').onclick = async () => { const newName = document.getElementById('userFullName')?.value.trim(); if(!newName) return; window.showLoading("Saving name..."); try { await saveUserMeta(newName); showToast("Name saved."); } catch(err){ showToast("Failed: "+err.message,"error"); } finally{ window.hideLoading(); } };

    const manageProjectsBtn = document.createElement('button');
    manageProjectsBtn.type = 'button';
    manageProjectsBtn.className = 'btn btn-sm btn-outline-secondary ml-2';
    manageProjectsBtn.innerHTML = '<i class="fa fa-cog"></i> Manage Projects';
    manageProjectsBtn.onclick = () => showManageProjectsModal();
    const projectSelectParent = document.getElementById('taskProject').parentNode;
    projectSelectParent.appendChild(manageProjectsBtn);

    document.getElementById('addProjectBtn').onclick = () => { document.getElementById('newProjectName').value = ''; $('#newProjectModal').modal('show'); };
    document.getElementById('confirmNewProjectBtn').onclick = async () => { const newProj = document.getElementById('newProjectName')?.value.trim(); if(!newProj) return; window.showLoading(`Creating project "${newProj}"...`); try { await createTimesheetOnlyProject(newProj); showToast(`Project "${newProj}" created.`); } catch(err){ showToast("Failed: "+err.message,"error"); } finally{ window.hideLoading(); $('#newProjectModal').modal('hide'); } };
    document.getElementById('generateReportBtn').onclick = () => { document.getElementById('reportName').value = userFullName; const end = new Date(); const start = new Date(); start.setDate(start.getDate()-30); document.getElementById('reportStartDate').value = formatDate(start); document.getElementById('reportEndDate').value = formatDate(end); $('#reportModal').modal('show'); };
    document.getElementById('generateReportConfirmBtn').onclick = () => { const start = document.getElementById('reportStartDate')?.value; const end = document.getElementById('reportEndDate')?.value; if(!start||!end) return; const type = document.getElementById('reportType')?.value; $('#reportModal').modal('hide'); if(type==='pdf') generatePDFReport(start,end); else exportStyledExcel(start,end); };
    document.getElementById('saveEditBtn').onclick = saveEdit;

    await loadNotificationPreference();
    document.getElementById('notificationsToggle').addEventListener('change', async (e) => { window.showLoading("Saving preference..."); try { await saveNotificationPreference(e.target.checked); showToast(e.target.checked ? "Notifications enabled" : "Notifications disabled"); } catch(err){ if(err.message.includes("401")){ showToast("Token expired. Please login again.","error"); window.SessionManager.logout(); setTimeout(()=>window.location.href="login.html",2000); } else showToast("Failed: "+err.message,"error"); e.target.checked = !e.target.checked; } finally{ window.hideLoading(); } });

    await loadUserMeta();
    await refreshView();
    startAutoRefresh();
  }

  function showManageProjectsModal() {
    let modal = document.getElementById('manageProjectsModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'manageProjectsModal';
      modal.className = 'modal fade';
      modal.tabIndex = -1;
      modal.innerHTML = `
        <div class="modal-dialog modal-sm">
          <div class="modal-content">
            <div class="modal-header"><h5>Timesheet Projects</h5><button type="button" class="close" data-dismiss="modal">&times;</button></div>
            <div class="modal-body" id="manageProjectsList"><p>Loading...</p></div>
            <div class="modal-footer"><button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button></div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    const renderList = () => {
      const container = document.getElementById('manageProjectsList');
      if (!timesheetProjects.length) {
        container.innerHTML = '<p class="text-muted">No timesheet-only projects. Use "New Project" to add.</p>';
        return;
      }
      container.innerHTML = '<ul class="list-group">';
      timesheetProjects.forEach(proj => {
        container.innerHTML += `
          <li class="list-group-item d-flex justify-content-between align-items-center">
            ${escapeHtml(proj)}
            <button class="btn btn-sm btn-outline-danger delete-ts-project" data-project="${escapeHtml(proj)}"><i class="fa fa-trash"></i></button>
          </li>
        `;
      });
      container.innerHTML += '</ul>';
      document.querySelectorAll('.delete-ts-project').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const projectName = btn.getAttribute('data-project');
          if (confirm(`Delete timesheet project "${projectName}"? This will NOT delete existing entries, but the project will be removed from the dropdown.`)) {
            await deleteTimesheetProject(projectName);
            renderList();
          }
        });
      });
    };
    renderList();
    $(modal).modal('show');
  }

  function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m] || m); }

  init().catch(err => console.error("Timesheet init error", err));
})();
