// timesheet.js – full timesheet logic, Chart.js, filters, CSV export, print

(function() {
  // Authentication check
  const user = window.SessionManager?.getCurrentUser();
  if (!user) {
    alert("Please log in to access the timesheet.");
    window.location.href = "login.html";
    return;
  }

  // Data storage key on GitHub
  const TIMESHEET_FILE = "timesheet.json";
  let entries = [];      // array of { date, start, end, hours, category, billable, notes, id }
  let categoryChart = null;
  let billableChart = null;

  // Helper to get start of day (local date)
  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0,0,0,0);
    return d;
  }

  function endOfDay(date) {
    const d = new Date(date);
    d.setHours(23,59,59,999);
    return d;
  }

  // Format date to YYYY-MM-DD
  function formatDate(date) {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  }

  // Calculate hours between two time strings (HH:MM)
  function calcHours(start, end) {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let totalMinutes = (eh * 60 + em) - (sh * 60 + sm);
    if (totalMinutes < 0) totalMinutes += 24 * 60;
    return +(totalMinutes / 60).toFixed(2);
  }

  // Auto-fill hours when start/end change
  function updateHoursAuto() {
    const start = document.getElementById('startTime').value;
    const end = document.getElementById('endTime').value;
    const hours = calcHours(start, end);
    document.getElementById('hoursAuto').value = hours.toFixed(2);
  }

  // Load timesheet data from GitHub
  async function loadTimesheet() {
    const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
    const encUser = encodeURIComponent(user.username);
    const path = `${dataPath}/users/${encUser}/${TIMESHEET_FILE}`;
    try {
      const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
      if (file && file.content) {
        entries = JSON.parse(file.content);
      } else {
        entries = [];
      }
    } catch (e) {
      if (e.message.includes('404')) entries = [];
      else throw e;
    }
    // sort by date descending
    entries.sort((a,b) => new Date(b.date) - new Date(a.date));
  }

  // Save timesheet data to GitHub
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

  // Add new entry
  async function addEntry() {
    const date = document.getElementById('logDate').value;
    const start = document.getElementById('startTime').value;
    const end = document.getElementById('endTime').value;
    const category = document.getElementById('taskCategory').value;
    const billable = document.getElementById('billable').value;
    const notes = document.getElementById('taskNotes').value.trim();
    if (!date || !start || !end) {
      alert("Please fill date, start and end time.");
      return;
    }
    const hours = calcHours(start, end);
    if (hours <= 0) {
      alert("End time must be after start time.");
      return;
    }
    const newEntry = {
      id: Date.now(),
      date: date,
      start: start,
      end: end,
      hours: hours,
      category: category,
      billable: billable,
      notes: notes
    };
    entries.unshift(newEntry);
    await saveTimesheet();
    refreshView();
    // reset form, keep date as today
    document.getElementById('startTime').value = '';
    document.getElementById('endTime').value = '';
    document.getElementById('taskNotes').value = '';
    document.getElementById('hoursAuto').value = '';
    document.getElementById('taskCategory').value = 'Development';
    document.getElementById('billable').value = 'yes';
    updateDailyProgress();
  }

  // Delete entry
  async function deleteEntry(id) {
    if (confirm("Delete this entry?")) {
      entries = entries.filter(e => e.id != id);
      await saveTimesheet();
      refreshView();
    }
  }

  // Filter entries based on range and category
  function getFilteredEntries() {
    const range = document.getElementById('filterRange').value;
    const category = document.getElementById('filterCategory').value;
    const now = new Date();
    let filtered = [...entries];
    // date filter
    filtered = filtered.filter(entry => {
      const entryDate = new Date(entry.date);
      if (range === 'day') {
        return entryDate.toDateString() === now.toDateString();
      } else if (range === 'week') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0,0,0,0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23,59,59,999);
        return entryDate >= startOfWeek && entryDate <= endOfWeek;
      } else { // month
        return entryDate.getMonth() === now.getMonth() && entryDate.getFullYear() === now.getFullYear();
      }
    });
    if (category !== 'all') {
      filtered = filtered.filter(e => e.category === category);
    }
    return filtered;
  }

  // Render history table
  function renderHistory() {
    const filtered = getFilteredEntries();
    const tbody = document.getElementById('historyBody');
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center">No entries found.</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    filtered.forEach(entry => {
      const row = tbody.insertRow();
      row.insertCell(0).innerText = entry.date;
      row.insertCell(1).innerText = entry.start;
      row.insertCell(2).innerText = entry.end;
      row.insertCell(3).innerText = entry.hours.toFixed(2);
      row.insertCell(4).innerText = entry.category;
      row.insertCell(5).innerText = entry.billable === 'yes' ? 'Billable' : 'Non-billable';
      row.insertCell(6).innerText = entry.notes || '-';
      const actions = row.insertCell(7);
      actions.className = 'print-hide';
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.innerHTML = '<i class="fa fa-trash"></i>';
      delBtn.onclick = () => deleteEntry(entry.id);
      actions.appendChild(delBtn);
    });
  }

  // Update daily progress bar for today
  function updateDailyProgress() {
    const today = formatDate(new Date());
    const todayEntries = entries.filter(e => e.date === today);
    const totalHours = todayEntries.reduce((sum, e) => sum + e.hours, 0);
    const percent = Math.min(100, (totalHours / 8) * 100);
    const fill = document.getElementById('dailyProgressFill');
    fill.style.width = percent + '%';
    fill.innerText = totalHours.toFixed(1) + 'h';
    if (totalHours >= 8) fill.style.background = '#28a745';
    else fill.style.background = '#2fc7ff';
  }

  // Update pie charts
  async function updateCharts() {
    const filtered = getFilteredEntries();
    // Category breakdown
    const categoryMap = {};
    filtered.forEach(e => { categoryMap[e.category] = (categoryMap[e.category] || 0) + e.hours; });
    const catLabels = Object.keys(categoryMap);
    const catData = Object.values(categoryMap);
    if (categoryChart) categoryChart.destroy();
    const ctxCat = document.getElementById('categoryChart').getContext('2d');
    categoryChart = new Chart(ctxCat, {
      type: 'pie',
      data: { labels: catLabels, datasets: [{ data: catData, backgroundColor: ['#2fc7ff','#ffc107','#28a745','#dc3545','#6f42c1','#fd7e14'] }] },
      options: { responsive: true, maintainAspectRatio: true }
    });
    // Billable breakdown
    let billableHours = 0, nonBillable = 0;
    filtered.forEach(e => {
      if (e.billable === 'yes') billableHours += e.hours;
      else nonBillable += e.hours;
    });
    if (billableChart) billableChart.destroy();
    const ctxBill = document.getElementById('billableChart').getContext('2d');
    billableChart = new Chart(ctxBill, {
      type: 'pie',
      data: { labels: ['Billable', 'Non-billable'], datasets: [{ data: [billableHours, nonBillable], backgroundColor: ['#28a745','#dc3545'] }] },
      options: { responsive: true }
    });
  }

  // CSV Export
  function exportToCSV() {
    const filtered = getFilteredEntries();
    if (filtered.length === 0) { alert("No data to export."); return; }
    const headers = ["Date","Start","End","Hours","Category","Billable","Notes"];
    const rows = filtered.map(e => [e.date, e.start, e.end, e.hours, e.category, e.billable === 'yes' ? 'Billable' : 'Non-billable', e.notes]);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `timesheet_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Print with print CSS
  function printTimesheet() {
    window.print();
  }

  // Refresh everything
  async function refreshView() {
    await loadTimesheet();
    renderHistory();
    updateDailyProgress();
    updateCharts();
  }

  // Set default date to today, and add event listeners
  function initForm() {
    const today = formatDate(new Date());
    document.getElementById('logDate').value = today;
    document.getElementById('startTime').addEventListener('change', updateHoursAuto);
    document.getElementById('endTime').addEventListener('change', updateHoursAuto);
    document.getElementById('nowStartBtn').addEventListener('click', () => {
      const now = new Date();
      const time = now.toTimeString().slice(0,5);
      document.getElementById('startTime').value = time;
      updateHoursAuto();
    });
    document.getElementById('nowEndBtn').addEventListener('click', () => {
      const now = new Date();
      const time = now.toTimeString().slice(0,5);
      document.getElementById('endTime').value = time;
      updateHoursAuto();
    });
    document.getElementById('addEntryBtn').addEventListener('click', addEntry);
    document.getElementById('refreshHistoryBtn').addEventListener('click', () => refreshView());
    document.getElementById('exportCsvBtn').addEventListener('click', exportToCSV);
    document.getElementById('printBtn').addEventListener('click', printTimesheet);
    document.getElementById('filterRange').addEventListener('change', () => { renderHistory(); updateCharts(); });
    document.getElementById('filterCategory').addEventListener('change', () => { renderHistory(); updateCharts(); });
  }

  // Initial load
  initForm();
  refreshView().catch(err => {
    console.error(err);
    alert("Could not load timesheet data. Check your connection or token.");
  });
})();
