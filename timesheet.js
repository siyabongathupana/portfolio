// timesheet.js – Complete, with fixed PDF week‑based row coloring
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

    // FIXED: Use UTC date to avoid timezone offset
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

  // ======================== ROBUST CHART IMAGE GENERATION ========================
  async function captureChartImage(chartBuilder, width = 500, height = 400) {
    return new Promise(async (resolve, reject) => {
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
        reject(err);
      } finally {
        if (chart && typeof chart.destroy === 'function') chart.destroy();
      }
    });
  }

  // ======================== PDF REPORT (with fixed week coloring) ========================
  async function generatePDFReport(startDate, endDate) {
    window.showLoading("Generating professional PDF report...");
    try {
      const filtered = entries.filter(e => e.date >= startDate && e.date <= endDate);
      if (!filtered.length) { showToast("No entries in selected range.", "error"); window.hideLoading(); return; }

      // Assign week keys and prepare row colors
      filtered.forEach(e => {
        e.weekKey = `${new Date(e.date).getFullYear()}-W${getWeekNumber(e.date)}`;
      });
      const weeks = [...new Map(filtered.map(e => [e.weekKey, e.weekKey])).values()];
      const weekColors = weeks.map((w, idx) => ({
        week: w,
        color: idx % 2 === 0 ? [245, 247, 250] : [255, 248, 225]  // light gray / light cream
      }));
      // Map each filtered entry to its background color
      const rowColors = filtered.map(entry => {
        const match = weekColors.find(wc => wc.week === entry.weekKey);
        return match ? match.color : [255, 255, 255];
      });

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      const primary = [11,43,59], accent = [47,199,255];

      // Header
      doc.setFillColor(primary[0], primary[1], primary[2]); doc.rect(0,0,pageWidth,28,'F');
      doc.setFillColor(accent[0], accent[1], accent[2]); doc.rect(0,28,pageWidth,4,'F');
      doc.setTextColor(255,255,255); doc.setFontSize(18); doc.setFont(undefined,'bold');
      doc.text("TIMESHEET REPORT", pageWidth/2,12,{align:'center'});
      doc.setFontSize(10); doc.text(`Period: ${startDate} to ${endDate}`, pageWidth/2,21,{align:'center'});

      let yPos = 45;
      const userName = document.getElementById('reportName')?.value || userFullName || user.username;
      const totalHours = filtered.reduce((s,e)=>s+e.hours,0);
      const billableHours = filtered.filter(e=>e.billable==='yes').reduce((s,e)=>s+e.hours,0);
      const nonBillable = totalHours - billableHours;
      const overtime = calculateOvertimeForPeriod(filtered);
      const avgDaily = filtered.length ? (totalHours / new Set(filtered.map(e=>e.date)).size).toFixed(1) : 0;
      const stats = [
        { label:"Total Hours", value:totalHours.toFixed(1), color:primary },
        { label:"Billable", value:billableHours.toFixed(1), color:[40,167,69] },
        { label:"Non-billable", value:nonBillable.toFixed(1), color:[220,53,69] },
        { label:"Overtime", value:overtime.toFixed(1), color:accent },
        { label:"Avg Daily", value:avgDaily, color:[108,117,125] }
      ];
      const boxWidth = (contentWidth - 20) / stats.length;
      let boxX = margin;
      for (let s of stats) {
        doc.setFillColor(248,250,252); doc.roundedRect(boxX, yPos, boxWidth-2, 18, 3, 3, 'F');
        doc.setFontSize(8); doc.setFont(undefined,'normal'); doc.setTextColor(100,100,100); doc.text(s.label, boxX+3, yPos+5);
        doc.setFontSize(14); doc.setFont(undefined,'bold'); doc.setTextColor(s.color[0],s.color[1],s.color[2]); doc.text(s.value, boxX+3, yPos+14);
        boxX += boxWidth;
      }
      yPos += 24;
      doc.setFontSize(9); doc.setFont(undefined,'italic'); doc.setTextColor(80,80,80);
      doc.text(`Generated for: ${userName}`, margin, yPos);
      doc.text(`Report ID: ${Date.now()}`, pageWidth - margin - 30, yPos);
      yPos += 8;

      // Generate charts (as before)
      let chart1Img = null, chart2Img = null, chart3Img = null;
      try {
        const projMap = {}; filtered.forEach(e=>{ projMap[e.project]=(projMap[e.project]||0)+e.hours; });
        const projLabels = Object.keys(projMap).slice(0,8);
        const projData = projLabels.map(l=>projMap[l]);
        chart1Img = await captureChartImage((ctx,canvas) => new Chart(ctx, { type:'bar', data:{ labels:projLabels, datasets:[{ label:'Hours', data:projData, backgroundColor:'rgba(47,199,255,0.7)' }] }, options:{ responsive:true, maintainAspectRatio:true } }), 600, 400);
      } catch(e) { console.warn("Chart1 failed", e); }
      try {
        const catMap = {}; filtered.forEach(e=>{ catMap[e.category]=(catMap[e.category]||0)+e.hours; });
        chart2Img = await captureChartImage((ctx,canvas) => new Chart(ctx, { type:'pie', data:{ labels:Object.keys(catMap), datasets:[{ data:Object.values(catMap), backgroundColor:['#2fc7ff','#ffc107','#28a745','#dc3545','#6f42c1','#fd7e14'] }] }, options:{ responsive:true, maintainAspectRatio:true } }), 500, 400);
      } catch(e) { console.warn("Chart2 failed", e); }
      try {
        chart3Img = await captureChartImage((ctx,canvas) => new Chart(ctx, { type:'doughnut', data:{ labels:['Billable','Non-billable'], datasets:[{ data:[billableHours,nonBillable], backgroundColor:['#28a745','#dc3545'] }] }, options:{ responsive:true, maintainAspectRatio:true } }), 400, 400);
      } catch(e) { console.warn("Chart3 failed", e); }

      const chartWidth = (contentWidth-10)/2, chartHeight = 65;
      if (chart1Img) doc.addImage(chart1Img,'PNG',margin,yPos,chartWidth,chartHeight);
      if (chart2Img) doc.addImage(chart2Img,'PNG',margin+chartWidth+5,yPos,chartWidth,chartHeight);
      yPos += chartHeight+5;
      if (chart3Img) doc.addImage(chart3Img,'PNG',pageWidth/2-35,yPos,70,56);
      else { doc.setFontSize(10); doc.text("Chart unavailable", pageWidth/2, yPos+30, { align:'center' }); }
      yPos += 66;

      // Data table with week-based row coloring
      const tableData = filtered.map(e=>[e.date, e.start, e.end, e.hours.toFixed(2), e.project, e.category, e.billable==='yes'?'✓ Billable':'✗ Non-billable', e.notes||'-']);
      
      // Scale column widths to fit contentWidth
      const baseWidths = [22, 14, 14, 14, 30, 25, 20, 55];
      const totalBase = baseWidths.reduce((a,b)=>a+b,0);
      const scaledWidths = baseWidths.map(w => (w / totalBase) * contentWidth);
      
      doc.autoTable({
        startY: yPos,
        head: [['Date','Start','End','Hours','Project','Category','Billable','Notes']],
        body: tableData,
        foot: [['','','', totalHours.toFixed(2),'','','','']],
        theme: 'grid',
        headStyles: { fillColor: primary, textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 9 },
        footStyles: { fillColor: [248,250,252], textColor: primary, fontStyle: 'bold', halign: 'center', fontSize: 9 },
        bodyStyles: { fontSize: 8, cellPadding: 2, valign: 'middle' },
        // KEY FIX: rowBackground uses rowColors array
        rowBackground: (row) => rowColors[row] || [255,255,255],
        columnStyles: {
          0: { cellWidth: scaledWidths[0] },
          1: { cellWidth: scaledWidths[1] },
          2: { cellWidth: scaledWidths[2] },
          3: { cellWidth: scaledWidths[3] },
          4: { cellWidth: scaledWidths[4] },
          5: { cellWidth: scaledWidths[5] },
          6: { cellWidth: scaledWidths[6] },
          7: { cellWidth: scaledWidths[7] }
        },
        margin: { left: margin, right: margin },
        tableWidth: contentWidth
      });

      const finalY = doc.lastAutoTable.finalY + 8;
      const qrDataURL = await generateQRCodeDataURL(window.location.origin, 35);
      if (qrDataURL) doc.addImage(qrDataURL,'PNG',pageWidth-25,finalY,12,12);
      doc.setFontSize(7); doc.setTextColor(120,120,120);
      doc.text(`Generated: ${new Date().toLocaleString()} | System: Your Portfolio`, margin, finalY+5);
      doc.text("This document is automatically generated – unaltered.", margin, finalY+10);
      doc.text("Scan QR to verify", pageWidth-28, finalY+10, { align:'right' });
      for (let i=1; i<=doc.internal.getNumberOfPages(); i++) {
        doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150,150,150);
        doc.text(`Page ${i} of ${doc.internal.getNumberOfPages()}`, pageWidth/2, pageHeight-8, { align:'center' });
      }
      doc.setFontSize(50); doc.setTextColor(200,200,200); doc.setGState(new doc.GState({ opacity: 0.08 }));
      doc.text("CONFIDENTIAL", pageWidth/2, pageHeight/2, { align:'center', angle:45 });
      doc.setGState(new doc.GState({ opacity: 1 }));

      // PDF encryption with fallback
      try {
        if (typeof PDFLib !== 'undefined' && PDFLib.PDFDocument) {
          const pdfBlob = doc.output('blob');
          const pdfBytes = await pdfBlob.arrayBuffer();
          const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
          if (typeof pdfDoc.encrypt === 'function') {
            pdfDoc.encrypt({
              userPassword: '',
              ownerPassword: 'SiyaOwner',
              permissions: {
                printing: 'highResolution',
                modifying: false,
                copying: false,
                annotating: false,
                fillingForms: false,
                contentAccessibility: true,
                documentAssembly: false
              }
            });
            const encryptedBytes = await pdfDoc.save();
            const encryptedBlob = new Blob([encryptedBytes], { type: 'application/pdf' });
            saveAs(encryptedBlob, `Timesheet_${startDate}_to_${endDate}_readonly.pdf`);
            showToast("PDF saved – opens without password, cannot be edited/copied.", "success");
          } else {
            throw new Error("encrypt method missing");
          }
        } else {
          throw new Error("PDFLib not loaded");
        }
      } catch (encryptErr) {
        console.warn("PDF encryption failed, saving unencrypted:", encryptErr);
        doc.save(`Timesheet_${startDate}_to_${endDate}_unprotected.pdf`);
        showToast("PDF generated without encryption (library error).", "warning");
      }
    } catch (err) {
      console.error(err);
      showToast("PDF generation failed: " + err.message, "error");
    } finally { window.hideLoading(); }
  }

  // ======================== EXCEL EXPORT (protected worksheet, week coloring) ========================
 async function exportStyledExcel(startDate, endDate) {
    window.showLoading("Generating professional Excel report...");
    try {
        const filtered = entries.filter(e => e.date >= startDate && e.date <= endDate);
        if (!filtered.length) { showToast("No entries in selected range.", "error"); window.hideLoading(); return; }

        // --- Prepare week grouping for alternating row colors ---
        filtered.forEach(e => { e.weekKey = `${new Date(e.date).getFullYear()}-W${getWeekNumber(e.date)}`; });
        const weeks = [...new Map(filtered.map(e => [e.weekKey, e.weekKey])).values()];
        const weekFills = weeks.map((w, idx) => ({
            week: w,
            fill: idx % 2 === 0 ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } }
                                : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E6' } }
        }));
        const getRowFill = (entry) => weekFills.find(wf => wf.week === entry.weekKey)?.fill || { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Timesheet Data", {
            pageSetup: {
                orientation: 'landscape',
                fitToPage: true,
                fitToWidth: 1,
                fitToHeight: 0,
                paperSize: 9, // A4
                horizontalCentered: true,
                verticalCentered: true
            }
        });

        // ========== 1. DYNAMIC COLUMN WIDTHS (based on content) ==========
        const headers = ['Date','Start','End','Hours','Project','Category','Billable','Notes'];
        const colMaxLen = [10, 8, 8, 8, 20, 15, 12, 40]; // minimum widths

        // Measure content lengths
        for (const row of filtered) {
            const values = [
                row.date, row.start, row.end, row.hours.toFixed(2),
                row.project, row.category,
                row.billable === 'yes' ? 'Billable' : 'Non-billable',
                row.notes || ''
            ];
            for (let i = 0; i < values.length; i++) {
                const len = values[i].toString().length;
                if (len > colMaxLen[i]) colMaxLen[i] = Math.min(len, 60); // cap at 60
            }
        }
        // Add header lengths
        for (let i = 0; i < headers.length; i++) {
            if (headers[i].length > colMaxLen[i]) colMaxLen[i] = headers[i].length;
        }
        // Set column widths (ExcelJS width unit ≈ character count)
        worksheet.columns = colMaxLen.map(w => ({ width: w + 2 }));

        // ========== 2. HEADER SECTION ==========
        // Title
        worksheet.mergeCells('A1:H1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = `TIMESHEET REPORT - ${userFullName || user.username}`;
        titleCell.font = { size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(1).height = 32;

        // Period
        worksheet.mergeCells('A2:H2');
        const periodCell = worksheet.getCell('A2');
        periodCell.value = `Period: ${startDate} to ${endDate}  |  Generated: ${new Date().toLocaleString()}`;
        periodCell.font = { size: 11, italic: true };
        periodCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4FA' } };
        periodCell.alignment = { horizontal: 'center' };
        worksheet.getRow(2).height = 22;

        // Summary KPIs
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

        // ========== 3. DATA TABLE HEADERS ==========
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

        // ========== 4. DATA ROWS ==========
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

            // Apply borders and alignment
            for (let i = 1; i <= 8; i++) {
                const cell = row.getCell(i);
                cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
                cell.alignment = { vertical: 'middle', wrapText: (i === 8) }; // wrap only Notes
                if (i !== 8 && i !== 4) cell.alignment.horizontal = 'left';
                if (i === 4) cell.alignment.horizontal = 'right';
            }
            // Week-based background
            const rowFill = getRowFill(entry);
            for (let i = 1; i <= 8; i++) row.getCell(i).fill = rowFill;

            // Billable / Non-billable styling
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

        // ========== 5. TOTAL ROW ==========
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

        // ========== 6. AUTO ROW HEIGHT FOR NOTES ==========
        worksheet.eachRow((row, rowNumber) => {
            let maxHeight = 18;
            const noteCell = row.getCell(8);
            if (noteCell.value && noteCell.value.toString().length > 30) {
                const lines = Math.ceil(noteCell.value.toString().length / 45);
                maxHeight = Math.max(maxHeight, 15 * lines);
            }
            row.height = maxHeight;
        });

        // ========== 7. FREEZE HEADER ROW, PRINT AREA, PROTECTION ==========
        worksheet.views = [{ state: 'frozen', ySplit: 4 }];
        worksheet.pageSetup.printArea = `A1:H${totalRowNum}`;
        worksheet.protect('Siya', {
            selectLockedCells: false, selectUnlockedCells: false, formatCells: false, formatColumns: false,
            formatRows: false, insertRows: false, deleteRows: false, insertColumns: false, deleteColumns: false,
            sort: false, autoFilter: false, pivotTables: false
        });

        // ========== 8. SUMMARY SHEET WITH CHART ==========
        const summarySheet = workbook.addWorksheet("Summary", {
            pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 }
        });
        summarySheet.columns = [{ width: 20 }, { width: 20 }, { width: 20 }];

        // Title
        summarySheet.mergeCells('A1:C1');
        const sumTitle = summarySheet.getCell('A1');
        sumTitle.value = "TIMESHEET SUMMARY";
        sumTitle.font = { size: 16, bold: true, color: { argb: 'FF0B2B3B' } };
        sumTitle.alignment = { horizontal: 'center' };
        summarySheet.getRow(1).height = 28;

        // KPIs
        const adminHours = filtered.filter(e => e.category === 'Admin').reduce((s,e) => s + e.hours, 0);
        const adminRatio = totalHours > 0 ? (adminHours / totalHours) * 100 : 0;
        const uniqueProjects = new Set(filtered.map(e => e.project)).size;

        const kpiRows = [
            ["Total Hours", totalHours.toFixed(1)],
            ["Billable Hours", billableHours.toFixed(1)],
            ["Non-Billable Hours", nonBillable.toFixed(1)],
            ["Overtime Hours", overtime.toFixed(1)],
            ["Unique Projects", uniqueProjects],
            ["Admin Ratio (%)", adminRatio.toFixed(1) + "%"]
        ];
        let kpiRowNum = 3;
        for (const [label, value] of kpiRows) {
            const labelCell = summarySheet.getCell(`A${kpiRowNum}`);
            labelCell.value = label;
            labelCell.font = { bold: true };
            labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4FA' } };
            const valueCell = summarySheet.getCell(`B${kpiRowNum}`);
            valueCell.value = value;
            valueCell.font = { size: 12, bold: true };
            valueCell.alignment = { horizontal: 'right' };
            kpiRowNum++;
        }

        // --- Bar Chart: Hours per Project ---
        try {
            const projMap = {};
            filtered.forEach(e => { projMap[e.project] = (projMap[e.project] || 0) + e.hours; });
            const projLabels = Object.keys(projMap).slice(0, 8); // max 8 projects
            const projData = projLabels.map(l => projMap[l]);
            const canvas = document.createElement('canvas');
            canvas.width = 800;
            canvas.height = 400;
            const ctx = canvas.getContext('2d');
            const chart = new Chart(ctx, {
                type: 'bar',
                data: { labels: projLabels, datasets: [{ label: 'Hours', data: projData, backgroundColor: '#2fc7ff' }] },
                options: { responsive: false, maintainAspectRatio: true }
            });
            await new Promise(r => setTimeout(r, 600));
            const chartBase64 = canvas.toDataURL('image/png');
            chart.destroy();
            const chartImageId = workbook.addImage({ base64: chartBase64, extension: 'png' });
            summarySheet.addImage(chartImageId, { tl: { col: 0, row: 12 }, br: { col: 8, row: 32 }, editAs: 'oneCell' });
        } catch(e) { console.warn("Chart generation skipped", e); }

        // Footer on summary sheet
        summarySheet.getCell('A35').value = `Generated: ${new Date().toLocaleString()} | Your Portfolio System`;
        summarySheet.getCell('A35').font = { italic: true, size: 8 };
        summarySheet.mergeCells('A35:C35');

        // ========== 9. SAVE AND DOWNLOAD ==========
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `Timesheet_${startDate}_to_${endDate}_readonly.xlsx`);
        showToast("Excel report generated – clean, full‑page, auto‑fitted columns.", "success");
    } catch (err) {
        console.error(err);
        showToast("Excel generation failed: " + err.message, "error");
    } finally { window.hideLoading(); }
}
        // ==================== 2. SUMMARY SHEET with Chart ====================
        const summarySheet = workbook.addWorksheet("Summary", {
            pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 }
        });
        summarySheet.columns = [{ width: 20 }, { width: 20 }, { width: 20 }];

        // Title
        summarySheet.mergeCells('A1:C1');
        const sumTitle = summarySheet.getCell('A1');
        sumTitle.value = "TIMESHEET SUMMARY";
        sumTitle.font = { size: 16, bold: true, color: { argb: 'FF0B2B3B' } };
        sumTitle.alignment = { horizontal: 'center' };
        summarySheet.getRow(1).height = 28;

        // KPIs
        summarySheet.getCell('A3').value = "Total Hours";
        summarySheet.getCell('B3').value = totalHours.toFixed(1);
        summarySheet.getCell('A4').value = "Billable Hours";
        summarySheet.getCell('B4').value = billableHours.toFixed(1);
        summarySheet.getCell('A5').value = "Non-Billable Hours";
        summarySheet.getCell('B5').value = nonBillable.toFixed(1);
        summarySheet.getCell('A6').value = "Overtime Hours";
        summarySheet.getCell('B6').value = overtime.toFixed(1);
        summarySheet.getCell('A7').value = "Unique Projects";
        summarySheet.getCell('B7').value = new Set(filtered.map(e => e.project)).size;
        summarySheet.getCell('A8').value = "Admin Ratio (%)";
        const adminHours = filtered.filter(e => e.category === 'Admin').reduce((s,e) => s + e.hours, 0);
        const adminRatio = totalHours > 0 ? (adminHours / totalHours) * 100 : 0;
        summarySheet.getCell('B8').value = adminRatio.toFixed(1) + "%";

        // Style KPIs
        for (let i = 3; i <= 8; i++) {
            const labelCell = summarySheet.getCell(`A${i}`);
            labelCell.font = { bold: true };
            labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4FA' } };
            const valueCell = summarySheet.getCell(`B${i}`);
            valueCell.font = { size: 12, bold: true };
            valueCell.alignment = { horizontal: 'right' };
        }

        // --- Add bar chart (hours by project) ---
        try {
            const projMap = {};
            filtered.forEach(e => { projMap[e.project] = (projMap[e.project] || 0) + e.hours; });
            const projLabels = Object.keys(projMap).slice(0, 8); // max 8 projects
            const projData = projLabels.map(l => projMap[l]);
            // Create a temporary canvas to generate chart image
            const canvas = document.createElement('canvas');
            canvas.width = 800;
            canvas.height = 400;
            const ctx = canvas.getContext('2d');
            const chart = new Chart(ctx, {
                type: 'bar',
                data: { labels: projLabels, datasets: [{ label: 'Hours', data: projData, backgroundColor: '#2fc7ff' }] },
                options: { responsive: false, maintainAspectRatio: true }
            });
            await new Promise(r => setTimeout(r, 600));
            const chartBase64 = canvas.toDataURL('image/png');
            chart.destroy();
            const chartImageId = workbook.addImage({ base64: chartBase64, extension: 'png' });
            summarySheet.addImage(chartImageId, { tl: { col: 0, row: 10 }, br: { col: 8, row: 30 }, editAs: 'oneCell' });
        } catch(e) { console.warn("Chart generation failed", e); }

        // --- Footer on summary sheet ---
        summarySheet.getCell('A35').value = `Generated: ${new Date().toLocaleString()} | Your Portfolio System`;
        summarySheet.getCell('A35').font = { italic: true, size: 8 };
        summarySheet.mergeCells('A35:C35');

        // --- Generate and download ---
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `Timesheet_${startDate}_to_${endDate}_readonly.xlsx`);
        showToast("Excel report generated with summary and chart!", "success");
    } catch (err) {
        console.error(err);
        showToast("Excel generation failed: " + err.message, "error");
    } finally { window.hideLoading(); }
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

        // ========== ADD THESE THREE LINES ==========
        window.__timesheetEntries = entries;
        window.__timesheetProjectOptions = allProjectOptions;
        document.dispatchEvent(new Event('timesheetUpdated'));
        // ============================================

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
    document.getElementById('exportExcelBtn').onclick = () => { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 30); document.getElementById('reportStartDate').value = formatDate(start); document.getElementById('reportEndDate').value = formatDate(end); document.getElementById('reportType').value = 'excel'; $('#reportModal').modal('show'); };
    document.getElementById('printBtn').onclick = () => window.print();
    document.getElementById('filterRange').onchange = () => { renderHistory(); updateSummaryAndProgress(); updateCharts(); };
    document.getElementById('filterProject').onchange = () => { renderHistory(); updateSummaryAndProgress(); updateCharts(); };
    document.getElementById('filterCategory').onchange = () => { renderHistory(); updateSummaryAndProgress(); updateCharts(); };
    document.getElementById('saveNameBtn').onclick = async () => { const newName = document.getElementById('userFullName')?.value.trim(); if(!newName) return; window.showLoading("Saving name..."); try { await saveUserMeta(newName); showToast("Name saved."); } catch(err){ showToast("Failed: "+err.message,"error"); } finally{ window.hideLoading(); } };

    // Manage Projects button
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

    //========================================================================================================ADADADADADAAD SIYA=============================
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
