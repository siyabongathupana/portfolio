// timesheet.js – professional PDF with pie charts, anti-tamper headers, and password-protected Excel
(function() {
  const user = window.SessionManager?.getCurrentUser();
  if (!user) {
    window.location.href = "login.html?redirect=timesheet";
    return;
  }

  // ======================== CONFIGURATION ========================
  const TIMESHEET_FILE = "timesheet.json";
  const USER_META_FILE = "user_meta.json";
  const PREFS_FILE = "preferences.json";

  let entries = [];
  let projectList = [];
  let userFullName = "";
  let notificationsEnabled = true;
  let autoRefreshInterval = null;

  let projectChart = null, categoryChart = null, billableChart = null;

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

  function setButtonLoading(btn, isLoading, originalText = null) {
    if (!btn) return;
    if (isLoading) {
      btn.originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> ' + (originalText || "Processing...");
    } else {
      btn.disabled = false;
      if (btn.originalText) btn.innerHTML = btn.originalText;
    }
  }

  // ======================== DATA LOAD & SAVE (CONFLICT RESOLUTION) ========================
  async function loadTimesheet() {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${TIMESHEET_FILE}`;
    try {
      const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (file && file.content) {
        entries = JSON.parse(file.content);
        entries = entries.map(e => ({ ...e, updatedAt: e.updatedAt || e.id }));
        entries.sort((a, b) => new Date(b.date) - new Date(a.date));
      } else {
        entries = [];
      }
    } catch(e) {
      entries = [];
    }
  }

  async function saveTimesheet(optimisticEntries = null) {
    const dataToSave = optimisticEntries !== null ? optimisticEntries : entries;
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${TIMESHEET_FILE}`;
    let retries = 3;
    while (retries > 0) {
      try {
        let remoteEntries = [];
        let sha = null;
        try {
          const remoteFile = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
          if (remoteFile && remoteFile.content) {
            remoteEntries = JSON.parse(remoteFile.content);
            sha = remoteFile.sha;
          }
        } catch(e) { /* no remote */ }
        const mergedMap = new Map();
        for (const e of remoteEntries) mergedMap.set(e.id, e);
        for (const e of dataToSave) {
          const existing = mergedMap.get(e.id);
          if (!existing || (e.updatedAt > existing.updatedAt)) mergedMap.set(e.id, e);
        }
        const merged = Array.from(mergedMap.values());
        merged.sort((a,b) => new Date(b.date) - new Date(a.date));
        await GitHubAPI.updateFile(owner, repo, path, merged, "Update timesheet", branch, user.pat, sha);
        entries = merged;
        return true;
      } catch (err) {
        retries--;
        if (retries === 0) {
          showToast("Failed to save after multiple attempts: " + err.message, "error");
          throw err;
        }
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  // ======================== UI HELPERS ========================
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
    setButtonLoading(addBtn, true, "Adding...");
    try {
      const newEntry = {
        id: Date.now(),
        date, start, end, hours, project, category, billable, notes,
        updatedAt: Date.now()
      };
      const newEntries = [newEntry, ...entries];
      await saveTimesheet(newEntries);
      showToast(duplicateData ? "Entry duplicated!" : "Entry saved.");
      await refreshView();
      if (!duplicateData) {
        document.getElementById('startTime').value = '';
        document.getElementById('endTime').value = '';
        document.getElementById('taskNotes').value = '';
        document.getElementById('hoursAuto').value = '';
      }
    } catch (err) {
      showToast("Failed to add entry: " + err.message, "error");
    } finally {
      setButtonLoading(addBtn, false);
    }
  }

  async function deleteEntry(id) {
    if (!confirm("Delete this entry?")) return;
    const delBtn = document.querySelector(`button[data-id='${id}']`);
    if (delBtn) setButtonLoading(delBtn, true, "Deleting...");
    try {
      const newEntries = entries.filter(e => e.id != id);
      await saveTimesheet(newEntries);
      showToast("Entry deleted.");
      await refreshView();
    } catch (err) {
      showToast("Delete failed: " + err.message, "error");
    } finally {
      if (delBtn) setButtonLoading(delBtn, false);
    }
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
    setButtonLoading(saveBtn, true, "Saving...");
    try {
      const index = entries.findIndex(e => e.id == id);
      if (index === -1) throw new Error("Entry not found");
      const updatedEntry = {
        ...entries[index],
        date, start, end, hours, project, category, billable, notes,
        updatedAt: Date.now()
      };
      const newEntries = [...entries];
      newEntries[index] = updatedEntry;
      await saveTimesheet(newEntries);
      $('#editModal').modal('hide');
      showToast("Entry updated.");
      await refreshView();
    } catch (err) {
      showToast("Update failed: " + err.message, "error");
    } finally {
      setButtonLoading(saveBtn, false);
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

  function updateCharts() {
    const filtered = getFilteredEntries();
    const projMap = {};
    filtered.forEach(e => { projMap[e.project] = (projMap[e.project] || 0) + e.hours; });
    if (projectChart) projectChart.destroy();
    const ctxProj = document.getElementById('projectChart');
    if (ctxProj) {
      projectChart = new Chart(ctxProj, {
        type: 'pie',
        data: {
          labels: Object.keys(projMap),
          datasets: [{ data: Object.values(projMap), backgroundColor: ['#2fc7ff','#ffc107','#28a745','#dc3545','#6f42c1','#fd7e14','#17a2b8','#e83e8c'] }]
        },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } } }
      });
    }
    const catMap = {};
    filtered.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.hours; });
    if (categoryChart) categoryChart.destroy();
    const ctxCat = document.getElementById('categoryChart');
    if (ctxCat) {
      categoryChart = new Chart(ctxCat, {
        type: 'pie',
        data: {
          labels: Object.keys(catMap),
          datasets: [{ data: Object.values(catMap), backgroundColor: ['#2fc7ff','#ffc107','#28a745','#dc3545','#6f42c1','#fd7e14'] }]
        },
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
        data: {
          labels: ['Billable', 'Non-billable'],
          datasets: [{ data: [billable, nonBill], backgroundColor: ['#28a745','#dc3545'] }]
        },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } } } }
      });
    }
  }

  // ======================== ENHANCED PDF REPORT (PIE CHARTS + ANTI-TAMPER) ========================
  async function generatePDFReport(startDate, endDate) {
    window.showLoading("Generating PDF report with pie charts...");
    try {
      const filtered = entries.filter(e => e.date >= startDate && e.date <= endDate);
      if (!filtered.length) {
        showToast("No entries in selected range.", "error");
        window.hideLoading();
        return;
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      // ---- HEADER with anti-tamper warning ----
      doc.setFillColor(200, 0, 0); // red
      doc.rect(0, 0, 297, 15, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text("DO NOT EDIT THIS DOCUMENT – UNTAMPERED DATA", 148, 8, { align: 'center' });

      // Main title
      doc.setFillColor(11, 43, 59);
      doc.rect(0, 15, 297, 12, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.text("Timesheet Report", 20, 24);

      // User info and summary
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      const name = document.getElementById('reportName')?.value || userFullName || user.username;
      const totalHours = filtered.reduce((s,e) => s + e.hours, 0);
      const billableHours = filtered.filter(e => e.billable === 'yes').reduce((s,e) => s + e.hours, 0);
      const nonBillable = totalHours - billableHours;
      const overtime = calculateOvertimeForPeriod(filtered);
      doc.text(`Name: ${name}`, 20, 40);
      doc.text(`Period: ${startDate} to ${endDate}`, 20, 47);
      doc.text(`Total Hours: ${totalHours.toFixed(2)} (Billable: ${billableHours.toFixed(2)} | Non-billable: ${nonBillable.toFixed(2)} | Overtime: ${overtime.toFixed(2)})`, 20, 54);

      // ---- PIE CHART 1: Hours per project ----
      const projMap = {};
      filtered.forEach(e => { projMap[e.project] = (projMap[e.project] || 0) + e.hours; });
      const canvas1 = document.createElement('canvas');
      canvas1.width = 400; canvas1.height = 400;
      const ctx1 = canvas1.getContext('2d');
      const pieColors = ['#2fc7ff','#ffc107','#28a745','#dc3545','#6f42c1','#fd7e14','#17a2b8','#e83e8c'];
      const chart1 = new Chart(ctx1, {
        type: 'pie',
        data: {
          labels: Object.keys(projMap),
          datasets: [{ data: Object.values(projMap), backgroundColor: pieColors.slice(0, Object.keys(projMap).length) }]
        },
        options: { responsive: false, plugins: { legend: { position: 'right', labels: { font: { size: 10 } } } } }
      });
      await new Promise(r => setTimeout(r, 300));
      const chartBase64_1 = canvas1.toDataURL('image/png');
      chart1.destroy();
      doc.addImage(chartBase64_1, 'PNG', 20, 62, 80, 70);

      // ---- PIE CHART 2: Hours per category ----
      const catMap = {};
      filtered.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.hours; });
      const canvas2 = document.createElement('canvas');
      canvas2.width = 400; canvas2.height = 400;
      const ctx2 = canvas2.getContext('2d');
      const chart2 = new Chart(ctx2, {
        type: 'pie',
        data: {
          labels: Object.keys(catMap),
          datasets: [{ data: Object.values(catMap), backgroundColor: ['#2fc7ff','#ffc107','#28a745','#dc3545','#6f42c1','#fd7e14','#17a2b8'] }]
        },
        options: { responsive: false, plugins: { legend: { position: 'right', labels: { font: { size: 10 } } } } }
      });
      await new Promise(r => setTimeout(r, 300));
      const chartBase64_2 = canvas2.toDataURL('image/png');
      chart2.destroy();
      doc.addImage(chartBase64_2, 'PNG', 110, 62, 80, 70);

      // ---- PIE CHART 3: Billable vs Non-billable ----
      let billable = 0, nonBill = 0;
      filtered.forEach(e => { if (e.billable === 'yes') billable += e.hours; else nonBill += e.hours; });
      const canvas3 = document.createElement('canvas');
      canvas3.width = 400; canvas3.height = 400;
      const ctx3 = canvas3.getContext('2d');
      const chart3 = new Chart(ctx3, {
        type: 'pie',
        data: {
          labels: ['Billable', 'Non-billable'],
          datasets: [{ data: [billable, nonBill], backgroundColor: ['#28a745', '#dc3545'] }]
        },
        options: { responsive: false, plugins: { legend: { position: 'right', labels: { font: { size: 10 } } } } }
      });
      await new Promise(r => setTimeout(r, 300));
      const chartBase64_3 = canvas3.toDataURL('image/png');
      chart3.destroy();
      doc.addImage(chartBase64_3, 'PNG', 200, 62, 80, 70);

      // ---- TABLE (auto-wrap long text) ----
      const tableData = filtered.map(e => [
        e.date, e.start, e.end, e.hours.toFixed(2),
        e.project, e.category,
        e.billable === 'yes' ? 'Billable' : 'Non-billable',
        e.notes || ''
      ]);
      doc.autoTable({
        startY: 140,
        head: [['Date','Start','End','Hours','Project','Category','Billable','Notes']],
        body: tableData,
        foot: [['','','', totalHours.toFixed(2),'','','','']],
        theme: 'striped',
        headStyles: { fillColor: [11,43,59], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [240,240,240], textColor: 0, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 16 },
          2: { cellWidth: 16 },
          3: { cellWidth: 16 },
          4: { cellWidth: 30 },  // project name
          5: { cellWidth: 25 },
          6: { cellWidth: 20 },
          7: { cellWidth: 50 }   // notes
        },
        margin: { left: 14, right: 14 },
        styles: { overflow: 'linebreak', cellPadding: 2, fontSize: 9 }
      });

      // ---- FOOTER with QR code and integrity statement ----
      const finalY = doc.lastAutoTable.finalY + 10;
      // QR code (GitHub profile)
      const qrContainer = document.createElement('div');
      new QRCode(qrContainer, {
        text: "https://github.com/siyabongathupana/",
        width: 50,
        height: 50,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.L
      });
      await new Promise(r => setTimeout(r, 200));
      const qrCanvas = qrContainer.querySelector('canvas');
      const qrDataURL = qrCanvas.toDataURL('image/png');
      doc.addImage(qrDataURL, 'PNG', 250, finalY, 20, 20);
      doc.setFontSize(8);
      doc.setTextColor(100,100,100);
      doc.text("This document shows untampered, verifiable timesheet data.", 20, finalY + 10);
      doc.text("Scan QR to view GitHub portfolio", 245, finalY + 25, { align: 'right' });
      doc.text("Generated by Your Portfolio System – Controlled Copy", 20, finalY + 20);
      doc.text(`Page ${doc.internal.getNumberOfPages()} of ${doc.internal.getNumberOfPages()}`, 280, finalY + 25, { align: 'right' });

      // Light watermark "FINAL REPORT" across the page
      doc.setFontSize(60);
      doc.setTextColor(200, 200, 200);
      doc.setGState(new doc.GState({ opacity: 0.15 }));
      doc.text("FINAL REPORT", 148, 150, { align: 'center', angle: 45 });
      doc.setGState(new doc.GState({ opacity: 1 }));

      // Save with permissions hint (metadata)
      doc.setProperties({
        title: `Timesheet_${startDate}_to_${endDate}`,
        subject: "Untampered timesheet data",
        author: name,
        keywords: "timesheet, report, controlled",
        creator: "Your Portfolio System"
      });
      doc.save(`timesheet_${startDate}_to_${endDate}.pdf`);
      showToast("PDF generated with pie charts & anti-tamper features.");
    } catch (err) {
      console.error(err);
      showToast("PDF generation failed: " + err.message, "error");
    } finally {
      window.hideLoading();
    }
  }

  // ======================== EXCEL WITH PASSWORD (unchanged, uses bar chart inside Excel) ========================
  async function exportStyledExcel(startDate, endDate) {
    window.showLoading("Generating Excel report (password: Siya)...");
    try {
      const filtered = entries.filter(e => e.date >= startDate && e.date <= endDate);
      if (!filtered.length) {
        showToast("No entries in selected range.", "error");
        window.hideLoading();
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Timesheet");

      worksheet.mergeCells('A1:H1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = `Timesheet Report - ${userFullName || user.username}`;
      titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 30;

      worksheet.mergeCells('A2:H2');
      const periodCell = worksheet.getCell('A2');
      periodCell.value = `Period: ${startDate} to ${endDate} | Generated: ${new Date().toLocaleString()}`;
      periodCell.font = { italic: true, size: 10 };
      periodCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9F0F5' } };
      worksheet.getRow(2).height = 20;

      const totalHours = filtered.reduce((s,e) => s + e.hours, 0);
      const billableHours = filtered.filter(e => e.billable === 'yes').reduce((s,e) => s + e.hours, 0);
      const nonBillable = totalHours - billableHours;
      const overtime = calculateOvertimeForPeriod(filtered);
      worksheet.mergeCells('A3:H3');
      const summaryCell = worksheet.getCell('A3');
      summaryCell.value = `Total Hours: ${totalHours.toFixed(2)} | Billable: ${billableHours.toFixed(2)} | Non-billable: ${nonBillable.toFixed(2)} | Overtime: ${overtime.toFixed(2)}`;
      summaryCell.font = { bold: true, size: 11 };
      summaryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4E8F0' } };
      worksheet.getRow(3).height = 22;

      const headers = ['Date', 'Start', 'End', 'Hours', 'Project', 'Category', 'Billable', 'Notes'];
      const headerRow = worksheet.addRow(headers);
      headerRow.eachCell((cell, colNumber) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2B3B' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });

      filtered.forEach(entry => {
        const row = worksheet.addRow([
          entry.date, entry.start, entry.end, entry.hours,
          entry.project, entry.category,
          entry.billable === 'yes' ? 'Billable' : 'Non-billable',
          entry.notes || ''
        ]);
        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle' };
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        });
        const billableCell = row.getCell(7);
        if (entry.billable === 'yes') {
          billableCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
        } else {
          billableCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
        }
      });

      const totalRow = worksheet.addRow(['', '', '', totalHours.toFixed(2), '', '', '', '']);
      totalRow.getCell(4).font = { bold: true };
      totalRow.eachCell((cell) => {
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });

      worksheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, cell => {
          const cellValue = cell.value ? cell.value.toString() : '';
          maxLength = Math.max(maxLength, cellValue.length);
        });
        column.width = Math.min(maxLength + 2, 40);
      });

      // Add bar chart (hours per project) as image
      const projMap = {};
      filtered.forEach(e => { projMap[e.project] = (projMap[e.project] || 0) + e.hours; });
      const canvas = document.createElement('canvas');
      canvas.width = 600; canvas.height = 300;
      const ctx = canvas.getContext('2d');
      const chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: Object.keys(projMap),
          datasets: [{ label: 'Hours', data: Object.values(projMap), backgroundColor: '#2fc7ff' }]
        },
        options: { responsive: false, plugins: { legend: { position: 'top' } } }
      });
      await new Promise(r => setTimeout(r, 300));
      const chartBase64 = canvas.toDataURL('image/png');
      chart.destroy();

      const chartImage = workbook.addImage({
        base64: chartBase64,
        extension: 'png',
      });
      const startRow = filtered.length + 5;
      worksheet.addImage(chartImage, {
        tl: { col: 0, row: startRow },
        br: { col: 5, row: startRow + 15 },
        editAs: 'oneCell'
      });

      const buffer = await workbook.xlsx.writeBuffer({ password: 'Siya' });
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `timesheet_${startDate}_to_${endDate}.xlsx`);
      showToast("Excel report saved with password: Siya");
    } catch (err) {
      console.error(err);
      showToast("Excel generation failed: " + err.message, "error");
    } finally {
      window.hideLoading();
    }
  }

  async function exportExcelRange(startDate, endDate) {
    await exportStyledExcel(startDate, endDate);
  }

  function exportToExcel() {
    const end = new Date();
    const start = new Date(); start.setDate(start.getDate() - 30);
    document.getElementById('reportStartDate').value = formatDate(start);
    document.getElementById('reportEndDate').value = formatDate(end);
    document.getElementById('reportType').value = 'excel';
    $('#reportModal').modal('show');
  }

  // ======================== USER META & NOTIFICATIONS ========================
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
    userFullName = fullName;
  }

  async function loadNotificationPreference() {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${PREFS_FILE}`;
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
    const path = `${dataPath}/users/${encUser}/${PREFS_FILE}`;
    let sha = null;
    try {
      const existing = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (existing) sha = existing.sha;
    } catch(e) {}
    const prefs = { notifications: enabled };
    await GitHubAPI.updateFile(owner, repo, path, prefs, "Update notification preference", branch, user.pat, sha);
    notificationsEnabled = enabled;
  }

  // ======================== REFRESH & AUTO REFRESH ========================
  async function refreshView() {
    window.showLoading("Refreshing timesheet...");
    try {
      await loadTimesheet();
      await loadProjectsFromPortfolio();
      renderHistory();
      updateSummaryAndProgress();
      updateCharts();
    } catch (err) {
      console.error(err);
      showToast("Refresh failed: " + err.message, "error");
    } finally {
      window.hideLoading();
    }
  }

  function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(async () => {
      if (!document.hidden) await refreshView();
    }, 60000);
  }

  // ======================== INITIALISATION ========================
  async function init() {
    const dateInput = document.getElementById('logDate');
    if (dateInput) dateInput.value = formatDate(new Date());

    document.getElementById('startTime')?.addEventListener('change', updateHoursAuto);
    document.getElementById('endTime')?.addEventListener('change', updateHoursAuto);
    document.getElementById('nowStartBtn').onclick = () => {
      document.getElementById('startTime').value = new Date().toTimeString().slice(0,5);
      updateHoursAuto();
    };
    document.getElementById('nowEndBtn').onclick = () => {
      document.getElementById('endTime').value = new Date().toTimeString().slice(0,5);
      updateHoursAuto();
    };
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
        await saveUserMeta(newName);
        document.getElementById('reportName').value = newName;
        showToast("Name saved successfully.");
        await window.Logger.log('save_name', `Updated full name to ${newName}`);
      } catch (err) {
        showToast("Failed to save name: " + err.message, "error");
      } finally {
        window.hideLoading();
      }
    };

    document.getElementById('addProjectBtn').onclick = () => {
      document.getElementById('newProjectName').value = '';
      $('#newProjectModal').modal('show');
    };
    document.getElementById('confirmNewProjectBtn').onclick = async () => {
      const newProj = document.getElementById('newProjectName')?.value.trim();
      if (!newProj) { showToast("Enter project name.", "error"); return; }
      window.showLoading(`Creating project "${newProj}"...`);
      try {
        const success = await createPortfolioProject(newProj);
        if (success) {
          await loadProjectsFromPortfolio();
          const taskSelect = document.getElementById('taskProject');
          if (taskSelect && projectList.includes(newProj)) taskSelect.value = newProj;
          showToast(`Project "${newProj}" created.`);
        } else {
          showToast("Project already exists.", "error");
        }
      } catch (err) {
        showToast("Failed to create project: " + err.message, "error");
      } finally {
        window.hideLoading();
        $('#newProjectModal').modal('hide');
      }
    };

    document.getElementById('generateReportBtn').onclick = () => {
      document.getElementById('reportName').value = userFullName;
      const end = new Date();
      const start = new Date(); start.setDate(start.getDate() - 30);
      document.getElementById('reportStartDate').value = formatDate(start);
      document.getElementById('reportEndDate').value = formatDate(end);
      $('#reportModal').modal('show');
    };
    document.getElementById('generateReportConfirmBtn').onclick = () => {
      const start = document.getElementById('reportStartDate')?.value;
      const end = document.getElementById('reportEndDate')?.value;
      if (!start || !end) { showToast("Select both start and end dates.", "error"); return; }
      const type = document.getElementById('reportType')?.value;
      $('#reportModal').modal('hide');
      if (type === 'pdf') generatePDFReport(start, end);
      else exportExcelRange(start, end);
    };
    document.getElementById('saveEditBtn').onclick = saveEdit;

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
    await refreshView();
    startAutoRefresh();
  }

  init().catch(err => console.error("Timesheet init error", err));
})();
