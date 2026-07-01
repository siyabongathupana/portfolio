// timesheet.js – COMPLETE, FULLY VERIFIED (PDF removed, Excel only)
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
    // Fallback
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
        const parsed = JSON.parse(content);
        entries = Array.isArray(parsed) ? parsed : [];
        entries = entries.map(e => ({ ...e, updatedAt: e.updatedAt || e.id }));
        entries.sort((a, b) => new Date(b.date) - new Date(a.date));
      } else if (resp.status === 404) entries = [];
      else throw new Error(`HTTP ${resp.status}`);
    } catch(e) { if (!e.message.includes("Token expired")) console.error(e); entries = []; }
  }

  async function saveTimesheet(dataToSave) {
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
    while (retries > 0) {
      try {
        const putResp = await githubFetchWithAuth(putUrl, { method: 'PUT', headers: { Authorization: `token ${user.pat}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!putResp.ok) throw new Error(`GitHub API error: ${putResp.status}`);
        entries = [...dataToSave];
        return true;
      } catch (err) { retries--; if (retries === 0) throw err; await new Promise(r => setTimeout(r, 1000)); }
    }
  }

  async function loadTimesheetProjects() {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${TIMESHEET_PROJECTS_FILE}`;
    try {
      const resp = await githubFetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, { headers: { Authorization: `token ${user.pat}` } });
      if (resp.ok) { const data = await resp.json(); timesheetProjects = JSON.parse(atob(data.content.replace(/\n/g, ''))); }
      else if (resp.status === 404) timesheetProjects = [];
    } catch(e) { timesheetProjects = []; }
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

  // ======================== FILTERS & RENDERING ========================
  function getFilteredEntries() {
    const range = document.getElementById('filterRange').value;
    const project = document.getElementById('filterProject').value;
    const category = document.getElementById('filterCategory').value;
    
    // Use UTC for all date calculations to avoid timezone issues
    const nowUTC = new Date();
    nowUTC.setUTCHours(0, 0, 0, 0);
    
    let filtered = [...entries];
    if (range !== 'all') {
      filtered = filtered.filter(entry => {
        const d = new Date(entry.date);
        d.setUTCHours(0, 0, 0, 0);
        
        if (range === 'day') {
          return d.getTime() === nowUTC.getTime();
        }
        if (range === 'week') {
          const day = nowUTC.getUTCDay();
          const diff = (day === 0 ? 6 : day - 1);
          const startOfWeek = new Date(nowUTC);
          startOfWeek.setUTCDate(nowUTC.getUTCDate() - diff);
          startOfWeek.setUTCHours(0, 0, 0, 0);
          
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
          endOfWeek.setUTCHours(23, 59, 59, 999);
          
          return d >= startOfWeek && d <= endOfWeek;
        }
        if (range === 'month') {
          return d.getUTCMonth() === nowUTC.getUTCMonth() && 
                 d.getUTCFullYear() === nowUTC.getUTCFullYear();
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
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center">No entries found.  </td></tr>';
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
  async function safeCaptureChart(chartBuilder, width = 800, height = 600) {
    return new Promise(async (resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      let chart = null;
      try {
        chart = await chartBuilder(ctx, canvas);
        await new Promise(r => setTimeout(r, 600));
        const imgData = canvas.toDataURL('image/png');
        if (imgData.length < 1000) throw new Error('Chart image too small');
        resolve(imgData);
      } catch (err) {
        console.warn('Chart capture failed, using fallback:', err);
        // Return a simple placeholder image
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

  // ======================== EXCEL EXPORT ========================
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
      
      // MAIN DATA SHEET
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

      worksheet.mergeCells('A1:H1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = `TIMESHEET REPORT - ${userFullName || user.username}`;
      titleCell.font = { size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 32;

      worksheet.mergeCells('A2:H2');
      const periodCell = worksheet.getCell('A2');
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
      const summaryCell = worksheet.getCell('A3');
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
        row.getCell(4).value = entry.hours.toFixed(2);
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
      totalRow.getCell(4).value = totalHours.toFixed(1);
      totalRow.getCell(4).font = { bold: true, size: 11 };
      for (let i = 1; i <= 8; i++) {
        const cell = totalRow.getCell(i);
        cell.border = { top: { style: 'thin' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
        if (i !== 4) cell.value = '';
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

      worksheet.views = [{ state: 'frozen', ySplit: 4 }];
      worksheet.pageSetup.printArea = `A1:H${totalRowNum}`;
      worksheet.protect('Siya', {
        selectLockedCells: false, selectUnlockedCells: false, formatCells: false, formatColumns: false,
        formatRows: false, insertRows: false, deleteRows: false, insertColumns: false, deleteColumns: false,
        sort: false, autoFilter: false, pivotTables: false
      });

      // CHARTS SHEET with 6 charts
      const chartsSheet = workbook.addWorksheet("Charts", {
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 }
      });
      
      chartsSheet.mergeCells('A1:F1');
      const chartsTitle = chartsSheet.getCell('A1');
      chartsTitle.value = "VISUAL ANALYTICS DASHBOARD";
      chartsTitle.font = { size: 18, bold: true, color: { argb: 'FF0B2B3B' } };
      chartsTitle.alignment = { horizontal: 'center' };
      chartsSheet.getRow(1).height = 32;
      chartsSheet.getRow(2).height = 20;

      const CHART_WIDTH = 360;
      const CHART_HEIGHT = 260;
      const ROW_OFFSET = Math.ceil(CHART_HEIGHT / 20) + 4;

      // Helper to add a chart image
      async function addChart(chartsSheet, chartBuilder, col, row, title) {
        try {
          const imgData = await safeCaptureChart(chartBuilder, 1200, 900);
          const imageId = workbook.addImage({ base64: imgData, extension: 'png' });
          chartsSheet.addImage(imageId, {
            tl: { col: col * 3, row: row },
            ext: { width: CHART_WIDTH, height: CHART_HEIGHT },
            editAs: 'oneCell'
          });
          // Add title in cell above chart
          const titleRow = row - 1;
          if (titleRow >= 0) {
            const colLetter = String.fromCharCode(65 + (col * 3));
            const titleCellRef = chartsSheet.getCell(`${colLetter}${titleRow + 1}`);
            titleCellRef.value = title;
            titleCellRef.font = { bold: true, size: 11, color: { argb: 'FF0B2B3B' } };
            titleCellRef.alignment = { horizontal: 'center' };
          }
          return true;
        } catch(e) {
          console.warn(`Chart "${title}" failed:`, e);
          return false;
        }
      }

      // 1. Pie: Category Distribution
      await addChart(chartsSheet, (ctx, canvas) => {
        const catMap = {};
        filtered.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.hours; });
        return new Chart(ctx, {
          type: 'pie',
          data: { labels: Object.keys(catMap), datasets: [{ data: Object.values(catMap), backgroundColor: ['#2fc7ff', '#ffc107', '#28a745', '#dc3545', '#6f42c1', '#fd7e14', '#17a2b8', '#e83e8c'] }] },
          options: { responsive: false, maintainAspectRatio: true, plugins: { legend: { position: 'right', labels: { font: { size: 72 } } }, tooltip: { bodyFont: { size: 40 } } } }
        });
      }, 0, 3, 'Hours by Category');

      // 2. Doughnut: Billable vs Non-Billable
      await addChart(chartsSheet, (ctx, canvas) => {
        return new Chart(ctx, {
          type: 'doughnut',
          data: { labels: ['Billable', 'Non-Billable'], datasets: [{ data: [billableHours, nonBillable], backgroundColor: ['#28a745', '#dc3545'] }] },
          options: { responsive: false, maintainAspectRatio: true, plugins: { legend: { position: 'right', labels: { font: { size: 72 } } }, tooltip: { bodyFont: { size: 40 } } } }
        });
      }, 1, 3, 'Billable Breakdown');

      // 3. Line: Weekly Trend
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
          options: { responsive: false, maintainAspectRatio: true, plugins: { legend: { labels: { font: { size: 72 } } }, tooltip: { bodyFont: { size: 40 } } }, scales: { x: { ticks: { font: { size: 48 } } }, y: { ticks: { font: { size: 56 } } } } }
        });
      }, 0, 3 + ROW_OFFSET, 'Weekly Hours Trend');

      // 4. Stacked Bar: Admin vs Project
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
          options: { responsive: false, maintainAspectRatio: true, scales: { x: { stacked: true, ticks: { font: { size: 48 } } }, y: { stacked: true, ticks: { font: { size: 56 } } } }, plugins: { legend: { labels: { font: { size: 72 } } }, tooltip: { bodyFont: { size: 40 } } } }
        });
      }, 1, 3 + ROW_OFFSET, 'Admin vs Project Hours');

      // 5. Bar: Daily Hours Distribution
      await addChart(chartsSheet, (ctx, canvas) => {
        const dailyHours = {};
        filtered.forEach(e => { dailyHours[e.date] = (dailyHours[e.date] || 0) + e.hours; });
        const dates = Object.keys(dailyHours).sort().slice(0, 15);
        const hoursData = dates.map(d => dailyHours[d]);
        return new Chart(ctx, {
          type: 'bar',
          data: { labels: dates, datasets: [{ label: 'Daily Hours', data: hoursData, backgroundColor: 'rgba(47,199,255,0.6)', borderColor: '#2fc7ff', borderWidth: 2 }] },
          options: { responsive: false, maintainAspectRatio: true, plugins: { legend: { labels: { font: { size: 72 } } }, tooltip: { bodyFont: { size: 40 } } }, scales: { x: { ticks: { font: { size: 40 }, maxRotation: 45 } }, y: { ticks: { font: { size: 56 } } } } }
        });
      }, 0, 3 + ROW_OFFSET * 2, 'Daily Hours Distribution');

      // 6. Horizontal Bar: Top Projects
      await addChart(chartsSheet, (ctx, canvas) => {
        const projMap = {};
        filtered.forEach(e => { projMap[e.project] = (projMap[e.project] || 0) + e.hours; });
        const sortedProjects = Object.entries(projMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
        return new Chart(ctx, {
          type: 'bar',
          data: { labels: sortedProjects.map(p => p[0]), datasets: [{ label: 'Hours', data: sortedProjects.map(p => p[1]), backgroundColor: ['#2fc7ff', '#28a745', '#ffc107', '#dc3545', '#6f42c1', '#fd7e14', '#17a2b8', '#e83e8c'], borderRadius: 4 }] },
          options: { responsive: false, maintainAspectRatio: true, indexAxis: 'y', plugins: { legend: { labels: { font: { size: 72 } } }, tooltip: { bodyFont: { size: 40 } } }, scales: { x: { ticks: { font: { size: 56 } } }, y: { ticks: { font: { size: 48 } } } } }
        });
      }, 1, 3 + ROW_OFFSET * 2, 'Top Projects by Hours');

      chartsSheet.getCell('A75').value = `Generated: ${new Date().toLocaleString()} | Your Portfolio System`;
      chartsSheet.getCell('A75').font = { italic: true, size: 8 };
      chartsSheet.mergeCells('A75:F75');

      // ==================== SAVE ====================
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Timesheet_${startDate}_to_${endDate}_readonly.xlsx`);
      showToast("Excel report generated – enhanced with 6 charts!", "success");
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

  // ======================== REFRESH & AUTO REFRESH ========================
  async function refreshView() {
    window.showLoading("Refreshing timesheet...");
    try {
      await loadTimesheet();
      await loadProjectsForTimesheet();
      renderHistory();
      updateSummaryAndProgress();
      updateCharts();

      window.__timesheetEntries = entries;
      window.__timesheetProjectOptions = allProjectOptions;
      document.dispatchEvent(new Event('timesheetUpdated'));
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
    document.getElementById('exportExcelBtn').onclick = () => { 
      const end = new Date(); 
      const start = new Date(); 
      start.setDate(start.getDate() - 30); 
      document.getElementById('reportStartDate').value = formatDate(start); 
      document.getElementById('reportEndDate').value = formatDate(end); 
      $('#reportModal').modal('show'); 
    };
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
    
    // Generate Excel Report button (was PDF Report)
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

    await loadNotificationPreference();
    document.getElementById('notificationsToggle').addEventListener('change', async (e) => { window.showLoading("Saving preference..."); try { await saveNotificationPreference(e.target.checked); showToast(e.target.checked ? "Notifications enabled" : "Notifications disabled"); } catch(err){ if(err.message.includes("401")){ showToast("Token expired. Please login again.","error"); window.SessionManager.logout(); setTimeout(()=>window.location.href="login.html",2000); } else showToast("Failed: "+err.message,"error"); e.target.checked = !e.target.checked; } finally{ window.hideLoading(); } });

    await loadUserMeta();
    await refreshView();

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
