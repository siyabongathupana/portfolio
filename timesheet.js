// timesheet.js – Professional timesheet with all features
(function() {
  const user = window.SessionManager?.getCurrentUser();
  if (!user) {
    window.location.href = "login.html?redirect=timesheet";
    return;
  }

  const TIMESHEET_FILE = "timesheet.json";
  const USER_META_FILE = "user_meta.json";
  let entries = [];
  let categoryChart = null, billableChart = null, projectChart = null;
  let userFullName = "";
  let projectList = [];
  let autoRefreshInterval = null;

  function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toastId = "toast-" + Date.now();
    const bgClass = type === "success" ? "bg-success" : (type === "error" ? "bg-danger" : "bg-info");
    const html = `
      <div id="${toastId}" class="toast ${bgClass} text-white" role="alert" data-autohide="true" data-delay="3000">
        <div class="toast-body">${message}</div>
      </div>
    `;
    container.insertAdjacentHTML("beforeend", html);
    const toastEl = document.getElementById(toastId);
    $(toastEl).toast("show");
    toastEl.addEventListener("hidden.bs.toast", () => toastEl.remove());
  }

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
    const hours = calcHours(start, end);
    document.getElementById('hoursAuto').value = hours.toFixed(2);
  }

  async function loadProjects() {
    try {
      const projectsData = await window.portfolioData.loadProjects();
      projectList = Object.values(projectsData).map(p => p.title).filter(p => p);
      if (!projectList.includes("Other")) projectList.push("Other");
      projectList.sort();
    } catch (e) {
      projectList = ["Other"];
    }
    const select = document.getElementById('taskProject');
    if (select) {
      select.innerHTML = '';
      projectList.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        select.appendChild(opt);
      });
    }
    const filterSelect = document.getElementById('filterProject');
    if (filterSelect) {
      filterSelect.innerHTML = '<option value="all">All Projects</option>';
      projectList.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        filterSelect.appendChild(opt);
      });
    }
  }

  async function addNewProject(projectName) {
    if (!projectName || projectList.includes(projectName)) return false;
    projectList.push(projectName);
    projectList.sort();
    await saveUserMeta(userFullName, projectList);
    await loadProjects();
    return true;
  }

  async function loadTimesheet() {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${TIMESHEET_FILE}`;
    try {
      const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (file?.content) {
        entries = JSON.parse(file.content);
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
  }

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
          const combined = [...new Set([...projectList, ...meta.projectList])];
          projectList = combined;
        }
      }
    } catch(e) {}
    const nameField = document.getElementById('userFullName');
    const reportNameField = document.getElementById('reportName');
    if (nameField) nameField.value = userFullName;
    if (reportNameField) reportNameField.value = userFullName;
    if (!projectList.includes("Other")) projectList.push("Other");
    await loadProjects();
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
  }

  async function addEntry() {
    const date = document.getElementById('logDate').value;
    const start = document.getElementById('startTime').value;
    const end = document.getElementById('endTime').value;
    const project = document.getElementById('taskProject').value;
    const category = document.getElementById('taskCategory').value;
    const billable = document.getElementById('billable').value;
    const notes = document.getElementById('taskNotes').value.trim();
    
    if (!date || !start || !end || !project || !category) {
      showToast("Please fill all required fields (Date, Start, End, Project, Category).", "error");
      return;
    }
    const hours = calcHours(start, end);
    if (hours <= 0) {
      showToast("End time must be after start time.", "error");
      return;
    }
    
    const newEntry = { id: Date.now(), date, start, end, hours, project, category, billable, notes };
    entries.unshift(newEntry);
    await saveTimesheet();
    showToast("Entry saved successfully!");
    await refreshView();
    
    document.getElementById('startTime').value = '';
    document.getElementById('endTime').value = '';
    document.getElementById('taskNotes').value = '';
    document.getElementById('hoursAuto').value = '';
    if (document.getElementById('taskProject')) {
      document.getElementById('taskProject').value = project;
    }
  }

  async function deleteEntry(id) {
    if (confirm("Delete this entry?")) {
      entries = entries.filter(e => e.id != id);
      await saveTimesheet();
      showToast("Entry deleted.");
      await refreshView();
    }
  }

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
    const totalCell = document.getElementById('totalHoursCell');
    if (totalCell) totalCell.innerHTML = '<strong>' + totalHours.toFixed(2) + '</strong>';
    tfoot.style.display = 'table-footer-group';
  }

  function updateDailyProgress() {
    const today = formatDate(new Date());
    const todayHours = entries.filter(e => e.date === today).reduce((s,e) => s + e.hours, 0);
    const percent = Math.min(100, (todayHours / 8) * 100);
    const fill = document.getElementById('dailyProgressFill');
    if (fill) {
      fill.style.width = percent + '%';
      fill.innerText = todayHours.toFixed(1) + 'h';
      fill.style.background = todayHours >= 8 ? '#28a745' : '#2fc7ff';
    }
  }

  function updateCharts() {
    const filtered = getFilteredEntries();
    
    const projMap = {};
    filtered.forEach(e => { projMap[e.project] = (projMap[e.project] || 0) + e.hours; });
    if (projectChart) projectChart.destroy();
    const ctxProj = document.getElementById('projectChart');
    if (ctxProj && Object.keys(projMap).length > 0) {
      projectChart = new Chart(ctxProj, {
        type: 'pie',
        data: { labels: Object.keys(projMap), datasets: [{ data: Object.values(projMap), backgroundColor: ['#2fc7ff','#ffc107','#28a745','#dc3545','#6f42c1','#fd7e14','#17a2b8','#e83e8c'] }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } } }
      });
    }
    
    const catMap = {};
    filtered.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.hours; });
    if (categoryChart) categoryChart.destroy();
    const ctxCat = document.getElementById('categoryChart');
    if (ctxCat && Object.keys(catMap).length > 0) {
      categoryChart = new Chart(ctxCat, {
        type: 'pie',
        data: { labels: Object.keys(catMap), datasets: [{ data: Object.values(catMap), backgroundColor: ['#2fc7ff','#ffc107','#28a745','#dc3545','#6f42c1','#fd7e14'] }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } } }
      });
    }
    
    let billable = 0, nonBill = 0;
    filtered.forEach(e => { if (e.billable === 'yes') billable += e.hours; else nonBill += e.hours; });
    if (billableChart) billableChart.destroy();
    const ctxBill = document.getElementById('billableChart');
    if (ctxBill) {
      billableChart = new Chart(ctxBill, {
        type: 'pie',
        data: { labels: ['Billable', 'Non-billable'], datasets: [{ data: [billable, nonBill], backgroundColor: ['#28a745','#dc3545'] }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } } }
      });
    }
  }

  function exportToExcel() {
    const filtered = getFilteredEntries();
    if (filtered.length === 0) { showToast("No data to export.", "error"); return; }
    const data = filtered.map(e => ({
      Date: e.date, Start: e.start, End: e.end, Hours: e.hours,
      Project: e.project, Category: e.category, Billable: e.billable === 'yes' ? 'Billable' : 'Non-billable',
      Notes: e.notes || ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Timesheet');
    XLSX.writeFile(wb, `timesheet_${formatDate(new Date())}.xlsx`);
    showToast("Excel file downloaded.");
  }

  async function generatePDFReport(startDate, endDate) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const filtered = entries.filter(e => e.date >= startDate && e.date <= endDate);
      if (filtered.length === 0) {
        showToast("No entries in the selected date range.", "error");
        return;
      }
      const name = document.getElementById('reportName')?.value || userFullName || user.username;
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
      showToast("PDF report generated.");
    } catch (err) {
      console.error(err);
      showToast("PDF generation failed: " + err.message, "error");
    }
  }

  function exportExcelRange(startDate, endDate) {
    const filtered = entries.filter(e => e.date >= startDate && e.date <= endDate);
    if (filtered.length === 0) { showToast("No entries in selected range.", "error"); return; }
    const data = filtered.map(e => ({
      Date: e.date, Start: e.start, End: e.end, Hours: e.hours,
      Project: e.project, Category: e.category, Billable: e.billable === 'yes' ? 'Billable' : 'Non-billable',
      Notes: e.notes || ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Timesheet');
    XLSX.writeFile(wb, `timesheet_${startDate}_to_${endDate}.xlsx`);
    showToast("Excel file downloaded.");
  }

  async function refreshView() {
    await loadTimesheet();
    renderHistory();
    updateDailyProgress();
    updateCharts();
  }

  function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(async () => {
      if (!document.hidden) {
        await refreshView();
      }
    }, 60000);
  }

  async function init() {
    // Set default date
    const dateInput = document.getElementById('logDate');
    if (dateInput) dateInput.value = formatDate(new Date());
    
    // Set up event listeners
    const startTime = document.getElementById('startTime');
    const endTime = document.getElementById('endTime');
    if (startTime) startTime.addEventListener('change', updateHoursAuto);
    if (endTime) endTime.addEventListener('change', updateHoursAuto);
    
    const nowStart = document.getElementById('nowStartBtn');
    if (nowStart) {
      nowStart.onclick = () => {
        if (startTime) startTime.value = new Date().toTimeString().slice(0,5);
        updateHoursAuto();
      };
    }
    
    const nowEnd = document.getElementById('nowEndBtn');
    if (nowEnd) {
      nowEnd.onclick = () => {
        if (endTime) endTime.value = new Date().toTimeString().slice(0,5);
        updateHoursAuto();
      };
    }
    
    const addBtn = document.getElementById('addEntryBtn');
    if (addBtn) addBtn.onclick = addEntry;
    
    const refreshBtn = document.getElementById('refreshHistoryBtn');
    if (refreshBtn) refreshBtn.onclick = () => refreshView();
    
    const exportBtn = document.getElementById('exportExcelBtn');
    if (exportBtn) exportBtn.onclick = () => exportToExcel();
    
    const printBtn = document.getElementById('printBtn');
    if (printBtn) printBtn.onclick = () => window.print();
    
    const rangeFilter = document.getElementById('filterRange');
    if (rangeFilter) rangeFilter.onchange = () => { renderHistory(); updateCharts(); };
    
    const projectFilter = document.getElementById('filterProject');
    if (projectFilter) projectFilter.onchange = () => { renderHistory(); updateCharts(); };
    
    const categoryFilter = document.getElementById('filterCategory');
    if (categoryFilter) categoryFilter.onchange = () => { renderHistory(); updateCharts(); };
    
    const saveNameBtn = document.getElementById('saveNameBtn');
    if (saveNameBtn) {
      saveNameBtn.onclick = async () => {
        const newName = document.getElementById('userFullName')?.value.trim();
        if (newName) {
          userFullName = newName;
          await saveUserMeta(userFullName);
          const reportName = document.getElementById('reportName');
          if (reportName) reportName.value = userFullName;
          showToast("Name saved.");
        }
      };
    }
    
    const addProjectBtn = document.getElementById('addProjectBtn');
    if (addProjectBtn) {
      addProjectBtn.onclick = () => {
        const newProjInput = document.getElementById('newProjectName');
        if (newProjInput) newProjInput.value = '';
        $('#newProjectModal').modal('show');
      };
    }
    
    const confirmProjectBtn = document.getElementById('confirmNewProjectBtn');
    if (confirmProjectBtn) {
      confirmProjectBtn.onclick = async () => {
        const newProj = document.getElementById('newProjectName')?.value.trim();
        if (!newProj) { showToast("Enter project name.", "error"); return; }
        const success = await addNewProject(newProj);
        if (success) {
          await saveUserMeta(userFullName, projectList);
          await loadProjects();
          const taskProject = document.getElementById('taskProject');
          if (taskProject) taskProject.value = newProj;
          $('#newProjectModal').modal('hide');
          showToast(`Project "${newProj}" added.`);
        } else {
          showToast("Project already exists.", "error");
        }
      };
    }
    
    const generateReportBtn = document.getElementById('generateReportBtn');
    if (generateReportBtn) {
      generateReportBtn.onclick = () => {
        const reportName = document.getElementById('reportName');
        if (reportName) reportName.value = userFullName;
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        const startDateInput = document.getElementById('reportStartDate');
        const endDateInput = document.getElementById('reportEndDate');
        if (startDateInput) startDateInput.value = formatDate(start);
        if (endDateInput) endDateInput.value = formatDate(end);
        $('#reportModal').modal('show');
      };
    }
    
    const generateConfirmBtn = document.getElementById('generateReportConfirmBtn');
    if (generateConfirmBtn) {
      generateConfirmBtn.onclick = () => {
        const start = document.getElementById('reportStartDate')?.value;
        const end = document.getElementById('reportEndDate')?.value;
        if (!start || !end) { showToast("Select both start and end dates.", "error"); return; }
        const type = document.getElementById('reportType')?.value;
        $('#reportModal').modal('hide');
        if (type === 'pdf') generatePDFReport(start, end);
        else exportExcelRange(start, end);
      };
    }
    
    await loadProjects();
    await loadUserMeta();
    await refreshView();
    startAutoRefresh();
  }

  init().catch(err => console.error(err));
})();
