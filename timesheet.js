// timesheet.js – Optimistic UI with background sync, Excel export with Yearly Calendar grid
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

  // ======================== SAVE AS HELPER ========================
  function saveAs(blob, filename) {
    if (typeof window.saveAs === 'function') {
      window.saveAs(blob, filename);
      return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
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

  let _projectsLoaded = false;
  let _isSaving = false;
  let _saveQueue = [];

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

  // ======================== DATA LOAD & SAVE ========================
  async function loadTimesheet() {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${TIMESHEET_FILE}`;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    try {
      const resp = await githubFetchWithAuth(url, { headers: { Authorization: `token ${user.pat}`, Accept: 'application/vnd.github.v3+json' } });
      if (resp.ok) {
        const data = await resp.json();
        const content = atob(data.content.replace(/\n/g, ''));
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch (e) {
          console.warn("Timesheet JSON parse failed, using empty array:", e);
          parsed = [];
          showToast("Timesheet data was corrupted; reset to empty.", "error");
        }
        entries = Array.isArray(parsed) ? parsed : [];
        entries = entries.map(e => ({ ...e, updatedAt: e.updatedAt || e.id }));
        entries.sort((a, b) => new Date(b.date) - new Date(a.date));
      } else if (resp.status === 404) entries = [];
      else throw new Error(`HTTP ${resp.status}`);
    } catch(e) {
      if (!e.message.includes("Token expired")) {
        console.error("Failed to load timesheet:", e);
        showToast("Could not load timesheet data. Using local cache.", "warning");
      }
    }
  }

  // Background sync: push local entries to GitHub with retries
  async function syncEntriesToGitHub(force = false) {
    if (_isSaving && !force) {
      return new Promise((resolve) => {
        _saveQueue.push(resolve);
      });
    }
    _isSaving = true;
    try {
      await _doSaveEntries(entries);
      while (_saveQueue.length) {
        const resolve = _saveQueue.shift();
        resolve();
      }
    } catch (err) {
      console.error("Background sync failed:", err);
      showToast("⚠️ Could not save to GitHub. Your data is safe locally but not synced.", "error");
      while (_saveQueue.length) {
        const resolve = _saveQueue.shift();
        resolve();
      }
    } finally {
      _isSaving = false;
    }
  }

  async function _doSaveEntries(dataToSave) {
    if (!Array.isArray(dataToSave)) throw new Error("Invalid data: expected array");
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${TIMESHEET_FILE}`;
    const content = JSON.stringify(dataToSave, null, 2);
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
    let lastError;
    while (retries > 0) {
      try {
        const putResp = await githubFetchWithAuth(putUrl, { method: 'PUT', headers: { Authorization: `token ${user.pat}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!putResp.ok) throw new Error(`GitHub API error: ${putResp.status}`);
        entries = [...dataToSave];
        return true;
      } catch (err) {
        lastError = err;
        retries--;
        if (retries === 0) throw err;
        await new Promise(r => setTimeout(r, 1000 * (4 - retries)));
      }
    }
    throw lastError;
  }

  // ======================== PROJECTS ========================
  async function loadTimesheetProjects() {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${TIMESHEET_PROJECTS_FILE}`;
    try {
      const resp = await githubFetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, { headers: { Authorization: `token ${user.pat}` } });
      if (resp.ok) { const data = await resp.json(); timesheetProjects = JSON.parse(atob(data.content.replace(/\n/g, ''))); }
      else if (resp.status === 404) timesheetProjects = [];
    } catch(e) { console.warn("Failed to load timesheet projects:", e); timesheetProjects = []; }
  }

  async function saveTimesheetProjects(projectsArray) {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${TIMESHEET_PROJECTS_FILE}`;
    const content = JSON.stringify(projectsArray, null, 2);
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

  async function loadProjectsForTimesheet(force = false) {
    if (_projectsLoaded && !force) {
      return;
    }
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
    _projectsLoaded = true;
  }

  async function createTimesheetOnlyProject(projectName) {
    if (allProjectOptions.includes(projectName)) return false;
    await saveTimesheetProjects([...timesheetProjects, projectName]);
    timesheetProjects.push(projectName);
    updateCombinedProjectList();
    await loadProjectsForTimesheet(true);
    return true;
  }

  async function deleteTimesheetProject(projectName) {
    if (!timesheetProjects.includes(projectName)) return false;
    const updated = timesheetProjects.filter(p => p !== projectName);
    await saveTimesheetProjects(updated);
    timesheetProjects = updated;
    updateCombinedProjectList();
    await loadProjectsForTimesheet(true);
    showToast(`Project "${projectName}" deleted from timesheet list.`, "success");
    return true;
  }

  // ======================== UI HELPERS ========================
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

  // ======================== ADD ENTRY – OPTIMISTIC UI ========================
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

    const newEntry = { id: Date.now(), date, start, end, hours, project, category, billable, notes, updatedAt: Date.now() };

    // 1. Optimistically add to local array
    entries = [newEntry, ...entries];

    // 2. Immediately re-render UI
    renderHistory();
    updateSummaryAndProgress();
    updateCharts();
    showToast(duplicateData ? "Entry duplicated!" : "Entry saved locally.", "success");

    // 3. Clear form (if not duplicate)
    if (!duplicateData) {
      document.getElementById('startTime').value = '';
      document.getElementById('endTime').value = '';
      document.getElementById('taskNotes').value = '';
      document.getElementById('hoursAuto').value = '';
    }

    // 4. Background sync to GitHub (don't await – let it run)
    syncEntriesToGitHub().catch(err => console.warn("Background sync error:", err));
  }

  // ======================== DELETE / EDIT / DUPLICATE – also optimistic ========================
  async function deleteEntry(id) {
    if (!confirm("Delete this entry?")) return;
    const deleted = entries.find(e => e.id == id);
    if (!deleted) return;
    entries = entries.filter(e => e.id != id);
    renderHistory();
    updateSummaryAndProgress();
    updateCharts();
    showToast("Entry deleted locally.", "success");
    syncEntriesToGitHub().catch(err => console.warn("Background sync error:", err));
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

    const index = entries.findIndex(e => e.id == id);
    if (index === -1) { showToast("Entry not found.", "error"); return; }
    const updatedEntry = { ...entries[index], date, start, end, hours, project, category, billable, notes, updatedAt: Date.now() };
    entries[index] = updatedEntry;

    renderHistory();
    updateSummaryAndProgress();
    updateCharts();
    $('#editModal').modal('hide');
    showToast("Entry updated locally.", "success");
    syncEntriesToGitHub().catch(err => console.warn("Background sync error:", err));
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

  // ======================== FILTERS & RENDERING ========================
  function getFilteredEntries() {
    const range = document.getElementById('filterRange').value;
    const project = document.getElementById('filterProject').value;
    const category = document.getElementById('filterCategory').value;
    
    const today = new Date();
    const todayYMD = formatDate(today);
    const thisMonthPrefix = todayYMD.substring(0, 7);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const thirtyDaysAgoStr = formatDate(thirtyDaysAgo);
    
    let filtered = [...entries];
    if (range !== 'all') {
      filtered = filtered.filter(entry => {
        const entryDate = entry.date;
        if (range === 'day') {
          return entryDate === todayYMD;
        }
        if (range === 'week') {
          const d = new Date(entryDate);
          d.setUTCHours(0, 0, 0, 0);
          const now = new Date();
          now.setUTCHours(0, 0, 0, 0);
          const day = now.getUTCDay();
          const diff = (day === 0 ? 6 : day - 1);
          const startOfWeek = new Date(now);
          startOfWeek.setUTCDate(now.getUTCDate() - diff);
          startOfWeek.setUTCHours(0, 0, 0, 0);
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
          endOfWeek.setUTCHours(23, 59, 59, 999);
          return d >= startOfWeek && d <= endOfWeek;
        }
        if (range === 'month') {
          return entryDate.substring(0, 7) === thisMonthPrefix;
        }
        if (range === 'last30') {
          return entryDate >= thirtyDaysAgoStr;
        }
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
    
    let totalHours = 0;
    tbody.innerHTML = '';
    
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center">No entries found.</td></tr>';
      document.getElementById('totalHoursCell').innerHTML = '<strong>0.00</strong>';
      tfoot.style.display = 'table-footer-group';
      return;
    }
    
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
      
      const actionCell = row.insertCell(8);
      actionCell.className = 'print-hide';
      
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-sm btn-edit mr-1';
      editBtn.innerHTML = '<i class="fa fa-pencil"></i>';
      editBtn.dataset.id = entry.id;
      editBtn.dataset.action = 'edit';
      
      const dupBtn = document.createElement('button');
      dupBtn.className = 'btn btn-sm btn-duplicate mr-1';
      dupBtn.innerHTML = '<i class="fa fa-copy"></i>';
      dupBtn.dataset.id = entry.id;
      dupBtn.dataset.action = 'duplicate';
      
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.innerHTML = '<i class="fa fa-trash"></i>';
      delBtn.dataset.id = entry.id;
      delBtn.dataset.action = 'delete';
      
      actionCell.appendChild(editBtn);
      actionCell.appendChild(dupBtn);
      actionCell.appendChild(delBtn);
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

    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const todayStr = todayUTC.toISOString().split('T')[0];
    const todayHours = entries.filter(e => e.date === todayStr).reduce((s,e) => s + e.hours, 0);
    
    const percent = Math.min(100, (todayHours / 8) * 100);
    const fill = document.getElementById('dailyProgressFill');
    fill.style.width = percent + '%';
    fill.innerText = todayHours.toFixed(1) + 'h';
    if (todayHours > 8) { 
        fill.classList.add('overtime'); 
        document.getElementById('overtimeWarning').style.display = 'block'; 
        document.getElementById('overtimeWarning').innerHTML = `<i class="fa fa-exclamation-triangle"></i> Overtime: ${(todayHours-8).toFixed(1)}h over 8h today`; 
    } else { 
        fill.classList.remove('overtime'); 
        document.getElementById('overtimeWarning').style.display = 'none'; 
    }
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

  // ======================== WEEK-BASED COLORING HELPER ========================
  function getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  }

  // ======================== SAFE CHART CAPTURE WITH FALLBACK ========================
  let _chartCanvas = null;

  async function safeCaptureChart(chartBuilder, width = 800, height = 600) {
    return new Promise(async (resolve) => {
      if (!_chartCanvas) {
        _chartCanvas = document.createElement('canvas');
        _chartCanvas.style.position = 'absolute';
        _chartCanvas.style.top = '-9999px';
        _chartCanvas.style.left = '-9999px';
        document.body.appendChild(_chartCanvas);
      }
      const canvas = _chartCanvas;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      let chart = null;
      try {
        chart = await chartBuilder(ctx, canvas);
        chart.update();
        await new Promise(r => setTimeout(r, 1000));
        const imgData = canvas.toDataURL('image/png');
        if (imgData.length < 1000) throw new Error('Chart image too small');
        resolve(imgData);
      } catch (err) {
        console.warn('Chart capture failed, using fallback:', err);
        const fallbackCanvas = document.createElement('canvas');
        fallbackCanvas.width = width;
        fallbackCanvas.height = height;
        const fallbackCtx = fallbackCanvas.getContext('2d');
        fallbackCtx.fillStyle = '#f8f9fa';
        fallbackCtx.fillRect(0, 0, width, height);
        fallbackCtx.fillStyle = '#6c757d';
        fallbackCtx.font = '30px Arial';
        fallbackCtx.textAlign = 'center';
        fallbackCtx.textBaseline = 'middle';
        fallbackCtx.fillText('Chart data unavailable', width/2, height/2 - 20);
        fallbackCtx.font = '20px Arial';
        fallbackCtx.fillText('(try refreshing or check data)', width/2, height/2 + 30);
        resolve(fallbackCanvas.toDataURL('image/png'));
      } finally {
        if (chart && typeof chart.destroy === 'function') chart.destroy();
      }
    });
  }

  // ======================== EXCEL EXPORT (with Yearly Calendar grid) ========================
  async function exportStyledExcel(startDate, endDate) {
    window.showLoading("Generating Excel report...");
    try {
      if (typeof getWeekNumber === 'undefined') {
        window.getWeekNumber = function(date) {
          const d = new Date(date);
          d.setHours(0,0,0,0);
          d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
          const week1 = new Date(d.getFullYear(), 0, 4);
          return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
        };
      }
      if (typeof calculateOvertimeForPeriod === 'undefined') {
        window.calculateOvertimeForPeriod = function(entriesList) {
          const dailyHours = {};
          entriesList.forEach(e => { dailyHours[e.date] = (dailyHours[e.date] || 0) + e.hours; });
          return Object.values(dailyHours).reduce((sum, hrs) => sum + (hrs > 8 ? hrs - 8 : 0), 0);
        };
      }

      const filtered = entries.filter(e => e.date >= startDate && e.date <= endDate);
      if (!filtered.length) {
        showToast("No entries in selected range.", "error");
        window.hideLoading();
        return;
      }

      filtered.forEach(e => { e.weekKey = `${new Date(e.date).getFullYear()}-W${getWeekNumber(e.date)}`; });
      const weeks = [...new Map(filtered.map(e => [e.weekKey, e.weekKey])).values()];
      const weekFills = weeks.map((w, idx) => ({
        week: w,
        fill: idx % 2 === 0 
          ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F0FA' } }
          : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E7' } }
      }));
      const getRowFill = (entry) => weekFills.find(wf => wf.week === entry.weekKey)?.fill || { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

      const workbook = new ExcelJS.Workbook();
      workbook.calcProperties = { fullCalcOnLoad: true };

      // ==================== SHEET 1: TIMESHEET DATA ====================
      const worksheet = workbook.addWorksheet("Timesheet Data", {
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, horizontalCentered: true, verticalCentered: true }
      });

      const headers = ['Date','Start','End','Hours','Project','Category','Billable','Notes'];
      const colMaxLen = [10, 8, 8, 8, 20, 15, 12, 40];
      for (const row of filtered) {
        const values = [
          row.date, row.start, row.end, row.hours.toFixed(2),
          row.project, row.category,
          row.billable === 'yes' ? 'Billable' : 'Non-billable',
          row.notes || ''
        ];
        for (let i = 0; i < values.length; i++) {
          const len = values[i].toString().length;
          if (len > colMaxLen[i]) colMaxLen[i] = Math.min(len, 60);
        }
      }
      for (let i = 0; i < headers.length; i++) {
        if (headers[i].length > colMaxLen[i]) colMaxLen[i] = headers[i].length;
      }
      worksheet.columns = colMaxLen.map(w => ({ width: w + 2 }));
      worksheet.getColumn(4).numFmt = '0.00';

      worksheet.mergeCells('A1:H1');
      const titleCell = worksheet.getRow(1).getCell(1);
      titleCell.value = `TIMESHEET REPORT - ${userFullName || user.username}`;
      titleCell.font = { size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 32;

      worksheet.mergeCells('A2:H2');
      const periodCell = worksheet.getRow(2).getCell(1);
      periodCell.value = `Period: ${startDate} to ${endDate}  |  Generated: ${new Date().toLocaleString()}`;
      periodCell.font = { size: 11, italic: true };
      periodCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4FA' } };
      periodCell.alignment = { horizontal: 'center' };
      worksheet.getRow(2).height = 22;

      const totalHours = filtered.reduce((s,e) => s + e.hours, 0);
      const billableHours = filtered.filter(e => e.billable === 'yes').reduce((s,e) => s + e.hours, 0);
      const nonBillable = totalHours - billableHours;
      const overtime = calculateOvertimeForPeriod(filtered);
      const summaryText = `📊 Total: ${totalHours.toFixed(1)} hrs  |  Billable: ${billableHours.toFixed(1)}  |  Non-billable: ${nonBillable.toFixed(1)}  |  Overtime: ${overtime.toFixed(1)}`;
      worksheet.mergeCells('A3:H3');
      const summaryCell = worksheet.getRow(3).getCell(1);
      summaryCell.value = summaryText;
      summaryCell.font = { bold: true, size: 10 };
      summaryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EDF7' } };
      worksheet.getRow(3).height = 24;

      const headerRow = worksheet.getRow(4);
      headers.forEach((h, idx) => {
        const cell = headerRow.getCell(idx+1);
        cell.value = h;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });
      worksheet.getRow(4).height = 22;

      let currentRow = 5;
      for (const entry of filtered) {
        const row = worksheet.getRow(currentRow);
        row.getCell(1).value = entry.date;
        row.getCell(2).value = entry.start;
        row.getCell(3).value = entry.end;
        row.getCell(4).value = parseFloat(entry.hours) || 0;
        row.getCell(5).value = entry.project;
        row.getCell(6).value = entry.category;
        row.getCell(7).value = entry.billable === 'yes' ? 'Billable' : 'Non-billable';
        row.getCell(8).value = entry.notes || '';

        for (let i = 1; i <= 8; i++) {
          const cell = row.getCell(i);
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          cell.alignment = { vertical: 'middle', wrapText: (i === 8) };
          if (i !== 8 && i !== 4) cell.alignment.horizontal = 'left';
          if (i === 4) cell.alignment.horizontal = 'right';
        }
        const rowFill = getRowFill(entry);
        for (let i = 1; i <= 8; i++) row.getCell(i).fill = rowFill;

        const billCell = row.getCell(7);
        if (entry.billable === 'yes') {
          billCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
          billCell.font = { color: { argb: 'FF006400' }, bold: true };
        } else {
          billCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
          billCell.font = { color: { argb: 'FF8B0000' } };
        }
        currentRow++;
      }

      const totalRowNum = currentRow;
      const totalRow = worksheet.getRow(totalRowNum);
      const totalHoursSum = filtered.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0);
      totalRow.getCell(4).value = totalHoursSum;
      totalRow.getCell(4).numFmt = '0.00';
      totalRow.getCell(4).font = { bold: true, size: 11 };
      for (let i = 1; i <= 8; i++) {
        const cell = totalRow.getCell(i);
        if (i !== 4) cell.value = '';
        cell.border = { top: { style: 'thin' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
      }

      worksheet.eachRow((row, rowNumber) => {
        let maxHeight = 18;
        const noteCell = row.getCell(8);
        if (noteCell.value && noteCell.value.toString().length > 30) {
          const lines = Math.ceil(noteCell.value.toString().length / 45);
          maxHeight = Math.max(maxHeight, 15 * lines);
        }
        row.height = maxHeight;
      });

      const filterRange = `E4:G${totalRowNum}`;
      worksheet.autoFilter = filterRange;

      worksheet.views = [{ state: 'frozen', ySplit: 4 }];
      worksheet.pageSetup.printArea = `A1:H${totalRowNum}`;
      
      worksheet.protect('Siya', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertRows: false,
        deleteRows: false,
        insertColumns: false,
        deleteColumns: false,
        sort: false,
        autoFilter: true,
        pivotTables: false
      });

      // ==================== SHEET 2: SUMMARY ====================
      const summarySheet = workbook.addWorksheet("Summary", {
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 }
      });
      summarySheet.columns = [{ width: 25 }, { width: 20 }, { width: 20 }];
      
      summarySheet.mergeCells('A1:C1');
      const sumTitle = summarySheet.getRow(1).getCell(1);
      sumTitle.value = `TIMESHEET SUMMARY - ${userFullName || user.username}`;
      sumTitle.font = { size: 16, bold: true, color: { argb: 'FF0B2B3B' } };
      sumTitle.alignment = { horizontal: 'center' };
      summarySheet.getRow(1).height = 28;

      summarySheet.mergeCells('A2:C2');
      const sumPeriod = summarySheet.getRow(2).getCell(1);
      sumPeriod.value = `Period: ${startDate} to ${endDate}  |  Generated: ${new Date().toLocaleString()}`;
      sumPeriod.font = { size: 10, italic: true };
      sumPeriod.alignment = { horizontal: 'center' };
      summarySheet.getRow(2).height = 20;

      const adminHours = filtered.filter(e => e.category === 'Admin').reduce((s,e) => s + e.hours, 0);
      const adminRatio = totalHours > 0 ? (adminHours / totalHours) * 100 : 0;
      const uniqueProjects = new Set(filtered.map(e => e.project)).size;
      const uniqueDays = new Set(filtered.map(e => e.date)).size;
      const avgDaily = uniqueDays > 0 ? totalHours / uniqueDays : 0;
      
      const kpiRows = [
        ["Total Hours", totalHours.toFixed(1)],
        ["Billable Hours", billableHours.toFixed(1)],
        ["Non-Billable Hours", nonBillable.toFixed(1)],
        ["Overtime Hours", overtime.toFixed(1)],
        ["Unique Projects", uniqueProjects],
        ["Unique Working Days", uniqueDays],
        ["Average Daily Hours", avgDaily.toFixed(1)],
        ["Admin Hours", adminHours.toFixed(1)],
        ["Admin Ratio (%)", adminRatio.toFixed(1) + "%"],
        ["Total Entries", filtered.length]
      ];
      
      let r = 4;
      for (const [label, val] of kpiRows) {
        const labelCell = summarySheet.getRow(r).getCell(1);
        labelCell.value = label;
        labelCell.font = { bold: true, size: 11 };
        labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4FA' } };
        labelCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        const valCell = summarySheet.getRow(r).getCell(2);
        valCell.value = val;
        valCell.font = { size: 12, bold: true, color: { argb: 'FF0B2B3B' } };
        valCell.alignment = { horizontal: 'right' };
        valCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        r++;
      }

      try {
        const projMap = {};
        filtered.forEach(e => { projMap[e.project] = (projMap[e.project] || 0) + e.hours; });
        const projLabels = Object.keys(projMap).slice(0, 10);
        const projData = projLabels.map(l => projMap[l]);
        
        const canvas = document.createElement('canvas');
        canvas.width = 900;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
          type: 'bar',
          data: { 
            labels: projLabels, 
            datasets: [{ label: 'Hours', data: projData, backgroundColor: '#2fc7ff' }] 
          },
          options: {
            responsive: false,
            maintainAspectRatio: true,
            plugins: {
              legend: { labels: { font: { size: 48 } } },
              title: { display: true, text: 'Top Projects by Hours', font: { size: 56 } }
            },
            scales: {
              x: { 
                ticks: { font: { size: 36 } },
                title: { display: true, text: 'Project', font: { size: 48 } }
              },
              y: { 
                ticks: { font: { size: 40 } },
                title: { display: true, text: 'Hours', font: { size: 48 } }
              }
            }
          }
        });
        chart.update();
        await new Promise(r => setTimeout(r, 800));
        const chartBase64 = canvas.toDataURL('image/png');
        chart.destroy();
        const chartImageId = workbook.addImage({ base64: chartBase64, extension: 'png' });
        summarySheet.addImage(chartImageId, {
          tl: { col: 0, row: r + 1 },
          ext: { width: 450, height: 300 },
          editAs: 'oneCell'
        });
      } catch(e) { console.warn("Summary chart skipped", e); }

      summarySheet.getRow(50).getCell(1).value = `Generated by Your Portfolio System`;
      summarySheet.getRow(50).getCell(1).font = { italic: true, size: 8 };
      summarySheet.mergeCells('A50:C50');

      summarySheet.protect('Siya', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertRows: false,
        deleteRows: false,
        insertColumns: false,
        deleteColumns: false,
        sort: false,
        autoFilter: false,
        pivotTables: false
      });

      // ==================== SHEET 3: CHARTS ====================
      const chartsSheet = workbook.addWorksheet("Charts", {
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 }
      });
      
      chartsSheet.mergeCells('A1:F1');
      const chartsTitle = chartsSheet.getRow(1).getCell(1);
      chartsTitle.value = "VISUAL ANALYTICS DASHBOARD";
      chartsTitle.font = { size: 20, bold: true, color: { argb: 'FF0B2B3B' } };
      chartsTitle.alignment = { horizontal: 'center' };
      chartsSheet.getRow(1).height = 38;
      
      chartsSheet.getColumn(1).width = 46;
      chartsSheet.getColumn(2).width = 8;
      chartsSheet.getColumn(3).width = 8;
      chartsSheet.getColumn(4).width = 8;
      chartsSheet.getColumn(5).width = 46;
      chartsSheet.getColumn(6).width = 8;

      chartsSheet.getRow(2).height = 25;
      chartsSheet.getRow(3).height = 5;

      const CHART_WIDTH = 380;
      const CHART_HEIGHT = 290;
      const ROW_OFFSET = Math.ceil((CHART_HEIGHT + 90) / 20) + 4;

      async function addChart(chartsSheet, chartBuilder, col, row, title) {
        try {
          const imgData = await safeCaptureChart(chartBuilder, 1200, 900);
          const imageId = workbook.addImage({ base64: imgData, extension: 'png' });
          const colOffset = col === 0 ? 0.5 : 4.5;
          chartsSheet.addImage(imageId, {
            tl: { col: colOffset, row: row },
            ext: { width: CHART_WIDTH, height: CHART_HEIGHT },
            editAs: 'oneCell'
          });
          const titleRow = row - 1;
          if (titleRow >= 0) {
            const colLetter = col === 0 ? 'A' : 'E';
            const titleCellRef = chartsSheet.getRow(titleRow + 1).getCell(col === 0 ? 1 : 5);
            titleCellRef.value = title;
            titleCellRef.font = { bold: true, size: 12, color: { argb: 'FF0B2B3B' } };
            titleCellRef.alignment = { horizontal: 'center', vertical: 'middle' };
            titleCellRef.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } };
            titleCellRef.border = { bottom: { style: 'thin', color: { argb: 'FFD0D8E0' } } };
            chartsSheet.getRow(titleRow + 1).height = 26;
          }
          return true;
        } catch(e) {
          console.warn(`Chart "${title}" failed:`, e);
          return false;
        }
      }

      const row1Start = 4;
      
      await addChart(chartsSheet, (ctx, canvas) => {
        const catMap = {};
        filtered.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.hours; });
        return new Chart(ctx, {
          type: 'pie',
          data: { labels: Object.keys(catMap), datasets: [{ data: Object.values(catMap), backgroundColor: ['#2fc7ff', '#ffc107', '#28a745', '#dc3545', '#6f42c1', '#fd7e14', '#17a2b8', '#e83e8c'] }] },
          options: { responsive: false, maintainAspectRatio: true, plugins: { legend: { position: 'right', labels: { font: { size: 56 } } }, title: { display: true, text: 'Hours by Category', font: { size: 64 } }, tooltip: { bodyFont: { size: 32 } } } }
        });
      }, 0, row1Start, 'Hours by Category');

      await addChart(chartsSheet, (ctx, canvas) => {
        return new Chart(ctx, {
          type: 'doughnut',
          data: { labels: ['Billable', 'Non-Billable'], datasets: [{ data: [billableHours, nonBillable], backgroundColor: ['#28a745', '#dc3545'] }] },
          options: { responsive: false, maintainAspectRatio: true, plugins: { legend: { position: 'right', labels: { font: { size: 56 } } }, title: { display: true, text: 'Billable Breakdown', font: { size: 64 } }, tooltip: { bodyFont: { size: 32 } } } }
        });
      }, 1, row1Start, 'Billable Breakdown');

      const row2Start = row1Start + ROW_OFFSET + 4;
      
      await addChart(chartsSheet, (ctx, canvas) => {
        const weeklyTotals = {};
        filtered.forEach(e => {
          const week = `${new Date(e.date).getFullYear()}-W${getWeekNumber(e.date)}`;
          weeklyTotals[week] = (weeklyTotals[week] || 0) + e.hours;
        });
        const weeksSorted = Object.keys(weeklyTotals).sort();
        const weekData = weeksSorted.map(w => weeklyTotals[w]);
        return new Chart(ctx, {
          type: 'line',
          data: { labels: weeksSorted, datasets: [{ label: 'Total Hours', data: weekData, borderColor: '#2fc7ff', backgroundColor: 'rgba(47,199,255,0.1)', fill: true, tension: 0.3 }] },
          options: { responsive: false, maintainAspectRatio: true, plugins: { legend: { labels: { font: { size: 56 } } }, title: { display: true, text: 'Weekly Hours Trend', font: { size: 64 } }, tooltip: { bodyFont: { size: 32 } } }, scales: { x: { ticks: { font: { size: 40 } } }, y: { ticks: { font: { size: 48 } } } } }
        });
      }, 0, row2Start, 'Weekly Hours Trend');

      await addChart(chartsSheet, (ctx, canvas) => {
        const weeklyAdmin = {};
        const weeklyProject = {};
        filtered.forEach(e => {
          const week = `${new Date(e.date).getFullYear()}-W${getWeekNumber(e.date)}`;
          if (e.category === 'Admin') {
            weeklyAdmin[week] = (weeklyAdmin[week] || 0) + e.hours;
          } else {
            weeklyProject[week] = (weeklyProject[week] || 0) + e.hours;
          }
        });
        const allWeeks = [...new Set([...Object.keys(weeklyAdmin), ...Object.keys(weeklyProject)])].sort();
        return new Chart(ctx, {
          type: 'bar',
          data: { labels: allWeeks, datasets: [{ label: 'Admin Hours', data: allWeeks.map(w => weeklyAdmin[w] || 0), backgroundColor: '#ffc107' }, { label: 'Project Hours', data: allWeeks.map(w => weeklyProject[w] || 0), backgroundColor: '#2fc7ff' }] },
          options: { responsive: false, maintainAspectRatio: true, scales: { x: { stacked: true, ticks: { font: { size: 36 } } }, y: { stacked: true, ticks: { font: { size: 48 } } } }, plugins: { legend: { labels: { font: { size: 56 } } }, title: { display: true, text: 'Admin vs Project Hours', font: { size: 64 } }, tooltip: { bodyFont: { size: 32 } } } }
        });
      }, 1, row2Start, 'Admin vs Project Hours');

      const row3Start = row2Start + ROW_OFFSET + 4;
      
      await addChart(chartsSheet, (ctx, canvas) => {
        const weeklyBillable = {};
        const weeklyNonBillable = {};
        filtered.forEach(e => {
          const week = `${new Date(e.date).getFullYear()}-W${getWeekNumber(e.date)}`;
          if (e.billable === 'yes') {
            weeklyBillable[week] = (weeklyBillable[week] || 0) + e.hours;
          } else {
            weeklyNonBillable[week] = (weeklyNonBillable[week] || 0) + e.hours;
          }
        });
        const allWeeks = [...new Set([...Object.keys(weeklyBillable), ...Object.keys(weeklyNonBillable)])].sort();
        return new Chart(ctx, {
          type: 'bar',
          data: { 
            labels: allWeeks, 
            datasets: [
              { label: 'Billable', data: allWeeks.map(w => weeklyBillable[w] || 0), backgroundColor: '#28a745' },
              { label: 'Non-Billable', data: allWeeks.map(w => weeklyNonBillable[w] || 0), backgroundColor: '#dc3545' }
            ] 
          },
          options: { 
            responsive: false, 
            maintainAspectRatio: true, 
            scales: { 
              x: { stacked: true, ticks: { font: { size: 36 } } }, 
              y: { stacked: true, ticks: { font: { size: 48 } } } 
            }, 
            plugins: { 
              legend: { labels: { font: { size: 56 } } }, 
              title: { display: true, text: 'Weekly Billable vs Non-Billable', font: { size: 64 } }, 
              tooltip: { bodyFont: { size: 32 } } 
            } 
          }
        });
      }, 0, row3Start, 'Weekly Billable vs Non-Billable');

      await addChart(chartsSheet, (ctx, canvas) => {
        const projMap = {};
        filtered.forEach(e => { projMap[e.project] = (projMap[e.project] || 0) + e.hours; });
        const sortedProjects = Object.entries(projMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
        return new Chart(ctx, {
          type: 'bar',
          data: { labels: sortedProjects.map(p => p[0]), datasets: [{ label: 'Hours', data: sortedProjects.map(p => p[1]), backgroundColor: ['#2fc7ff', '#28a745', '#ffc107', '#dc3545', '#6f42c1', '#fd7e14', '#17a2b8', '#e83e8c'], borderRadius: 4 }] },
          options: { responsive: false, maintainAspectRatio: true, indexAxis: 'y', plugins: { legend: { labels: { font: { size: 56 } } }, title: { display: true, text: 'Top Projects by Hours', font: { size: 64 } }, tooltip: { bodyFont: { size: 32 } } }, scales: { x: { ticks: { font: { size: 48 } } }, y: { ticks: { font: { size: 40 } } } } }
        });
      }, 1, row3Start, 'Top Projects by Hours');

      const footerRow = row3Start + ROW_OFFSET + 6;
      chartsSheet.getRow(footerRow).getCell(1).value = `Generated: ${new Date().toLocaleString()} | Your Portfolio System`;
      chartsSheet.getRow(footerRow).getCell(1).font = { italic: true, size: 9 };
      chartsSheet.mergeCells(`A${footerRow}:F${footerRow}`);
      chartsSheet.getRow(footerRow).height = 25;

      chartsSheet.protect('Siya', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertRows: false,
        deleteRows: false,
        insertColumns: false,
        deleteColumns: false,
        sort: false,
        autoFilter: false,
        pivotTables: false
      });

      // ==================== SHEET 4: ADVANCED ANALYSIS ====================
      const analysisSheet = workbook.addWorksheet("Advanced Analysis", {
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 }
      });
      analysisSheet.columns = [{ width: 28 }, { width: 22 }, { width: 35 }];
      
      analysisSheet.mergeCells('A1:C1');
      const analysisTitle = analysisSheet.getRow(1).getCell(1);
      analysisTitle.value = "DEEP DIVE ANALYSIS";
      analysisTitle.font = { size: 16, bold: true, color: { argb: 'FF0B2B3B' } };
      analysisTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4FA' } };
      analysisTitle.alignment = { horizontal: 'center', vertical: 'middle' };
      analysisSheet.getRow(1).height = 32;

      let rowIdx = 3;
      
      function addSectionHeader(title, startRow) {
        const cell = analysisSheet.getRow(startRow).getCell(1);
        cell.value = title;
        cell.font = { bold: true, size: 12 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
        cell.font.color = { argb: 'FFFFFFFF' };
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
        analysisSheet.mergeCells(`A${startRow}:C${startRow}`);
        analysisSheet.getRow(startRow).height = 22;
        return startRow + 1;
      }

      function addKeyValue(label, value, row) {
        const labelCell = analysisSheet.getRow(row).getCell(1);
        labelCell.value = label;
        labelCell.font = { bold: true };
        labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
        labelCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        const valCell = analysisSheet.getRow(row).getCell(2);
        valCell.value = value;
        valCell.font = { size: 11 };
        valCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        valCell.alignment = { horizontal: 'right' };
        return row + 1;
      }

      function addTwoColumnTable(data, startRow, col1Header, col2Header) {
        let r = startRow;
        const h1 = analysisSheet.getRow(r).getCell(1);
        h1.value = col1Header;
        h1.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        h1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
        h1.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        const h2 = analysisSheet.getRow(r).getCell(2);
        h2.value = col2Header;
        h2.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        h2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
        h2.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        analysisSheet.getRow(r).height = 22;
        r++;
        for (let i = 0; i < data.length; i++) {
          const [colA, colB] = data[i];
          const row = analysisSheet.getRow(r);
          const aCell = row.getCell(1);
          aCell.value = colA;
          aCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          aCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFE6F0FA' : 'FFFFF8E7' } };
          const bCell = row.getCell(2);
          bCell.value = colB;
          bCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          bCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFE6F0FA' : 'FFFFF8E7' } };
          bCell.alignment = { horizontal: 'right' };
          r++;
        }
        return r + 1;
      }

      // ===== 1. KEY METRICS =====
      rowIdx = addSectionHeader("📈 KEY METRICS", rowIdx);
      const workingDays = new Set(filtered.map(e => e.date));
      const avgDaily2 = totalHours / workingDays.size;
      rowIdx = addKeyValue("Average Daily Hours", avgDaily2.toFixed(2), rowIdx);
      rowIdx = addKeyValue("Total Hours", totalHours.toFixed(1), rowIdx);
      rowIdx = addKeyValue("Billable Hours", billableHours.toFixed(1), rowIdx);
      rowIdx = addKeyValue("Non-Billable Hours", nonBillable.toFixed(1), rowIdx);
      rowIdx = addKeyValue("Overtime Hours", overtime.toFixed(1), rowIdx);
      rowIdx = addKeyValue("Admin Ratio (%)", adminRatio.toFixed(1) + "%", rowIdx);
      rowIdx = addKeyValue("Unique Projects", uniqueProjects, rowIdx);
      rowIdx += 1;

      // ===== 2. ADMIN RATIO BY WEEK =====
      rowIdx = addSectionHeader("📊 ADMIN RATIO BY WEEK", rowIdx);
      const weeklyAdminTable = [];
      const weeklyAdminMap = new Map();
      filtered.forEach(e => {
        const week = getWeekNumber(e.date);
        const year = new Date(e.date).getFullYear();
        const key = `${year}-W${week}`;
        if (!weeklyAdminMap.has(key)) weeklyAdminMap.set(key, { total: 0, admin: 0 });
        const w = weeklyAdminMap.get(key);
        w.total += e.hours;
        if (e.category === 'Admin') w.admin += e.hours;
      });
      for (let [week, data] of weeklyAdminMap) {
        const ratio = data.total > 0 ? (data.admin / data.total) * 100 : 0;
        weeklyAdminTable.push([week, ratio.toFixed(1) + "%"]);
      }
      rowIdx = addTwoColumnTable(weeklyAdminTable, rowIdx, "Week", "Admin %");
      rowIdx += 1;

      // ===== 3. MONTHLY COMPARISON =====
      rowIdx = addSectionHeader("📅 MONTHLY COMPARISON", rowIdx);
      
      const monthlyData = {};
      filtered.forEach(e => {
        const monthKey = e.date.substring(0, 7);
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { total: 0, billable: 0, overtime: 0, days: new Set() };
        }
        monthlyData[monthKey].total += e.hours;
        if (e.billable === 'yes') monthlyData[monthKey].billable += e.hours;
        monthlyData[monthKey].days.add(e.date);
      });
      
      const monthlyOvertime = {};
      const dailyHoursByMonth = {};
      filtered.forEach(e => {
        const monthKey = e.date.substring(0, 7);
        if (!dailyHoursByMonth[monthKey]) dailyHoursByMonth[monthKey] = {};
        const day = e.date;
        if (!dailyHoursByMonth[monthKey][day]) dailyHoursByMonth[monthKey][day] = 0;
        dailyHoursByMonth[monthKey][day] += e.hours;
      });
      for (const monthKey in dailyHoursByMonth) {
        let ot = 0;
        for (const day in dailyHoursByMonth[monthKey]) {
          const hrs = dailyHoursByMonth[monthKey][day];
          if (hrs > 8) ot += (hrs - 8);
        }
        monthlyOvertime[monthKey] = ot;
      }
      
      const monthKeys = Object.keys(monthlyData).sort();
      const monthTable = [];
      let prevTotal = null;
      
      function formatMonthKey(monthKey) {
        const [year, month] = monthKey.split('-');
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                           'July', 'August', 'September', 'October', 'November', 'December'];
        return monthNames[parseInt(month) - 1] + '-' + year;
      }
      
      for (const m of monthKeys) {
        const data = monthlyData[m];
        const total = data.total;
        const billable = data.billable;
        const days = data.days.size;
        const avg = days > 0 ? total / days : 0;
        const ot = monthlyOvertime[m] || 0;
        let growth = null;
        if (prevTotal !== null) {
          const diff = total - prevTotal;
          growth = (prevTotal > 0) ? ((diff / prevTotal) * 100) : 0;
        }
        monthTable.push({
          month: formatMonthKey(m),
          total: total,
          billable: billable,
          overtime: ot,
          avg: avg,
          growth: growth
        });
        prevTotal = total;
      }
      
      const monthHeaders = ['Month', 'Hours', 'Billable', 'Overtime', 'Avg/Day', 'Growth'];
      const monthDataRows = monthTable.map(row => [
        row.month,
        row.total.toFixed(1),
        row.billable.toFixed(1),
        row.overtime.toFixed(1),
        row.avg.toFixed(1),
        row.growth !== null ? (row.growth >= 0 ? '+' : '') + row.growth.toFixed(1) + '%' : '-'
      ]);
      
      const hRow = analysisSheet.getRow(rowIdx);
      monthHeaders.forEach((h, idx) => {
        const cell = hRow.getCell(idx+1);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      analysisSheet.getRow(rowIdx).height = 22;
      rowIdx++;
      
      for (const rowData of monthDataRows) {
        const row = analysisSheet.getRow(rowIdx);
        rowData.forEach((val, idx) => {
          const cell = row.getCell(idx+1);
          cell.value = val;
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          cell.alignment = { vertical: 'middle', horizontal: (idx === 0) ? 'left' : 'right' };
          if (idx === 5 && val !== '-') {
            const num = parseFloat(val);
            if (!isNaN(num)) {
              cell.font = { color: { argb: num >= 0 ? 'FF28A745' : 'FFDC3545' }, bold: true };
            }
          }
        });
        analysisSheet.getRow(rowIdx).height = 18;
        rowIdx++;
      }
      rowIdx += 1;

      // ===== 4. BUSIEST DAY OF WEEK =====
      rowIdx = addSectionHeader("📅 BUSIEST DAY OF WEEK", rowIdx);
      const dayMap = { Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0, Sunday: 0 };
      const dayCount = { Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0, Sunday: 0 };
      filtered.forEach(e => {
        const d = new Date(e.date);
        const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const dayName = dayNames[d.getUTCDay()];
        dayMap[dayName] += e.hours;
        dayCount[dayName] += 1;
      });
      const dayTable = Object.keys(dayMap).map(day => {
        const avg = dayCount[day] > 0 ? dayMap[day] / dayCount[day] : 0;
        return [day, dayMap[day].toFixed(1), avg.toFixed(1)];
      });
      dayTable.sort((a, b) => parseFloat(b[2]) - parseFloat(a[2]));
      
      const dayHeaders = ['Day', 'Total Hours', 'Avg Hours'];
      const dayRow = analysisSheet.getRow(rowIdx);
      dayHeaders.forEach((h, idx) => {
        const cell = dayRow.getCell(idx+1);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      analysisSheet.getRow(rowIdx).height = 22;
      rowIdx++;
      for (const rowData of dayTable) {
        const row = analysisSheet.getRow(rowIdx);
        rowData.forEach((val, idx) => {
          const cell = row.getCell(idx+1);
          cell.value = val;
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          cell.alignment = { vertical: 'middle', horizontal: (idx === 0) ? 'left' : 'right' };
          if (idx === 2 && parseFloat(val) === parseFloat(dayTable[0][2])) {
            cell.font = { bold: true, color: { argb: 'FF28A745' } };
          }
        });
        analysisSheet.getRow(rowIdx).height = 18;
        rowIdx++;
      }
      rowIdx += 1;

      // ===== 5. PROJECT DISTRIBUTION =====
      rowIdx = addSectionHeader("📊 PROJECT DISTRIBUTION", rowIdx);
      const projDist = {};
      filtered.forEach(e => { projDist[e.project] = (projDist[e.project] || 0) + e.hours; });
      const sortedProj = Object.entries(projDist).sort((a, b) => b[1] - a[1]);
      const totalProjHours = sortedProj.reduce((sum, p) => sum + p[1], 0);
      const projTable = sortedProj.map(([proj, hrs]) => {
        const pct = totalProjHours > 0 ? (hrs / totalProjHours) * 100 : 0;
        return [proj, hrs.toFixed(1), pct.toFixed(1) + '%'];
      });
      
      const projHeaders = ['Project', 'Hours', 'Share'];
      const projRow = analysisSheet.getRow(rowIdx);
      projHeaders.forEach((h, idx) => {
        const cell = projRow.getCell(idx+1);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      analysisSheet.getRow(rowIdx).height = 22;
      rowIdx++;
      for (const rowData of projTable.slice(0, 10)) {
        const row = analysisSheet.getRow(rowIdx);
        rowData.forEach((val, idx) => {
          const cell = row.getCell(idx+1);
          cell.value = val;
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          cell.alignment = { vertical: 'middle', horizontal: (idx === 0) ? 'left' : 'right' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4FA' } };
        });
        analysisSheet.getRow(rowIdx).height = 18;
        rowIdx++;
      }
      rowIdx += 1;

      // ===== 6. BILLABLE RATIO TREND =====
      rowIdx = addSectionHeader("📈 BILLABLE RATIO TREND", rowIdx);
      const monthlyBillable = {};
      filtered.forEach(e => {
        const m = e.date.substring(0, 7);
        if (!monthlyBillable[m]) monthlyBillable[m] = { total: 0, billable: 0 };
        monthlyBillable[m].total += e.hours;
        if (e.billable === 'yes') monthlyBillable[m].billable += e.hours;
      });
      const billableTrend = Object.keys(monthlyBillable).sort().map(m => {
        const data = monthlyBillable[m];
        const ratio = data.total > 0 ? (data.billable / data.total) * 100 : 0;
        const formattedMonth = formatMonthKey(m);
        return [formattedMonth, data.total.toFixed(1), data.billable.toFixed(1), ratio.toFixed(1) + '%'];
      });
      
      const trendHeaders = ['Month', 'Total', 'Billable', 'Billable %'];
      const trendRow = analysisSheet.getRow(rowIdx);
      trendHeaders.forEach((h, idx) => {
        const cell = trendRow.getCell(idx+1);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      analysisSheet.getRow(rowIdx).height = 22;
      rowIdx++;
      for (const rowData of billableTrend) {
        const row = analysisSheet.getRow(rowIdx);
        rowData.forEach((val, idx) => {
          const cell = row.getCell(idx+1);
          cell.value = val;
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          cell.alignment = { vertical: 'middle', horizontal: (idx === 0) ? 'left' : 'right' };
          if (idx === 3) {
            const num = parseFloat(val);
            if (!isNaN(num)) {
              cell.font = { color: { argb: num >= 80 ? 'FF28A745' : (num >= 60 ? 'FFFFC107' : 'FFDC3545') }, bold: true };
            }
          }
        });
        analysisSheet.getRow(rowIdx).height = 18;
        rowIdx++;
      }
      rowIdx += 1;

      // ===== 7. CATEGORY INSIGHTS =====
      rowIdx = addSectionHeader("📋 CATEGORY INSIGHTS", rowIdx);
      const catCount = {};
      filtered.forEach(e => { catCount[e.category] = (catCount[e.category] || 0) + 1; });
      const sortedCats = Object.entries(catCount).sort((a, b) => b[1] - a[1]);
      const mostUsed = sortedCats.length > 0 ? sortedCats[0][0] : 'N/A';
      const mostCount = sortedCats.length > 0 ? sortedCats[0][1] : 0;
      
      rowIdx = addKeyValue("Most Used Category", mostUsed + ' (' + mostCount + ' entries)', rowIdx);
      rowIdx = addKeyValue("Total Categories Used", sortedCats.length, rowIdx);
      
      const catHeaders = ['Category', 'Entries', 'Share'];
      const catRow = analysisSheet.getRow(rowIdx);
      catHeaders.forEach((h, idx) => {
        const cell = catRow.getCell(idx+1);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      analysisSheet.getRow(rowIdx).height = 22;
      rowIdx++;
      const totalEntries = filtered.length;
      for (const [cat, count] of sortedCats.slice(0, 8)) {
        const row = analysisSheet.getRow(rowIdx);
        const pct = totalEntries > 0 ? (count / totalEntries) * 100 : 0;
        const cells = [cat, count, pct.toFixed(1) + '%'];
        cells.forEach((val, idx) => {
          const cell = row.getCell(idx+1);
          cell.value = val;
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          cell.alignment = { vertical: 'middle', horizontal: (idx === 0) ? 'left' : 'right' };
        });
        analysisSheet.getRow(rowIdx).height = 18;
        rowIdx++;
      }
      rowIdx += 1;

      // ===== 8. TOP 3 PROJECTS =====
      rowIdx = addSectionHeader("🏆 TOP 3 PROJECTS (HOURS)", rowIdx);
      const projTotals = {};
      filtered.forEach(e => { projTotals[e.project] = (projTotals[e.project] || 0) + e.hours; });
      const topProjects = Object.entries(projTotals).sort((a,b) => b[1] - a[1]).slice(0,3);
      const topTable = topProjects.map(([proj, hrs]) => [proj, hrs.toFixed(1)]);
      rowIdx = addTwoColumnTable(topTable, rowIdx, "Project", "Hours");
      rowIdx += 1;

      // ===== 9. OVERTIME DAYS =====
      rowIdx = addSectionHeader("⚠️ OVERTIME DAYS (>8h)", rowIdx);
      const overtimeDays = filtered.filter(e => e.hours > 8);
      const overtimeTable = overtimeDays.map(e => [e.date, e.hours.toFixed(2)]);
      if (overtimeTable.length === 0) overtimeTable.push(["None", ""]);
      rowIdx = addTwoColumnTable(overtimeTable, rowIdx, "Date", "Hours");
      rowIdx += 1;

      // ===== 10. CONSISTENCY =====
      rowIdx = addSectionHeader("⏳ CONSISTENCY", rowIdx);
      const sortedDates = [...new Set(filtered.map(e => e.date))].sort();
      let maxGap = 0;
      for (let i = 1; i < sortedDates.length; i++) {
        const diff = (new Date(sortedDates[i]) - new Date(sortedDates[i-1])) / (1000*3600*24);
        if (diff > 1) {
          const gap = diff - 1;
          if (gap > maxGap) maxGap = gap;
        }
      }
      rowIdx = addKeyValue("Longest gap between entries (days)", maxGap.toString(), rowIdx);
      rowIdx += 1;

      // ===== 11. PORTFOLIO HEALTH SCORE =====
      rowIdx = addSectionHeader("💚 PORTFOLIO HEALTH SCORE", rowIdx);
      let healthScore = 100;
      if (adminRatio > 15) healthScore -= 10;
      if (overtimeDays.length > 3) healthScore -= 15;
      if (uniqueProjects === 0) healthScore -= 50;
      healthScore = Math.max(0, healthScore);
      const scoreCell = analysisSheet.getRow(rowIdx).getCell(1);
      scoreCell.value = "Health Score (0-100)";
      scoreCell.font = { bold: true };
      scoreCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
      scoreCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      const scoreValCell = analysisSheet.getRow(rowIdx).getCell(2);
      scoreValCell.value = healthScore;
      scoreValCell.font = { size: 14, bold: true, color: { argb: healthScore >= 80 ? 'FF28A745' : (healthScore >= 50 ? 'FFFFC107' : 'FFDC3545') } };
      scoreValCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      scoreValCell.alignment = { horizontal: 'right' };
      rowIdx += 2;

      const footerRow2 = rowIdx;
      analysisSheet.getRow(footerRow2).getCell(1).value = `Analysis generated: ${new Date().toLocaleString()} | Based on ${filtered.length} entries`;
      analysisSheet.mergeCells(`A${footerRow2}:C${footerRow2}`);
      analysisSheet.getRow(footerRow2).getCell(1).font = { italic: true, size: 8 };
      analysisSheet.getRow(footerRow2).getCell(1).alignment = { horizontal: 'center' };

      analysisSheet.protect('Siya', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertRows: false,
        deleteRows: false,
        insertColumns: false,
        deleteColumns: false,
        sort: false,
        autoFilter: false,
        pivotTables: false
      });

      //------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      // ==================== SAVE ====================
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Timesheet_${startDate}_to_${endDate}_readonly.xlsx`);
      showToast("Excel report generated successfully!", "success");
    } catch (err) {
      console.error("Excel export error:", err);
      showToast("Excel generation failed: " + err.message, "error");
    } finally {
      window.hideLoading();
    }
  }

  // ======================== USER META & NOTIFICATIONS ========================
  async function loadUserMeta() {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${USER_META_FILE}`;
    try {
      const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (file && file.content) userFullName = JSON.parse(file.content).fullName || "";
    } catch(e) { userFullName = ""; }
    document.getElementById('userFullName').value = userFullName;
    document.getElementById('reportName').value = userFullName;
  }

  async function saveUserMeta(fullName) {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${USER_META_FILE}`;
    let sha = null;
    try { const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat); if (existing) sha = existing.sha; } catch(e) {}
    await GitHubAPI.updateFile(owner, repo, path, { fullName }, "Update user name", branch, user.pat, sha);
    userFullName = fullName;
  }

  async function loadNotificationPreference() {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${PREFS_FILE}`;
    try {
      const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (file && file.content) notificationsEnabled = JSON.parse(file.content).notifications === true;
      else notificationsEnabled = false;
    } catch(e) { notificationsEnabled = false; }
    document.getElementById('notificationsToggle').checked = notificationsEnabled;
  }

  async function saveNotificationPreference(enabled) {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${PREFS_FILE}`;
    let sha = null;
    try { const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat); if (existing) sha = existing.sha; } catch(e) {}
    await GitHubAPI.updateFile(owner, repo, path, { notifications: enabled }, "Update notification preference", branch, user.pat, sha);
    notificationsEnabled = enabled;
  }

  // ======================== REFRESH (manual) ========================
  async function refreshView() {
    window.showLoading("Refreshing from GitHub...");
    try {
      await loadTimesheet();
      await loadProjectsForTimesheet(false);
      renderHistory();
      updateSummaryAndProgress();
      updateCharts();

      window.__timesheetEntries = entries;
      window.__timesheetProjectOptions = allProjectOptions;
      document.dispatchEvent(new Event('timesheetUpdated'));
      showToast("Refreshed from GitHub.", "success");
    } catch(err) {
      if (!err.message.includes("Token expired")) showToast("Refresh failed: " + err.message, "error");
    } finally {
      window.hideLoading();
    }
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
    
    document.getElementById('generateReportBtn').onclick = () => { 
      document.getElementById('reportName').value = userFullName; 
      const end = new Date(); 
      const start = new Date(); 
      start.setDate(start.getDate()-30); 
      document.getElementById('reportStartDate').value = formatDate(start); 
      document.getElementById('reportEndDate').value = formatDate(end); 
      $('#reportModal').modal('show'); 
    };
    
    document.getElementById('generateReportConfirmBtn').onclick = () => { 
      const start = document.getElementById('reportStartDate')?.value; 
      const end = document.getElementById('reportEndDate')?.value; 
      if(!start||!end) return; 
      $('#reportModal').modal('hide'); 
      exportStyledExcel(start, end); 
    };
    document.getElementById('saveEditBtn').onclick = saveEdit;

    // Delegated event listener for table actions
    document.getElementById('historyBody').addEventListener('click', function(e) {
      const target = e.target.closest('button');
      if (!target) return;
      const action = target.dataset.action;
      const id = target.dataset.id;
      if (!id) return;
      const entryId = parseInt(id, 10);
      if (action === 'edit') {
        editEntry(entryId);
      } else if (action === 'delete') {
        deleteEntry(entryId);
      } else if (action === 'duplicate') {
        const entry = entries.find(e => e.id === entryId);
        if (entry) duplicateEntry(entry);
      }
    });

    await loadNotificationPreference();
    document.getElementById('notificationsToggle').addEventListener('change', async (e) => { window.showLoading("Saving preference..."); try { await saveNotificationPreference(e.target.checked); showToast(e.target.checked ? "Notifications enabled" : "Notifications disabled"); } catch(err){ if(err.message.includes("401")){ showToast("Token expired. Please login again.","error"); window.SessionManager.logout(); setTimeout(()=>window.location.href="login.html",2000); } else showToast("Failed: "+err.message,"error"); e.target.checked = !e.target.checked; } finally{ window.hideLoading(); } });

    await loadUserMeta();
    // Load entries from GitHub initially
    await loadTimesheet();
    await loadProjectsForTimesheet(false);
    renderHistory();
    updateSummaryAndProgress();
    updateCharts();

    window.__timesheetEntries = entries;
    window.__timesheetProjectOptions = allProjectOptions;
    document.dispatchEvent(new Event('timesheetUpdated'));
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
