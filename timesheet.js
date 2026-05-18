// timesheet.js – complete with background queue, conflict retry, notification toggle, professional PDF reports, and QR code footer
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
  let notificationsEnabled = true;
  let autoRefreshInterval = null;

  // Write queue & retry logic
  let isSaving = false;
  let saveQueue = [];

  function setButtonLoading(btn, isLoading, originalText = null) {
    if (!btn) return;
    if (isLoading) {
      btn.originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Saving...';
    } else {
      btn.disabled = false;
      if (btn.originalText) btn.innerHTML = btn.originalText;
    }
  }

  async function queueSave() {
    return new Promise((resolve, reject) => {
      if (!isSaving) {
        executeSave(resolve, reject);
      } else {
        saveQueue.push({ resolve, reject });
      }
    });
  }

  async function executeSave(resolve, reject) {
    isSaving = true;
    try {
      await saveTimesheetWithRetry();
      resolve();
    } catch (err) {
      reject(err);
    } finally {
      isSaving = false;
      if (saveQueue.length > 0) {
        const next = saveQueue.shift();
        executeSave(next.resolve, next.reject);
      }
    }
  }

  async function saveTimesheetWithRetry(maxRetries = 3, baseDelay = 500) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await saveTimesheetInternal();
        return;
      } catch (err) {
        lastError = err;
        if (err.message && (err.message.includes('sha') || err.message.includes('does not match'))) {
          console.warn(`Conflict detected, retrying (${attempt}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, attempt - 1)));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  async function saveTimesheetInternal() {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${TIMESHEET_FILE}`;
    let sha = null;
    try {
      const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (existing) sha = existing.sha;
    } catch(e) {}
    await GitHubAPI.updateFile(owner, repo, path, entries, "Update timesheet", branch, user.pat, sha);
  }

  async function saveTimesheet() {
    return queueSave();
  }

  function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toastId = "toast-" + Date.now();
    const bgClass = type === "success" ? "bg-success" : (type === "error" ? "bg-danger" : "bg-info");
    const html = `<div id="${toastId}" class="toast ${bgClass} text-white" role="alert" data-autohide="true" data-delay="3000"><div class="toast-body">${message}</div></div>`;
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
    document.getElementById('hoursAuto').value = calcHours(start, end).toFixed(2);
  }

  async function loadProjectsFromPortfolio() {
    try {
      const projectsData = await window.portfolioData.loadProjects();
      projectList = Object.values(projectsData).map(p => p.title).filter(p => p);
      if (!projectList.includes("Other")) projectList.push("Other");
      projectList.sort();
    } catch (e) {
      console.warn("Failed to load portfolio projects", e);
      projectList = ["Other"];
    }
    const selects = ['taskProject', 'editProject', 'filterProject'];
    for (let id of selects) {
      const sel = document.getElementById(id);
      if (!sel) continue;
      const currentVal = sel.value;
      sel.innerHTML = '';
      if (id === 'filterProject') sel.innerHTML = '<option value="all">All Projects</option>';
      projectList.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        sel.appendChild(opt);
      });
      if (currentVal && projectList.includes(currentVal)) sel.value = currentVal;
    }
  }

  async function createPortfolioProject(projectName) {
    if (projectList.includes(projectName)) return false;
    const newId = 'proj_' + Date.now();
    const newProject = {
      id: newId,
      title: projectName,
      controllerType: 'MD',
      projectType: 'Other',
      deltaVVersion: '',
      cabinetCount: 0,
      io: { AI: 0, AO: 0, DI: 0, DO: 0 },
      dates: { start: '', finish: '', ifat: '', cfat: '' },
      siteLocation: '',
      team: { lead: '', engineer: '', technician: '' },
      description: `Created from timesheet on ${new Date().toLocaleDateString()}`,
      graphType: 'bar',
      selectedImages: []
    };
    const allProjects = await window.portfolioData.loadProjects();
    allProjects[newId] = newProject;
    await window.portfolioData.saveProjects(allProjects);
    await loadProjectsFromPortfolio();
    await window.Logger.log('create_project_from_timesheet', `Created project: ${projectName}`);
    return true;
  }

  async function addNewProject(projectName) {
    if (!projectName) return false;
    window.showLoading(`Creating project "${projectName}"...`);
    try {
      const success = await createPortfolioProject(projectName);
      if (success) {
        await loadProjectsFromPortfolio();
        const taskSelect = document.getElementById('taskProject');
        if (taskSelect && projectList.includes(projectName)) taskSelect.value = projectName;
        showToast(`Project "${projectName}" created in your portfolio.`);
        return true;
      } else {
        showToast("Project already exists or creation failed.", "error");
        return false;
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to create project: " + err.message, "error");
      return false;
    } finally {
      window.hideLoading();
    }
  }

  async function loadTimesheet() {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${TIMESHEET_FILE}`;
    try {
      const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (file && file.content) {
        entries = JSON.parse(file.content);
        entries = entries.map(e => ({ ...e, project: e.project || "Other" }));
      } else {
        entries = [];
      }
    } catch(e) { entries = []; }
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async function loadUserMeta() {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${USER_META_FILE}`;
    try {
      const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (file && file.content) {
        const meta = JSON.parse(file.content);
        userFullName = meta.fullName || "";
      }
    } catch(e) { userFullName = ""; }
    const nameField = document.getElementById('userFullName');
    const reportNameField = document.getElementById('reportName');
    if (nameField) nameField.value = userFullName;
    if (reportNameField) reportNameField.value = userFullName;
  }

  async function saveUserMeta(fullName) {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${USER_META_FILE}`;
    let sha = null;
    try {
      const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (existing) sha = existing.sha;
    } catch(e) {}
    const meta = { fullName };
    await GitHubAPI.updateFile(owner, repo, path, meta, "Update user name", branch, user.pat, sha);
  }

  async function loadNotificationPreference() {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/preferences.json`;
    try {
      const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (file && file.content) {
        const prefs = JSON.parse(file.content);
        notificationsEnabled = prefs.notifications !== undefined ? prefs.notifications : true;
      } else {
        notificationsEnabled = true;
      }
    } catch(e) {
      notificationsEnabled = true;
    }
    const toggle = document.getElementById('notificationsToggle');
    if (toggle) toggle.checked = notificationsEnabled;
  }

  async function saveNotificationPreference(enabled) {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/preferences.json`;
    let sha = null;
    try {
      const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (existing) sha = existing.sha;
    } catch(e) {}
    const prefs = { notifications: enabled };
    await GitHubAPI.updateFile(owner, repo, path, prefs, "Update notification preference", branch, user.pat, sha);
    notificationsEnabled = enabled;
  }

  async function addEntry(duplicateData = null) {
    let date, start, end, project, category, billable, notes;
    if (duplicateData) {
      date = duplicateData.date;
      start = duplicateData.start;
      end = duplicateData.end;
      project = duplicateData.project;
      category = duplicateData.category;
      billable = duplicateData.billable;
      notes = duplicateData.notes ? duplicateData.notes + " (copy)" : "copy";
    } else {
      date = document.getElementById('logDate').value;
      start = document.getElementById('startTime').value;
      end = document.getElementById('endTime').value;
      project = document.getElementById('taskProject').value;
      category = document.getElementById('taskCategory').value;
      billable = document.getElementById('billable').value;
      notes = document.getElementById('taskNotes').value.trim();
    }
    if (!date || !start || !end || !project || !category) {
      showToast("Please fill all required fields.", "error");
      return;
    }
    const hours = calcHours(start, end);
    if (hours <= 0) {
      showToast("End time must be after start time.", "error");
      return;
    }

    const addBtn = document.getElementById('addEntryBtn');
    setButtonLoading(addBtn, true);

    try {
      const newEntry = { id: Date.now(), date, start, end, hours, project, category, billable, notes };
      entries.unshift(newEntry);
      await saveTimesheet();
      showToast(duplicateData ? "Entry duplicated!" : "Entry saved.");
      await refreshView();
      if (!duplicateData) {
        document.getElementById('startTime').value = '';
        document.getElementById('endTime').value = '';
        document.getElementById('taskNotes').value = '';
        document.getElementById('hoursAuto').value = '';
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to save entry: " + err.message, "error");
    } finally {
      setButtonLoading(addBtn, false);
    }
  }

  async function deleteEntry(id) {
    if (!confirm("Delete this entry?")) return;
    const delBtn = document.querySelector(`button[data-id='${id}']`);
    if (delBtn) setButtonLoading(delBtn, true);
    try {
      entries = entries.filter(e => e.id != id);
      await saveTimesheet();
      showToast("Entry deleted.");
      await refreshView();
    } catch (err) {
      showToast("Delete failed: " + err.message, "error");
    } finally {
      if (delBtn) setButtonLoading(delBtn, false);
    }
  }

  async function duplicateEntry(entry) {
    await addEntry(entry);
  }

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

  async function saveEdit() {
    const id = parseInt(document.getElementById('editEntryId').value);
    const index = entries.findIndex(e => e.id == id);
    if (index === -1) return;
    const date = document.getElementById('editDate').value;
    const start = document.getElementById('editStart').value;
    const end = document.getElementById('editEnd').value;
    const project = document.getElementById('editProject').value;
    const category = document.getElementById('editCategory').value;
    const billable = document.getElementById('editBillable').value;
    const notes = document.getElementById('editNotes').value.trim();
    if (!date || !start || !end || !project || !category) {
      showToast("Please fill all fields.", "error");
      return;
    }
    const hours = calcHours(start, end);
    if (hours <= 0) {
      showToast("End time must be after start.", "error");
      return;
    }
    const saveBtn = document.getElementById('saveEditBtn');
    setButtonLoading(saveBtn, true);
    try {
      entries[index] = { ...entries[index], date, start, end, hours, project, category, billable, notes };
      await saveTimesheet();
      $('#editModal').modal('hide');
      showToast("Entry updated.");
      await refreshView();
    } catch (err) {
      showToast("Update failed: " + err.message, "error");
    } finally {
      setButtonLoading(saveBtn, false);
    }
  }

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
          const startOfWeek = new Date(now);
          const day = now.getDay();
          const diff = (day === 0 ? 6 : day - 1);
          startOfWeek.setDate(now.getDate() - diff);
          startOfWeek.setHours(0,0,0,0);
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 6);
          endOfWeek.setHours(23,59,59,999);
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
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-sm btn-edit mr-1';
      editBtn.innerHTML = '<i class="fa fa-pencil"></i>';
      editBtn.onclick = () => editEntry(entry.id);
      const dupBtn = document.createElement('button');
      dupBtn.className = 'btn btn-sm btn-duplicate mr-1';
      dupBtn.innerHTML = '<i class="fa fa-copy"></i>';
      dupBtn.onclick = () => duplicateEntry(entry);
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.innerHTML = '<i class="fa fa-trash"></i>';
      delBtn.dataset.id = entry.id;
      delBtn.onclick = () => deleteEntry(entry.id);
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
    let overtime = 0;
    for (const date in dailyHours) if (dailyHours[date] > 8) overtime += (dailyHours[date] - 8);
    return overtime;
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
    if (fill) {
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
  }

  // Helper to get entries for a date range
  function getEntriesForPeriod(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23,59,59,999);
    return entries.filter(e => {
      const d = new Date(e.date);
      return d >= start && d <= end;
    });
  }

  // Function to generate QR code as data URL using free API
  async function getQRCodeDataURL(url, size = 100) {
    const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`;
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error('QR code generation failed');
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  // Updated PDF generation with professional styling, charts embedded, and QR code footer
  async function generateStyledPDF(startDate, endDate, periodLabel) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const filtered = getEntriesForPeriod(startDate, endDate);
    if (filtered.length === 0) {
      showToast("No entries in selected period.", "error");
      return false;
    }

    const name = document.getElementById('reportName').value || userFullName || user.username;
    const totalHours = filtered.reduce((s,e) => s + e.hours, 0);
    const billableHours = filtered.filter(e => e.billable === 'yes').reduce((s,e) => s + e.hours, 0);
    const nonBillable = totalHours - billableHours;
    const overtime = calculateOvertimeForPeriod(filtered);

    // Prepare data for charts
    const projMap = {};
    filtered.forEach(e => { projMap[e.project] = (projMap[e.project] || 0) + e.hours; });
    const catMap = {};
    filtered.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.hours; });
    let billable = 0, nonBill = 0;
    filtered.forEach(e => { if (e.billable === 'yes') billable += e.hours; else nonBill += e.hours; });

    // Create canvas elements for charts (hidden)
    const chartDiv = document.createElement('div');
    chartDiv.style.position = 'absolute';
    chartDiv.style.top = '-9999px';
    chartDiv.style.left = '-9999px';
    chartDiv.style.width = '400px';
    chartDiv.style.height = '300px';
    document.body.appendChild(chartDiv);

    const canvas1 = document.createElement('canvas');
    canvas1.width = 400;
    canvas1.height = 300;
    chartDiv.appendChild(canvas1);
    const ctx1 = canvas1.getContext('2d');
    const projChart = new Chart(ctx1, {
      type: 'pie',
      data: { labels: Object.keys(projMap), datasets: [{ data: Object.values(projMap), backgroundColor: ['#2fc7ff','#ffc107','#28a745','#dc3545','#6f42c1','#fd7e14','#17a2b8','#e83e8c'] }] },
      options: { responsive: false }
    });

    const canvas2 = document.createElement('canvas');
    canvas2.width = 400;
    canvas2.height = 300;
    chartDiv.appendChild(canvas2);
    const ctx2 = canvas2.getContext('2d');
    const catChart = new Chart(ctx2, {
      type: 'pie',
      data: { labels: Object.keys(catMap), datasets: [{ data: Object.values(catMap), backgroundColor: ['#2fc7ff','#ffc107','#28a745','#dc3545','#6f42c1','#fd7e14'] }] },
      options: { responsive: false }
    });

    const canvas3 = document.createElement('canvas');
    canvas3.width = 400;
    canvas3.height = 300;
    chartDiv.appendChild(canvas3);
    const ctx3 = canvas3.getContext('2d');
    const billChart = new Chart(ctx3, {
      type: 'pie',
      data: { labels: ['Billable', 'Non-billable'], datasets: [{ data: [billable, nonBill], backgroundColor: ['#28a745','#dc3545'] }] },
      options: { responsive: false }
    });

    await new Promise(r => setTimeout(r, 200));
    const imgData1 = canvas1.toDataURL('image/png');
    const imgData2 = canvas2.toDataURL('image/png');
    const imgData3 = canvas3.toDataURL('image/png');
    projChart.destroy();
    catChart.destroy();
    billChart.destroy();
    document.body.removeChild(chartDiv);

    // Generate QR code
    const repoUrl = 'https://github.com/siyabongathupana/portfolio/';
    let qrDataUrl = null;
    try {
      qrDataUrl = await getQRCodeDataURL(repoUrl, 80);
    } catch (err) {
      console.warn('QR code generation failed:', err);
    }

    // Build table
    const tableData = filtered.map(e => [e.date, e.start, e.end, e.hours.toFixed(2), e.project, e.category, e.billable === 'yes' ? 'Billable' : 'Non-billable', e.notes || '']);

    // PDF content
    doc.setFontSize(20);
    doc.setTextColor(11, 43, 59);
    doc.text('Timesheet Report', 20, 20);
    doc.setFontSize(12);
    doc.setTextColor(47, 199, 255);
    doc.text(`Period: ${periodLabel} (${startDate} to ${endDate})`, 20, 32);
    doc.setTextColor(80, 80, 80);
    doc.text(`Prepared for: ${name}`, 20, 42);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 52);
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`Summary: ${totalHours.toFixed(2)} total hours (Billable: ${billableHours.toFixed(2)}, Non-billable: ${nonBillable.toFixed(2)}, Overtime: ${overtime.toFixed(2)})`, 20, 65);

    // Add charts
    doc.addImage(imgData1, 'PNG', 20, 75, 50, 40);
    doc.addImage(imgData2, 'PNG', 85, 75, 50, 40);
    doc.addImage(imgData3, 'PNG', 150, 75, 50, 40);
    doc.setFontSize(10);
    doc.text('By Project', 20, 120);
    doc.text('By Category', 85, 120);
    doc.text('Billable vs Non-Billable', 150, 120);

    // Table
    doc.autoTable({
      startY: 130,
      head: [['Date','Start','End','Hours','Project','Category','Billable','Notes']],
      body: tableData,
      foot: [['','','',totalHours.toFixed(2),'','','','']],
      theme: 'striped',
      headStyles: { fillColor: [11, 43, 59], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' },
      margin: { left: 20, right: 20 },
      columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 16 }, 2: { cellWidth: 16 }, 3: { cellWidth: 16 }, 4: { cellWidth: 35 }, 5: { cellWidth: 30 }, 6: { cellWidth: 25 }, 7: { cellWidth: 45 } }
    });

    // Add QR code footer on all pages
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text(`Your Portfolio – Timesheet | Page ${i} of ${pageCount}`, 20, doc.internal.pageSize.height - 10);
      if (qrDataUrl) {
        // Place QR code at bottom right corner
        const pageWidth = doc.internal.pageSize.width;
        const qrSize = 20; // mm
        doc.addImage(qrDataUrl, 'PNG', pageWidth - qrSize - 10, doc.internal.pageSize.height - qrSize - 10, qrSize, qrSize);
        // Optionally add small label
        doc.setFontSize(6);
        doc.text('Scan to view repo', pageWidth - qrSize - 8, doc.internal.pageSize.height - qrSize - 12);
      }
    }

    doc.save(`timesheet_${periodLabel}_${startDate}_to_${endDate}.pdf`);
    showToast("PDF report generated.");
    return true;
  }

  // Excel export for custom period
  function exportExcelRange(startDate, endDate, periodLabel) {
    const filtered = getEntriesForPeriod(startDate, endDate);
    if (!filtered.length) { showToast("No entries in selected range.", "error"); return; }
    const data = filtered.map(e => ({
      Date: e.date, Start: e.start, End: e.end, Hours: e.hours,
      Project: e.project, Category: e.category, Billable: e.billable === 'yes' ? 'Billable' : 'Non-billable',
      Notes: e.notes || ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Timesheet');
    XLSX.writeFile(wb, `timesheet_${periodLabel}_${startDate}_to_${endDate}.xlsx`);
    showToast("Excel downloaded.");
  }

  function exportToExcel() {
    const filtered = getFilteredEntries();
    if (!filtered.length) { showToast("No data to export.", "error"); return; }
    const data = filtered.map(e => ({
      Date: e.date, Start: e.start, End: e.end, Hours: e.hours,
      Project: e.project, Category: e.category, Billable: e.billable === 'yes' ? 'Billable' : 'Non-billable',
      Notes: e.notes || ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Timesheet');
    XLSX.writeFile(wb, `timesheet_${formatDate(new Date())}.xlsx`);
    showToast("Excel downloaded.");
  }

  async function refreshView() {
    await loadTimesheet();
    await loadProjectsFromPortfolio();
    renderHistory();
    updateSummaryAndProgress();
    updateCharts();
  }

  function updateCharts() {
    const filtered = getFilteredEntries();
    const projMap = {};
    filtered.forEach(e => { projMap[e.project] = (projMap[e.project] || 0) + e.hours; });
    if (projectChart) projectChart.destroy();
    const ctxProj = document.getElementById('projectChart');
    if (ctxProj && Object.keys(projMap).length) {
      projectChart = new Chart(ctxProj, { type: 'pie', data: { labels: Object.keys(projMap), datasets: [{ data: Object.values(projMap), backgroundColor: ['#2fc7ff','#ffc107','#28a745','#dc3545','#6f42c1','#fd7e14','#17a2b8','#e83e8c'] }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } } } });
    }
    const catMap = {};
    filtered.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.hours; });
    if (categoryChart) categoryChart.destroy();
    const ctxCat = document.getElementById('categoryChart');
    if (ctxCat && Object.keys(catMap).length) {
      categoryChart = new Chart(ctxCat, { type: 'pie', data: { labels: Object.keys(catMap), datasets: [{ data: Object.values(catMap), backgroundColor: ['#2fc7ff','#ffc107','#28a745','#dc3545','#6f42c1','#fd7e14'] }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } } } });
    }
    let billable = 0, nonBill = 0;
    filtered.forEach(e => { if (e.billable === 'yes') billable += e.hours; else nonBill += e.hours; });
    if (billableChart) billableChart.destroy();
    const ctxBill = document.getElementById('billableChart');
    if (ctxBill && (billable+nonBill > 0)) {
      billableChart = new Chart(ctxBill, { type: 'pie', data: { labels: ['Billable', 'Non-billable'], datasets: [{ data: [billable, nonBill], backgroundColor: ['#28a745','#dc3545'] }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } } } });
    }
  }

  function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(async () => { if (!document.hidden) await refreshView(); }, 60000);
  }

  async function init() {
    const dateInput = document.getElementById('logDate');
    if (dateInput) dateInput.value = formatDate(new Date());
    document.getElementById('startTime')?.addEventListener('change', updateHoursAuto);
    document.getElementById('endTime')?.addEventListener('change', updateHoursAuto);
    document.getElementById('nowStartBtn').onclick = () => { document.getElementById('startTime').value = new Date().toTimeString().slice(0,5); updateHoursAuto(); };
    document.getElementById('nowEndBtn').onclick = () => { document.getElementById('endTime').value = new Date().toTimeString().slice(0,5); updateHoursAuto(); };
    document.getElementById('addEntryBtn').onclick = () => addEntry();
    document.getElementById('refreshHistoryBtn').onclick = () => refreshView();
    document.getElementById('exportExcelBtn').onclick = () => exportToExcel();
    document.getElementById('printBtn').onclick = () => window.print();
    document.getElementById('filterRange').onchange = () => { renderHistory(); updateSummaryAndProgress(); updateCharts(); };
    document.getElementById('filterProject').onchange = () => { renderHistory(); updateSummaryAndProgress(); updateCharts(); };
    document.getElementById('filterCategory').onchange = () => { renderHistory(); updateSummaryAndProgress(); updateCharts(); };
    document.getElementById('saveNameBtn').onclick = async () => {
      const newName = document.getElementById('userFullName')?.value.trim();
      if (!newName) { showToast("Please enter a name.", "error"); return; }
      window.showLoading("Saving your name...");
      try {
        userFullName = newName;
        await saveUserMeta(userFullName);
        document.getElementById('reportName').value = userFullName;
        showToast("Name saved successfully.");
        await window.Logger.log('save_name', `Updated full name to ${newName}`);
      } catch (err) {
        showToast("Failed to save name: " + err.message, "error");
      } finally {
        window.hideLoading();
      }
    };
    document.getElementById('addProjectBtn').onclick = () => { document.getElementById('newProjectName').value = ''; $('#newProjectModal').modal('show'); };
    document.getElementById('confirmNewProjectBtn').onclick = async () => {
      const newProj = document.getElementById('newProjectName')?.value.trim();
      if (!newProj) { showToast("Enter project name.", "error"); return; }
      await addNewProject(newProj);
      $('#newProjectModal').modal('hide');
    };

    // Report generation with period selection
    const periodSelect = document.getElementById('reportPeriod');
    const customDiv = document.getElementById('customRangeDiv');
    if (periodSelect) {
      periodSelect.addEventListener('change', () => {
        customDiv.style.display = periodSelect.value === 'custom' ? 'block' : 'none';
      });
    }
    document.getElementById('generateReportBtn').onclick = () => {
      document.getElementById('reportName').value = userFullName;
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      document.getElementById('reportStartDate').value = formatDate(start);
      document.getElementById('reportEndDate').value = formatDate(end);
      if (periodSelect) periodSelect.value = 'month';
      customDiv.style.display = 'none';
      $('#reportModal').modal('show');
    };
    document.getElementById('generateReportConfirmBtn').onclick = async () => {
      const period = periodSelect ? periodSelect.value : 'month';
      let start, end, label;
      const today = new Date();
      if (period === 'week') {
        start = new Date(today);
        start.setDate(today.getDate() - 7);
        end = today;
        label = 'weekly';
      } else if (period === 'month') {
        start = new Date(today);
        start.setDate(today.getDate() - 30);
        end = today;
        label = 'monthly';
      } else if (period === 'year') {
        start = new Date(today);
        start.setFullYear(today.getFullYear() - 1);
        end = today;
        label = 'yearly';
      } else {
        start = document.getElementById('reportStartDate').value;
        end = document.getElementById('reportEndDate').value;
        if (!start || !end) { showToast("Select both start and end dates.", "error"); return; }
        label = 'custom';
      }
      const type = document.getElementById('reportType').value;
      $('#reportModal').modal('hide');
      if (type === 'pdf') {
        await generateStyledPDF(formatDate(start), formatDate(end), label);
      } else {
        exportExcelRange(formatDate(start), formatDate(end), label);
      }
    };

    document.getElementById('saveEditBtn').onclick = saveEdit;

    // Notification toggle
    await loadNotificationPreference();
    const toggle = document.getElementById('notificationsToggle');
    if (toggle) {
      toggle.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        window.showLoading("Saving notification preference...");
        try {
          await saveNotificationPreference(enabled);
          showToast(enabled ? "Email notifications enabled" : "Email notifications disabled");
        } catch (err) {
          showToast("Failed to save preference: " + err.message, "error");
          e.target.checked = !enabled;
        } finally {
          window.hideLoading();
        }
      });
    }

    await loadUserMeta();
    await loadProjectsFromPortfolio();
    await refreshView();
    startAutoRefresh();
  }

  init().catch(err => console.error("Timesheet init error", err));
})();
