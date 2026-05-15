// timesheet.js – Timesheet with project selection, project list from portfolio
(function() {
  const user = window.SessionManager?.getCurrentUser();
  if (!user) {
    alert("Please log in to access the timesheet.");
    window.location.href = "login.html";
    return;
  }

  const TIMESHEET_FILE = "timesheet.json";
  const USER_META_FILE = "user_meta.json";
  let entries = [];
  let categoryChart = null, billableChart = null, projectChart = null;
  let userFullName = "";
  let projectList = []; // array of project names (from user's projects.json)

  // Helper functions
  function formatDate(date) {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  }
  function calcHours(start, end) {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let totalMinutes = (eh * 60 + em) - (sh * 60 + sm);
    if (totalMinutes < 0) totalMinutes += 24 * 60;
    return +(totalMinutes / 60).toFixed(2);
  }
  function updateHoursAuto() {
    const start = document.getElementById('startTime').value;
    const end = document.getElementById('endTime').value;
    document.getElementById('hoursAuto').value = calcHours(start, end).toFixed(2);
  }

  // Load projects from portfolio (projects.json)
  async function loadProjects() {
    try {
      const projectsData = await window.portfolioData.loadProjects();
      projectList = Object.values(projectsData).map(p => p.title).filter(p => p);
      // also ensure "Other" is always available
      if (!projectList.includes("Other")) projectList.push("Other");
      projectList.sort();
    } catch (e) {
      projectList = ["Other"];
    }
    // populate project dropdown
    const select = document.getElementById('taskProject');
    select.innerHTML = '';
    projectList.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      select.appendChild(opt);
    });
    // also populate filter dropdown
    const filterSelect = document.getElementById('filterProject');
    filterSelect.innerHTML = '<option value="all">All Projects</option>';
    projectList.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      filterSelect.appendChild(opt);
    });
  }

  // Add a new project (user-defined)
  async function addNewProject(projectName) {
    if (!projectName || projectList.includes(projectName)) return false;
    // Add to local projectList
    projectList.push(projectName);
    projectList.sort();
    // Save projects? Actually projects are separate – we only need to remember this project name for timesheet.
    // We'll store it in user meta so it persists across page reloads.
    await saveUserMeta(userFullName, projectList);
    await loadProjects(); // refresh dropdowns
    return true;
  }

  // Load / Save timesheet
  async function loadTimesheet() {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${TIMESHEET_FILE}`;
    try {
      const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (file?.content) {
        entries = JSON.parse(file.content);
        // ensure each entry has a project field (backward compatibility)
        entries = entries.map(e => ({ ...e, project: e.project || "Other" }));
      } else {
        entries = [];
      }
    } catch(e) { entries = []; }
    entries.sort((a,b) => new Date(b.date) - new Date(a.date));
  }
  async function saveTimesheet() {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${TIMESHEET_FILE}`;
    let sha = null;
    try {
      const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (existing) sha = existing.sha;
    } catch(e) {}
    await GitHubAPI.updateFile(owner, repo, path, entries, `Update timesheet`, branch, user.pat, sha);
    window.Logger.log('timesheet_save', `Saved ${entries.length} entries`);
  }

  // Load / Save user meta (full name + project list)
  async function loadUserMeta() {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${USER_META_FILE}`;
    try {
      const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (file?.content) {
        const meta = JSON.parse(file.content);
        userFullName = meta.fullName || "";
        if (meta.projectList && Array.isArray(meta.projectList)) {
          // merge with projects from portfolio
          const portfolioProjects = projectList;
          const combined = [...new Set([...portfolioProjects, ...meta.projectList])];
          projectList = combined;
        }
      }
    } catch(e) {}
    document.getElementById('userFullName').value = userFullName;
    document.getElementById('reportName').value = userFullName;
    // ensure "Other" exists
    if (!projectList.includes("Other")) projectList.push("Other");
    await loadProjects(); // refresh dropdowns with combined list
  }
  async function saveUserMeta(fullName, projList = null) {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${USER_META_FILE}`;
    let sha = null;
    try {
      const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (existing) sha = existing.sha;
    } catch(e) {}
    const meta = { fullName, projectList: projList || projectList };
    await GitHubAPI.updateFile(owner, repo, path, meta, `Update user meta`, branch, user.pat, sha);
    window.Logger.log('user_meta_save', `Saved meta`);
  }

  // Add / Delete entries
  async function addEntry() {
    const date = document.getElementById('logDate').value;
    const start = document.getElementById('startTime').value;
    const end = document.getElementById('endTime').value;
    const project = document.getElementById('taskProject').value;
    const category = document.getElementById('taskCategory').value;
    const billable = document.getElementById('billable').value;
    const notes = document.getElementById('taskNotes').value.trim();
    if (!date || !start || !end || !project) { alert("Fill all required fields."); return; }
    const hours = calcHours(start, end);
    if (hours <= 0) { alert("End time must be after start."); return; }
    entries.unshift({ id: Date.now(), date, start, end, hours, project, category, billable, notes });
    await saveTimesheet();
    refreshView();
    document.getElementById('startTime').value = '';
    document.getElementById('endTime').value = '';
    document.getElementById('taskNotes').value = '';
    document.getElementById('hoursAuto').value = '';
    updateDailyProgress();
  }
  async function deleteEntry(id) {
    if (confirm("Delete entry?")) {
      entries = entries.filter(e => e.id != id);
      await saveTimesheet();
      refreshView();
    }
  }

  // Filter logic (with project)
  function getFilteredEntries() {
    const range = document.getElementById('filterRange').value;
    const project = document.getElementById('filterProject').value;
    const category = document.getElementById('filterCategory').value;
    const now = new Date();
    let filtered = [...entries];
    filtered = filtered.filter(entry => {
      const d = new Date(entry.date);
      if (range === 'day') return d.toDateString() === now.toDateString();
      if (range === 'week') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0,0,0,0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23,59,59,999);
        return d >= startOfWeek && d <= endOfWeek;
      }
      if (range === 'month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      return true;
    });
    if (project !== 'all') filtered = filtered.filter(e => e.project === project);
    if (category !== 'all') filtered = filtered.filter(e => e.category === category);
    return filtered;
  }

  // Render history table with totals
  function renderHistory() {
    const filtered = getFilteredEntries();
    const tbody = document.getElementById('historyBody');
    const tfoot = document.getElementById('historyFoot');
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center">No entries found.</td></tr>';
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
      const actionCell = row.insertCell(8);
      actionCell.className = 'print-hide';
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.innerHTML = '<i class="fa fa-trash"></i>';
      delBtn.onclick = () => deleteEntry(entry.id);
      actionCell.appendChild(delBtn);
    });
    document.getElementById('totalHoursCell').innerText = totalHours.toFixed(2);
    tfoot.style.display = 'table-footer-group';
  }

  // Daily progress
  function updateDailyProgress() {
    const today = formatDate(new Date());
    const todayHours = entries.filter(e => e.date === today).reduce((s,e) => s + e.hours, 0);
    const percent = Math.min(100, (todayHours / 8) * 100);
    const fill = document.getElementById('dailyProgressFill');
    fill.style.width = percent + '%';
    fill.innerText = todayHours.toFixed(1) + 'h';
    fill.style.background = todayHours >= 8 ? '#28a745' : '#2fc7ff';
  }

  // Update charts (Project, Category, Billable)
  function updateCharts() {
    const filtered = getFilteredEntries();
    // Project breakdown
    const projMap = {};
    filtered.forEach(e => { projMap[e.project] = (projMap[e.project] || 0) + e.hours; });
    if (projectChart) projectChart.destroy();
    const ctxProj = document.getElementById('projectChart').getContext('2d');
    projectChart = new Chart(ctxProj, {
      type: 'pie',
      data: { labels: Object.keys(projMap), datasets: [{ data: Object.values(projMap), backgroundColor: ['#2fc7ff','#ffc107','#28a745','#dc3545','#6f42c1','#fd7e14','#17a2b8','#e83e8c'] }] },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } } }
    });
    // Category breakdown
    const catMap = {};
    filtered.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.hours; });
    if (categoryChart) categoryChart.destroy();
    const ctxCat = document.getElementById('categoryChart').getContext('2d');
    categoryChart = new Chart(ctxCat, {
      type: 'pie',
      data: { labels: Object.keys(catMap), datasets: [{ data: Object.values(catMap), backgroundColor: ['#2fc7ff','#ffc107','#28a745','#dc3545','#6f42c1','#fd7e14'] }] },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } } }
    });
    // Billable
    let billable = 0, nonBill = 0;
    filtered.forEach(e => { if (e.billable === 'yes') billable += e.hours; else nonBill += e.hours; });
    if (billableChart) billableChart.destroy();
    const ctxBill = document.getElementById('billableChart').getContext('2d');
    billableChart = new Chart(ctxBill, {
      type: 'pie',
      data: { labels: ['Billable', 'Non-billable'], datasets: [{ data: [billable, nonBill], backgroundColor: ['#28a745','#dc3545'] }] },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } } }
    });
  }

  // Excel Export (filtered)
  function exportToExcel() {
    const filtered = getFilteredEntries();
    if (filtered.length === 0) { alert("No data to export."); return; }
    const data = filtered.map(e => ({
      Date: e.date, Start: e.start, End: e.end, Hours: e.hours,
      Project: e.project, Category: e.category, Billable: e.billable === 'yes' ? 'Billable' : 'Non-billable',
      Notes: e.notes || ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Timesheet');
    XLSX.writeFile(wb, `timesheet_${formatDate(new Date())}.xlsx`);
  }

  // PDF Report with custom date range
  async function generatePDFReport(startDate, endDate) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const filtered = entries.filter(e => e.date >= startDate && e.date <= endDate);
    if (filtered.length === 0) {
      alert("No entries in the selected date range.");
      return;
    }
    const name = document.getElementById('reportName').value || userFullName || user.username;
    const totalHours = filtered.reduce((s,e) => s + e.hours, 0);
    const billableHours = filtered.filter(e => e.billable === 'yes').reduce((s,e) => s + e.hours, 0);
    const nonBillable = totalHours - billableHours;

    const tableData = filtered.map(e => [e.date, e.start, e.end, e.hours.toFixed(2), e.project, e.category, e.billable === 'yes' ? 'Billable' : 'Non-billable', e.notes || '']);
    doc.setFontSize(16);
    doc.text('Timesheet Report', 14, 20);
    doc.setFontSize(11);
    doc.text(`Name: ${name}`, 14, 30);
    doc.text(`Period: ${startDate} to ${endDate}`, 14, 37);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 44);
    doc.text(`Total Hours: ${totalHours.toFixed(2)} (Billable: ${billableHours.toFixed(2)} | Non-billable: ${nonBillable.toFixed(2)})`, 14, 51);
    doc.autoTable({
      startY: 58,
      head: [['Date', 'Start', 'End', 'Hours', 'Project', 'Category', 'Billable', 'Notes']],
      body: tableData,
      foot: [['', '', '', totalHours.toFixed(2), '', '', '', '']],
      theme: 'striped',
      headStyles: { fillColor: [11, 43, 59], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 16 }, 2: { cellWidth: 16 }, 3: { cellWidth: 16 }, 4: { cellWidth: 30 }, 5: { cellWidth: 25 }, 6: { cellWidth: 20 }, 7: { cellWidth: 35 } }
    });
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.text(`Your Portfolio – Timesheet | Page ${i} of ${pageCount}`, 14, doc.internal.pageSize.height - 10);
    }
    doc.save(`timesheet_${startDate}_to_${endDate}.pdf`);
  }

  function exportExcelRange(startDate, endDate) {
    const filtered = entries.filter(e => e.date >= startDate && e.date <= endDate);
    if (filtered.length === 0) { alert("No entries in selected range."); return; }
    const data = filtered.map(e => ({
      Date: e.date, Start: e.start, End: e.end, Hours: e.hours,
      Project: e.project, Category: e.category, Billable: e.billable === 'yes' ? 'Billable' : 'Non-billable',
      Notes: e.notes || ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Timesheet');
    XLSX.writeFile(wb, `timesheet_${startDate}_to_${endDate}.xlsx`);
  }

  // Refresh everything
  async function refreshView() {
    await loadTimesheet();
    renderHistory();
    updateDailyProgress();
    updateCharts();
  }

  function initForm() {
    document.getElementById('logDate').value = formatDate(new Date());
    document.getElementById('startTime').addEventListener('change', updateHoursAuto);
    document.getElementById('endTime').addEventListener('change', updateHoursAuto);
    document.getElementById('nowStartBtn').onclick = () => {
      document.getElementById('startTime').value = new Date().toTimeString().slice(0,5);
      updateHoursAuto();
    };
    document.getElementById('nowEndBtn').onclick = () => {
      document.getElementById('endTime').value = new Date().toTimeString().slice(0,5);
      updateHoursAuto();
    };
    document.getElementById('addEntryBtn').onclick = addEntry;
    document.getElementById('refreshHistoryBtn').onclick = () => refreshView();
    document.getElementById('exportExcelBtn').onclick = () => exportToExcel();
    document.getElementById('printBtn').onclick = () => window.print();
    document.getElementById('filterRange').onchange = () => { renderHistory(); updateCharts(); };
    document.getElementById('filterProject').onchange = () => { renderHistory(); updateCharts(); };
    document.getElementById('filterCategory').onchange = () => { renderHistory(); updateCharts(); };
    document.getElementById('saveNameBtn').onclick = async () => {
      const newName = document.getElementById('userFullName').value.trim();
      if (newName) {
        userFullName = newName;
        await saveUserMeta(userFullName);
        document.getElementById('reportName').value = userFullName;
        alert("Name saved.");
      }
    };
    // New project button
    document.getElementById('addProjectBtn').onclick = () => {
      document.getElementById('newProjectName').value = '';
      $('#newProjectModal').modal('show');
    };
    document.getElementById('confirmNewProjectBtn').onclick = async () => {
      const newProj = document.getElementById('newProjectName').value.trim();
      if (!newProj) { alert("Enter project name."); return; }
      const success = await addNewProject(newProj);
      if (success) {
        await saveUserMeta(userFullName, projectList);
        await loadProjects();
        // select the new project in the dropdown
        document.getElementById('taskProject').value = newProj;
        $('#newProjectModal').modal('hide');
      } else {
        alert("Project already exists.");
      }
    };
    // Report modal
    document.getElementById('generateReportBtn').onclick = () => {
      document.getElementById('reportName').value = userFullName;
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      document.getElementById('reportStartDate').value = formatDate(start);
      document.getElementById('reportEndDate').value = formatDate(end);
      $('#reportModal').modal('show');
    };
    document.getElementById('generateReportConfirmBtn').onclick = () => {
      const start = document.getElementById('reportStartDate').value;
      const end = document.getElementById('reportEndDate').value;
      if (!start || !end) { alert("Select both start and end dates."); return; }
      const type = document.getElementById('reportType').value;
      $('#reportModal').modal('hide');
      if (type === 'pdf') generatePDFReport(start, end);
      else exportExcelRange(start, end);
    };
  }

  // Initial load: first load projects from portfolio, then user meta, then refresh view
  loadProjects().then(() => loadUserMeta()).then(() => refreshView()).catch(() => refreshView());
  initForm();
})();
