// analytics.js - Complete analytics dashboard

let projectsChart = null;
let statusChart = null;
let timelineChart = null;
let hoursCategoryChart = null;
let deviceChart = null;
let browserChart = null;
let loginTrendsChart = null;

let analyticsData = {
  projects: [],
  certificates: [],
  timesheetEntries: [],
  sessions: [],
  users: []
};

let currentDateRange = 30;

document.addEventListener('DOMContentLoaded', async () => {
  const user = window.SessionManager?.getCurrentUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  
  window.updateUserFooter();
  
  const isAdmin = window.APP_CONFIG.adminUsers && window.APP_CONFIG.adminUsers.includes(user.username);
  
  if (!isAdmin) {
    document.getElementById('analyticsContent').innerHTML = `
      <div class="access-denied">
        <i class="fa fa-lock"></i>
        <h3>Access Denied</h3>
        <p>You don't have permission to view analytics.</p>
        <a href="admin.html" class="btn btn-delta mt-3">Go to Dashboard</a>
      </div>
    `;
    return;
  }
  
  await loadAllUsersData();
  setupEventListeners();
});

function setupEventListeners() {
  const dateRangeSelect = document.getElementById('dateRangeSelect');
  if (dateRangeSelect) {
    dateRangeSelect.addEventListener('change', (e) => {
      currentDateRange = e.target.value === 'all' ? 'all' : parseInt(e.target.value);
      refreshAnalytics();
    });
  }
  
  const refreshBtn = document.getElementById('refreshAnalyticsBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => loadAllUsersData());
  
  const exportBtn = document.getElementById('exportReportBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportAnalyticsReport);
}

async function loadAllUsersData() {
  window.showLoading('Loading analytics data from all users...');
  
  try {
    const user = window.SessionManager.getCurrentUser();
    const adminToken = user.pat;
    
    const allUsers = await window.AccountManager.listUsers(adminToken);
    analyticsData.users = allUsers;
    
    let allProjects = [];
    let allCertificates = [];
    let allTimesheetEntries = [];
    let allSessions = [];
    
    for (const username of allUsers) {
      try {
        const projects = await fetchUserProjects(username, adminToken);
        if (projects && typeof projects === 'object') {
          allProjects = allProjects.concat(Object.values(projects));
        }
        
        const certificates = await fetchUserCertificates(username, adminToken);
        if (certificates && Array.isArray(certificates)) {
          allCertificates = allCertificates.concat(certificates);
        }
        
        const timesheet = await fetchUserTimesheet(username, adminToken);
        if (timesheet && Array.isArray(timesheet)) {
          allTimesheetEntries = allTimesheetEntries.concat(timesheet);
        }
        
        const sessions = await window.AccountManager.getUserSessions(username, adminToken);
        if (sessions && Array.isArray(sessions)) {
          allSessions = allSessions.concat(sessions.map(s => ({ ...s, username: username })));
        }
      } catch (err) {
        console.warn(`Failed to fetch data for user ${username}:`, err);
      }
    }
    
    analyticsData.projects = allProjects;
    analyticsData.certificates = allCertificates;
    analyticsData.timesheetEntries = allTimesheetEntries;
    analyticsData.sessions = allSessions;
    
    renderAnalyticsDashboard();
    refreshAnalytics();
    
  } catch (error) {
    console.error('Error loading analytics data:', error);
    showToast('Failed to load analytics data: ' + error.message, 'error');
  } finally {
    window.hideLoading();
  }
}

async function fetchUserProjects(username, adminToken) {
  const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
  const encUser = encodeURIComponent(username);
  const path = `${dataPath}/users/${encUser}/projects.json`;
  
  try {
    const file = await GitHubAPI.getFileContent(owner, repo, path, branch, adminToken);
    if (file && file.content) {
      return JSON.parse(file.content);
    }
  } catch (e) {}
  return {};
}

async function fetchUserCertificates(username, adminToken) {
  const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
  const encUser = encodeURIComponent(username);
  const path = `${dataPath}/users/${encUser}/certificates.json`;
  
  try {
    const file = await GitHubAPI.getFileContent(owner, repo, path, branch, adminToken);
    if (file && file.content) {
      return JSON.parse(file.content);
    }
  } catch (e) {}
  return [];
}

async function fetchUserTimesheet(username, adminToken) {
  const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
  const encUser = encodeURIComponent(username);
  const path = `${dataPath}/users/${encUser}/timesheet.json`;
  
  try {
    const file = await GitHubAPI.getFileContent(owner, repo, path, branch, adminToken);
    if (file && file.content) {
      return JSON.parse(file.content);
    }
  } catch (e) {}
  return [];
}

function renderAnalyticsDashboard() {
  const container = document.getElementById('analyticsContent');
  if (!container) return;
  
  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center flex-wrap mb-4">
      <h2><i class="fa fa-line-chart"></i> Analytics Dashboard</h2>
      <div>
        <button id="exportReportBtn" class="btn-export"><i class="fa fa-file-pdf-o"></i> Export Report</button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="date-range-picker">
        <label>Date Range:</label>
        <select id="dateRangeSelect" class="form-control form-control-sm" style="width: auto;">
          <option value="7">Last 7 days</option>
          <option value="30" selected>Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last year</option>
          <option value="all">All time</option>
        </select>
      </div>
      <div>
        <button id="refreshAnalyticsBtn" class="btn btn-sm btn-outline-info"><i class="fa fa-refresh"></i> Refresh</button>
      </div>
    </div>

    <div class="row">
      <div class="col-md-3 col-sm-6">
        <div class="stat-card">
          <div class="stat-number" id="totalProjects">0</div>
          <div class="stat-label">Total Projects</div>
        </div>
      </div>
      <div class="col-md-3 col-sm-6">
        <div class="stat-card">
          <div class="stat-number" id="totalCertificates">0</div>
          <div class="stat-label">Certificates</div>
        </div>
      </div>
      <div class="col-md-3 col-sm-6">
        <div class="stat-card">
          <div class="stat-number" id="totalHours">0</div>
          <div class="stat-label">Hours Logged</div>
        </div>
      </div>
      <div class="col-md-3 col-sm-6">
        <div class="stat-card">
          <div class="stat-number" id="totalUsers">0</div>
          <div class="stat-label">Active Users</div>
        </div>
      </div>
    </div>

    <div class="row">
      <div class="col-md-6">
        <div class="chart-card">
          <h5><i class="fa fa-pie-chart"></i> Projects by Type</h5>
          <canvas id="projectsByTypeChart" height="250"></canvas>
        </div>
      </div>
      <div class="col-md-6">
        <div class="chart-card">
          <h5><i class="fa fa-pie-chart"></i> Projects by Status</h5>
          <canvas id="projectsByStatusChart" height="250"></canvas>
        </div>
      </div>
    </div>

    <div class="row">
      <div class="col-md-6">
        <div class="chart-card">
          <h5><i class="fa fa-bar-chart"></i> Projects Created Over Time</h5>
          <canvas id="projectsTimelineChart" height="250"></canvas>
        </div>
      </div>
      <div class="col-md-6">
        <div class="chart-card">
          <h5><i class="fa fa-bar-chart"></i> Hours Logged by Category</h5>
          <canvas id="hoursByCategoryChart" height="250"></canvas>
        </div>
      </div>
    </div>

    <div class="row">
      <div class="col-md-12">
        <div class="insight-box">
          <h6><i class="fa fa-lightbulb-o"></i> Key Insights</h6>
          <p id="insightsText">Loading analytics data...</p>
        </div>
      </div>
    </div>

    <div class="chart-card">
      <h5><i class="fa fa-trophy"></i> Top Projects by Hours</h5>
      <div class="table-responsive">
        <table class="table table-hover">
          <thead><tr><th>Project Name</th><th>Owner</th><th>Type</th><th>Status</th><th>Hours</th><th>Images</th></tr></thead>
          <tbody id="topProjectsTable"></tbody>
        </table>
      </div>
    </div>

    <!-- User Analytics Section -->
    <div class="chart-card">
      <h5><i class="fa fa-users"></i> User Analytics</h5>
      <div class="row">
        <div class="col-md-3 col-sm-6">
          <div class="stat-card" style="padding: 15px;">
            <div class="stat-number" id="totalSessions">0</div>
            <div class="stat-label">Total Sessions</div>
          </div>
        </div>
        <div class="col-md-3 col-sm-6">
          <div class="stat-card" style="padding: 15px;">
            <div class="stat-number" id="uniqueLocations">0</div>
            <div class="stat-label">Locations</div>
          </div>
        </div>
        <div class="col-md-3 col-sm-6">
          <div class="stat-card" style="padding: 15px;">
            <div class="stat-number" id="topCountry">0</div>
            <div class="stat-label">Top Country</div>
          </div>
        </div>
        <div class="col-md-3 col-sm-6">
          <div class="stat-card" style="padding: 15px;">
            <div class="stat-number" id="totalDevices">0</div>
            <div class="stat-label">Devices</div>
          </div>
        </div>
      </div>
    </div>

    <div class="row">
      <div class="col-md-4">
        <div class="chart-card">
          <h5><i class="fa fa-laptop"></i> Devices</h5>
          <canvas id="userDevicesChart" height="200"></canvas>
        </div>
      </div>
      <div class="col-md-4">
        <div class="chart-card">
          <h5><i class="fa fa-globe"></i> Browsers</h5>
          <canvas id="userBrowsersChart" height="200"></canvas>
        </div>
      </div>
      <div class="col-md-4">
        <div class="chart-card">
          <h5><i class="fa fa-windows"></i> Operating Systems</h5>
          <canvas id="userOSChart" height="200"></canvas>
        </div>
      </div>
    </div>

    <div class="chart-card">
      <h5><i class="fa fa-line-chart"></i> Login Trends (Last 30 Days)</h5>
      <canvas id="loginTrendsChart" height="250"></canvas>
    </div>

    <div class="chart-card">
      <h5><i class="fa fa-map-marker"></i> User Locations</h5>
      <div id="locationList" style="max-height: 300px; overflow-y: auto;">
        <div class="text-center text-muted py-4">Loading location data...</div>
      </div>
    </div>

    <div class="chart-card">
      <h5><i class="fa fa-history"></i> Recent Logins</h5>
      <div class="table-responsive">
        <table class="table table-hover">
          <thead><tr><th>User</th><th>Date & Time</th><th>IP Address</th><th>Location</th><th>Device</th><th>OS</th></tr></thead>
          <tbody id="recentLoginsTable"></tbody>
        </table>
      </div>
    </div>
  `;
  
  setupEventListeners();
}

function refreshAnalytics() {
  updateStats();
  updateCharts();
  updateInsights();
  updateTopProjectsTable();
  updateUserAnalytics();
  updateLocationList();
  updateRecentLogins();
}

function updateStats() {
  const filteredProjects = filterByDateRange(analyticsData.projects, 'updatedAt');
  const totalHours = analyticsData.timesheetEntries.reduce((sum, e) => sum + (e.hours || 0), 0);
  
  document.getElementById('totalProjects').textContent = filteredProjects.length;
  document.getElementById('totalCertificates').textContent = analyticsData.certificates.length;
  document.getElementById('totalHours').textContent = totalHours.toFixed(1);
  document.getElementById('totalUsers').textContent = analyticsData.users.length;
  
  window.analyticsStats = {
    totalProjects: filteredProjects.length,
    completedProjects: filteredProjects.filter(p => p.status === 'Completed').length,
    ongoingProjects: filteredProjects.filter(p => p.status === 'Ongoing').length,
    deltaVProjects: filteredProjects.filter(p => p.projectCategory === 'deltaV' || p.controllerType).length,
    totalHours: totalHours,
    totalImages: filteredProjects.reduce((sum, p) => sum + (p.selectedImages?.length || 0), 0)
  };
}

function filterByDateRange(items, dateField) {
  if (currentDateRange === 'all') return items;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - currentDateRange);
  return items.filter(item => {
    let itemDate;
    if (dateField === 'date' && item.date) itemDate = new Date(item.date);
    else if (item.updatedAt) itemDate = new Date(item.updatedAt);
    else return true;
    return itemDate >= cutoffDate;
  });
}

function updateCharts() {
  const filteredProjects = filterByDateRange(analyticsData.projects, 'updatedAt');
  const stats = window.analyticsStats;
  
  if (projectsChart) projectsChart.destroy();
  const ctxType = document.getElementById('projectsByTypeChart')?.getContext('2d');
  if (ctxType) {
    projectsChart = new Chart(ctxType, {
      type: 'pie',
      data: { labels: ['DeltaV Projects', 'Non-DeltaV Projects'], datasets: [{ data: [stats.deltaVProjects, stats.totalProjects - stats.deltaVProjects], backgroundColor: ['#2fc7ff', '#ffc107'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } }
    });
  }
  
  if (statusChart) statusChart.destroy();
  const ctxStatus = document.getElementById('projectsByStatusChart')?.getContext('2d');
  if (ctxStatus) {
    statusChart = new Chart(ctxStatus, {
      type: 'doughnut',
      data: { labels: ['Completed', 'Ongoing', 'Other'], datasets: [{ data: [stats.completedProjects, stats.ongoingProjects, stats.totalProjects - stats.completedProjects - stats.ongoingProjects], backgroundColor: ['#28a745', '#2fc7ff', '#6c757d'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } }
    });
  }
  
  const categoryHours = {};
  const filteredEntries = filterByDateRange(analyticsData.timesheetEntries, 'date');
  for (const entry of filteredEntries) {
    const category = entry.category || 'Other';
    categoryHours[category] = (categoryHours[category] || 0) + (entry.hours || 0);
  }
  if (hoursCategoryChart) hoursCategoryChart.destroy();
  const ctxHours = document.getElementById('hoursByCategoryChart')?.getContext('2d');
  if (ctxHours) {
    hoursCategoryChart = new Chart(ctxHours, {
      type: 'bar',
      data: { labels: Object.keys(categoryHours), datasets: [{ label: 'Hours Logged', data: Object.values(categoryHours), backgroundColor: '#2fc7ff', borderRadius: 8 }] },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Hours' } } } }
    });
  }
  
  // Timeline chart
  const timelineData = getProjectsTimelineData(filteredProjects);
  if (timelineChart) timelineChart.destroy();
  const ctxTimeline = document.getElementById('projectsTimelineChart')?.getContext('2d');
  if (ctxTimeline) {
    timelineChart = new Chart(ctxTimeline, {
      type: 'line',
      data: { labels: timelineData.labels, datasets: [{ label: 'Projects Created', data: timelineData.values, borderColor: '#2fc7ff', backgroundColor: 'rgba(47,199,255,0.1)', fill: true, tension: 0.3 }] },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } } }
    });
  }
}

function getProjectsTimelineData(projects) {
  const months = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    months[key] = 0;
  }
  for (const project of projects) {
    const dateValue = project.updatedAt || project.createdAt;
    if (dateValue) {
      const date = new Date(dateValue);
      const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
      if (months[key] !== undefined) months[key]++;
    }
  }
  return { labels: Object.keys(months).map(key => { const [y,m] = key.split('-'); return new Date(parseInt(y), parseInt(m)-1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }), values: Object.values(months) };
}

function updateInsights() {
  const stats = window.analyticsStats;
  if (!stats) return;
  const completionRate = stats.totalProjects > 0 ? ((stats.completedProjects / stats.totalProjects) * 100).toFixed(1) : 0;
  const avgHoursPerProject = stats.totalProjects > 0 ? (stats.totalHours / stats.totalProjects).toFixed(1) : 0;
  const insights = [
    `Project completion rate: <strong>${completionRate}%</strong> (${stats.completedProjects} of ${stats.totalProjects} projects completed).`,
    `DeltaV projects make up <strong>${((stats.deltaVProjects / stats.totalProjects) * 100).toFixed(1)}%</strong> of the portfolio.`,
    `Total hours logged: <strong>${stats.totalHours.toFixed(1)} hours</strong> (avg ${avgHoursPerProject} hours per project).`,
    `Total certificates earned: <strong>${analyticsData.certificates.length}</strong> across all users.`,
    `Total project images: <strong>${stats.totalImages}</strong> across all projects.`,
    `Active users: <strong>${analyticsData.users.length}</strong> registered users.`
  ];
  document.getElementById('insightsText').innerHTML = insights.join(' ');
}

function updateTopProjectsTable() {
  const projectHours = {};
  for (const entry of analyticsData.timesheetEntries) {
    const projectName = entry.project || 'Uncategorized';
    projectHours[projectName] = (projectHours[projectName] || 0) + (entry.hours || 0);
  }
  
  const sortedProjects = Object.entries(projectHours).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const projectMap = {};
  for (const project of analyticsData.projects) {
    projectMap[project.title] = project;
  }
  
  const tbody = document.getElementById('topProjectsTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (sortedProjects.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="text-center">No timesheet data available</td></tr>'; return; }
  
  for (const [projectName, hours] of sortedProjects) {
    const project = projectMap[projectName] || {};
    const projectType = (project.projectCategory === 'deltaV' || project.controllerType) ? 'DeltaV' : 'General';
    const status = project.status || 'N/A';
    const imageCount = project.selectedImages?.length || 0;
    const row = tbody.insertRow();
    row.insertCell(0).innerHTML = `<strong>${window.escapeHtml(projectName)}</strong>`;
    row.insertCell(1).innerHTML = `<span class="badge badge-secondary">${project.owner || 'Unknown'}</span>`;
    row.insertCell(2).innerHTML = `<span class="badge badge-info">${projectType}</span>`;
    row.insertCell(3).innerHTML = `<span class="badge ${status === 'Completed' ? 'badge-success' : (status === 'Ongoing' ? 'badge-primary' : 'badge-secondary')}">${status}</span>`;
    row.insertCell(4).innerHTML = `<strong>${hours.toFixed(1)} hrs</strong>`;
    row.insertCell(5).innerHTML = `${imageCount} images`;
  }
}

function updateUserAnalytics() {
  const sessions = analyticsData.sessions;
  const totalSessions = sessions.length;
  
  let deviceStats = { Desktop: 0, Mobile: 0, Tablet: 0 };
  let browserStats = {};
  let osStats = {};
  let countryStats = {};
  let uniqueLocations = new Set();
  
  for (const session of sessions) {
    if (session.location && session.location.country) {
      uniqueLocations.add(`${session.location.city || 'Unknown'}, ${session.location.country}`);
      countryStats[session.location.country] = (countryStats[session.location.country] || 0) + 1;
    }
    if (session.device) {
      deviceStats[session.device.deviceType || 'Desktop'] = (deviceStats[session.device.deviceType || 'Desktop'] || 0) + 1;
      if (session.device.browser && session.device.browser !== 'Unknown') browserStats[session.device.browser] = (browserStats[session.device.browser] || 0) + 1;
      if (session.device.os && session.device.os !== 'Unknown') osStats[session.device.os] = (osStats[session.device.os] || 0) + 1;
    }
  }
  
  document.getElementById('totalSessions').textContent = totalSessions;
  document.getElementById('uniqueLocations').textContent = uniqueLocations.size;
  const topCountry = Object.entries(countryStats).sort((a, b) => b[1] - a[1])[0];
  document.getElementById('topCountry').textContent = topCountry ? topCountry[0] : 'N/A';
  document.getElementById('totalDevices').textContent = Object.keys(deviceStats).length;
  
  // Device chart
  if (deviceChart) deviceChart.destroy();
  const ctxDevices = document.getElementById('userDevicesChart')?.getContext('2d');
  if (ctxDevices && Object.keys(deviceStats).length > 0) {
    deviceChart = new Chart(ctxDevices, {
      type: 'pie',
      data: { labels: Object.keys(deviceStats), datasets: [{ data: Object.values(deviceStats), backgroundColor: ['#2fc7ff', '#28a745', '#ffc107'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } }
    });
  }
  
  // Browser chart
  if (browserChart) browserChart.destroy();
  const ctxBrowsers = document.getElementById('userBrowsersChart')?.getContext('2d');
  if (ctxBrowsers && Object.keys(browserStats).length > 0) {
    browserChart = new Chart(ctxBrowsers, {
      type: 'bar',
      data: { labels: Object.keys(browserStats), datasets: [{ label: 'Sessions', data: Object.values(browserStats), backgroundColor: '#2fc7ff', borderRadius: 8 }] },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } }
    });
  }
  
  // OS chart
  if (userOSChart) userOSChart.destroy();
  const ctxOS = document.getElementById('userOSChart')?.getContext('2d');
  if (ctxOS && Object.keys(osStats).length > 0) {
    userOSChart = new Chart(ctxOS, {
      type: 'doughnut',
      data: { labels: Object.keys(osStats), datasets: [{ data: Object.values(osStats), backgroundColor: ['#2fc7ff', '#28a745', '#ffc107', '#dc3545', '#6f42c1'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } }
    });
  }
  
  // Login trends
  const loginData = getLoginTrends();
  if (loginTrendsChart) loginTrendsChart.destroy();
  const ctxTrends = document.getElementById('loginTrendsChart')?.getContext('2d');
  if (ctxTrends) {
    loginTrendsChart = new Chart(ctxTrends, {
      type: 'line',
      data: { labels: loginData.labels, datasets: [{ label: 'Logins', data: loginData.values, borderColor: '#2fc7ff', backgroundColor: 'rgba(47,199,255,0.1)', fill: true, tension: 0.4 }] },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } } }
    });
  }
}

function getLoginTrends() {
  const last30Days = {};
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const key = date.toISOString().split('T')[0];
    last30Days[key] = 0;
  }
  for (const session of analyticsData.sessions) {
    const sessionDate = new Date(session.timestamp).toISOString().split('T')[0];
    if (last30Days[sessionDate] !== undefined) last30Days[sessionDate]++;
  }
  return { labels: Object.keys(last30Days).map(date => { const d = new Date(date); return `${d.getMonth() + 1}/${d.getDate()}`; }), values: Object.values(last30Days) };
}

function updateLocationList() {
  const locationStats = {};
  for (const session of analyticsData.sessions) {
    if (session.location && session.location.country) {
      const key = `${session.location.city || 'Unknown'}, ${session.location.country}`;
      locationStats[key] = (locationStats[key] || 0) + 1;
    }
  }
  
  const locationList = document.getElementById('locationList');
  if (!locationList) return;
  
  if (Object.keys(locationStats).length === 0) {
    locationList.innerHTML = '<div class="text-center text-muted py-4">No location data available</div>';
    return;
  }
  
  locationList.innerHTML = '';
  for (const [location, count] of Object.entries(locationStats).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    const div = document.createElement('div');
    div.className = 'location-item';
    div.innerHTML = `<span><i class="fa fa-map-marker"></i> ${window.escapeHtml(location)}</span><span class="badge badge-info">${count} visits</span>`;
    locationList.appendChild(div);
  }
}

function updateRecentLogins() {
  const recentSessions = [...analyticsData.sessions].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
  const tbody = document.getElementById('recentLoginsTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (recentSessions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">No login data available</td></tr>';
    return;
  }
  
  for (const session of recentSessions) {
    const row = tbody.insertRow();
    row.insertCell(0).innerHTML = `<strong>${window.escapeHtml(session.username)}</strong>`;
    row.insertCell(1).innerHTML = new Date(session.timestamp).toLocaleString();
    row.insertCell(2).innerHTML = session.ip || 'N/A';
    row.insertCell(3).innerHTML = session.location ? `${session.location.city || 'N/A'}, ${session.location.country || 'N/A'}` : 'N/A';
    row.insertCell(4).innerHTML = session.device ? `${session.device.deviceType || 'N/A'} - ${session.device.browser || 'N/A'}` : 'N/A';
    row.insertCell(5).innerHTML = session.device ? session.device.os || 'N/A' : 'N/A';
  }
}

async function exportAnalyticsReport() {
  window.showLoading('Generating analytics report...');
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const stats = window.analyticsStats;
    
    doc.setFillColor(11, 43, 59);
    doc.rect(0, 0, pageWidth, 25, 'F');
    doc.setFillColor(47, 199, 255);
    doc.rect(0, 25, pageWidth, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text('Analytics Report', pageWidth / 2, 18, { align: 'center' });
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, 35, { align: 'center' });
    
    let yPos = 55;
    doc.setFontSize(14);
    doc.setTextColor(11, 43, 59);
    doc.text('Key Metrics (All Users)', 15, yPos);
    yPos += 10;
    
    const metrics = [
      `Total Projects: ${stats.totalProjects}`,
      `Completed: ${stats.completedProjects}`,
      `Ongoing: ${stats.ongoingProjects}`,
      `DeltaV Projects: ${stats.deltaVProjects}`,
      `Total Hours: ${stats.totalHours.toFixed(1)}`,
      `Certificates: ${analyticsData.certificates.length}`,
      `Users: ${analyticsData.users.length}`,
      `Sessions: ${analyticsData.sessions.length}`
    ];
    
    let xPos = 15;
    for (const metric of metrics) {
      doc.setFontSize(10);
      doc.text(metric, xPos, yPos);
      xPos += 45;
      if (xPos + 40 > pageWidth - 15) { xPos = 15; yPos += 8; }
    }
    
    doc.save(`analytics_report_${new Date().toISOString().slice(0, 10)}.pdf`);
    showToast('Report exported successfully!', 'success');
  } catch (err) {
    showToast('Export failed: ' + err.message, 'error');
  } finally {
    window.hideLoading();
  }
}

function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.zIndex = '1050';
    document.body.appendChild(container);
  }
  const toastId = 'toast-' + Date.now();
  const bgColor = type === 'success' ? '#28a745' : (type === 'error' ? '#dc3545' : '#17a2b8');
  const html = `<div id="${toastId}" style="background: ${bgColor}; color: white; padding: 12px 20px; border-radius: 8px; margin-top: 10px; min-width: 200px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); animation: fadeInOut 3s ease;">${message}</div>`;
  container.insertAdjacentHTML('beforeend', html);
  setTimeout(() => { const toast = document.getElementById(toastId); if (toast) toast.remove(); }, 3000);
}
