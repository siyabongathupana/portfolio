// timesheet.js – Professional timesheet with charts, filters, totals, print, CSV
(function() {
  const user = window.SessionManager?.getCurrentUser();
  if (!user) {
    alert("Please log in to access the timesheet.");
    window.location.href = "login.html";
    return;
  }

  const TIMESHEET_FILE = "timesheet.json";
  let entries = [];
  let categoryChart = null;
  let billableChart = null;

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

  // Load / Save
  async function loadTimesheet() {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${TIMESHEET_FILE}`;
    try {
      const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      entries = file?.content ? JSON.parse(file.content) : [];
    } catch(e) {
      if (!e.message.includes('404')) console.error(e);
      entries = [];
    }
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

  // Add / Delete
  async function addEntry() {
    const date = document.getElementById('logDate').value;
    const start = document.getElementById('startTime').value;
    const end = document.getElementById('endTime').value;
    const category = document.getElementById('taskCategory').value;
    const billable = document.getElementById('billable').value;
    const notes = document.getElementById('taskNotes').value.trim();
    if (!date || !start || !end) { alert("Fill date, start and end."); return; }
    const hours = calcHours(start, end);
    if (hours <= 0) { alert("End time must be after start."); return; }
    entries.unshift({
      id: Date.now(), date, start, end, hours, category, billable, notes
    });
    await saveTimesheet();
    refreshView();
    document.getElementById('startTime').value = '';
    document.getElementById('endTime').value = '';
    document.getElementById('taskNotes').value = '';
    document.getElementById('hoursAuto').value = '';
    document.getElementById('taskCategory').value = 'Development';
    document.getElementById('billable').value = 'yes';
    updateDailyProgress();
  }
  async function deleteEntry(id) {
    if (confirm("Delete entry?")) {
      entries = entries.filter(e => e.id != id);
      await saveTimesheet();
      refreshView();
    }
  }

  // Filter logic
  function getFilteredEntries() {
    const range = document.getElementById('filterRange').value;
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
      // month
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    if (category !== 'all') filtered = filtered.filter(e => e.category === category);
    return filtered;
  }

  // Render table with totals
  function renderHistory() {
    const filtered = getFilteredEntries();
    const tbody = document.getElementById('historyBody');
    const tfoot = document.getElementById('historyFoot');
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center">No entries found.</td></tr>';
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
      row.insertCell(4).innerText = entry.category;
      row.insertCell(5).innerText = entry.billable === 'yes' ? 'Billable' : 'Non-billable';
      row.insertCell(6).innerText = entry.notes || '-';
      const actionCell = row.insertCell(7);
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

  // Update charts (smaller)
  function updateCharts() {
    const filtered = getFilteredEntries();
    // Category breakdown
    const catMap = {};
    filtered.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.hours; });
    if (categoryChart) categoryChart.destroy();
    const ctxCat = document.getElementById('categoryChart').getContext('2d');
    categoryChart = new Chart(ctxCat, {
      type: 'pie',
      data: {
        labels: Object.keys(catMap),
        datasets: [{ data: Object.values(catMap), backgroundColor: ['#2fc7ff','#ffc107','#28a745','#dc3545','#6f42c1','#fd7e14'] }]
      },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } }
    });
    // Billable
    let billable = 0, nonBill = 0;
    filtered.forEach(e => { if (e.billable === 'yes') billable += e.hours; else nonBill += e.hours; });
    if (billableChart) billableChart.destroy();
    const ctxBill = document.getElementById('billableChart').getContext('2d');
    billableChart = new Chart(ctxBill, {
      type: 'pie',
      data: { labels: ['Billable', 'Non-billable'], datasets: [{ data: [billable, nonBill], backgroundColor: ['#28a745','#dc3545'] }] },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } }
    });
  }

  // CSV Export
  function exportCSV() {
    const filtered = getFilteredEntries();
    if (filtered.length === 0) { alert("No data to export."); return; }
    const headers = ["Date","Start","End","Hours","Category","Billable","Notes"];
    const rows = filtered.map(e => [e.date, e.start, e.end, e.hours, e.category, e.billable === 'yes' ? 'Billable' : 'Non-billable', e.notes]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `timesheet_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // Print (browser print, CSS handles hiding)
  function printTimesheet() { window.print(); }

  // Refresh everything
  async function refreshView() {
    await loadTimesheet();
    renderHistory();
    updateDailyProgress();
    updateCharts();
  }

  // Initialise form
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
    document.getElementById('exportCsvBtn').onclick = exportCSV;
    document.getElementById('printBtn').onclick = printTimesheet;
    document.getElementById('filterRange').onchange = () => { renderHistory(); updateCharts(); };
    document.getElementById('filterCategory').onchange = () => { renderHistory(); updateCharts(); };
  }

  initForm();
  refreshView().catch(err => console.error(err));
})();
