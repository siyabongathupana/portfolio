// user-analytics.js - User tracking analytics

let userSessionsData = {};
let userDevicesChart = null;
let userBrowsersChart = null;
let userOSChart = null;
let loginTrendsChart = null;

async function loadUserAnalytics() {
  const user = window.SessionManager?.getCurrentUser();
  const isAdmin = window.APP_CONFIG?.adminUsers?.includes(user?.username);
  if (!isAdmin) {
    const section = document.getElementById('userAnalyticsSection');
    if (section) section.style.display = 'none';
    return;
  }
  
  window.showLoading('Loading user analytics...');
  try {
    userSessionsData = await window.AccountManager.getAllUserSessions(user.pat);
    updateUserAnalytics();
    updateUserLocationMap();
    updateUserCharts();
    updateRecentLogins();
  } catch (error) {
    console.error('Error loading user analytics:', error);
    showAnalyticsToast('Failed to load user analytics: ' + error.message, 'error');
  } finally {
    window.hideLoading();
  }
}

function showAnalyticsToast(message, type = 'success') {
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
  const html = `<div id="${toastId}" style="background: ${bgColor}; color: white; padding: 12px 20px; border-radius: 8px; margin-top: 10px; min-width: 200px; max-width: 90%; box-shadow: 0 2px 10px rgba(0,0,0,0.1); animation: fadeInOut 3s ease; font-size: 14px;">${message}</div>`;
  container.insertAdjacentHTML('beforeend', html);
  setTimeout(() => { const toast = document.getElementById(toastId); if (toast) toast.remove(); }, 3000);
}

function updateUserAnalytics() {
  let totalSessions = 0;
  let uniqueUsers = Object.keys(userSessionsData).length;
  let uniqueLocations = new Set();
  let deviceStats = { Desktop: 0, Mobile: 0, Tablet: 0 };
  let browserStats = {};
  let osStats = {};
  let countryStats = {};
  
  for (const [user, sessions] of Object.entries(userSessionsData)) {
    totalSessions += sessions.length;
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
  }
  
  const totalSessionsEl = document.getElementById('totalSessions');
  const uniqueUsersEl = document.getElementById('uniqueUsers');
  const uniqueLocationsEl = document.getElementById('uniqueLocations');
  const topCountryEl = document.getElementById('topCountry');
  if (totalSessionsEl) totalSessionsEl.textContent = totalSessions;
  if (uniqueUsersEl) uniqueUsersEl.textContent = uniqueUsers;
  if (uniqueLocationsEl) uniqueLocationsEl.textContent = uniqueLocations.size;
  const topCountry = Object.entries(countryStats).sort((a, b) => b[1] - a[1])[0];
  if (topCountryEl) topCountryEl.textContent = topCountry ? topCountry[0] : 'N/A';
  
  window.userDeviceStats = deviceStats;
  window.userBrowserStats = browserStats;
  window.userOSStats = osStats;
}

function updateUserLocationMap() {
  const locations = [];
  for (const [user, sessions] of Object.entries(userSessionsData)) {
    for (const session of sessions) {
      if (session.location) locations.push({ user: user, city: session.location.city || 'Unknown', country: session.location.country || 'Unknown', time: new Date(session.timestamp).toLocaleString() });
    }
  }
  const locationList = document.getElementById('locationList');
  if (!locationList) return;
  if (locations.length === 0) { locationList.innerHTML = '<div class="text-center text-muted py-4">No location data available</div>'; return; }
  const uniqueLocations = {};
  for (const loc of locations) {
    const key = `${loc.city}, ${loc.country}`;
    if (!uniqueLocations[key]) uniqueLocations[key] = { count: 0, users: new Set(), lastSeen: loc.time };
    uniqueLocations[key].count++;
    uniqueLocations[key].users.add(loc.user);
    uniqueLocations[key].lastSeen = loc.time;
  }
  locationList.innerHTML = '';
  for (const [location, data] of Object.entries(uniqueLocations)) {
    const card = document.createElement('div');
    card.className = 'location-item';
    card.innerHTML = `<div><strong><i class="fa fa-map-marker"></i> ${window.escapeHtml(location)}</strong><br><small class="text-muted">${data.count} visits from ${data.users.size} user(s)</small></div><div><small class="text-muted">Last seen: ${data.lastSeen}</small></div>`;
    locationList.appendChild(card);
  }
}

function updateUserCharts() {
  const stats = window.userDeviceStats;
  const browserStats = window.userBrowserStats;
  const osStats = window.userOSStats;
  
  if (userDevicesChart) userDevicesChart.destroy();
  const ctxDevices = document.getElementById('userDevicesChart')?.getContext('2d');
  if (ctxDevices && stats && Object.keys(stats).length > 0) {
    userDevicesChart = new Chart(ctxDevices, { type: 'pie', data: { labels: Object.keys(stats), datasets: [{ data: Object.values(stats), backgroundColor: ['#2fc7ff', '#28a745', '#ffc107'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } } });
  }
  
  if (userBrowsersChart) userBrowsersChart.destroy();
  const ctxBrowsers = document.getElementById('userBrowsersChart')?.getContext('2d');
  if (ctxBrowsers && browserStats && Object.keys(browserStats).length > 0) {
    userBrowsersChart = new Chart(ctxBrowsers, { type: 'bar', data: { labels: Object.keys(browserStats), datasets: [{ label: 'Sessions', data: Object.values(browserStats), backgroundColor: '#2fc7ff', borderRadius: 8 }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Number of Sessions' } } } } });
  }
  
  if (userOSChart) userOSChart.destroy();
  const ctxOS = document.getElementById('userOSChart')?.getContext('2d');
  if (ctxOS && osStats && Object.keys(osStats).length > 0) {
    userOSChart = new Chart(ctxOS, { type: 'doughnut', data: { labels: Object.keys(osStats), datasets: [{ data: Object.values(osStats), backgroundColor: ['#2fc7ff', '#28a745', '#ffc107', '#dc3545', '#6f42c1', '#fd7e14'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } } });
  }
  
  const loginData = getLoginTrends();
  if (loginTrendsChart) loginTrendsChart.destroy();
  const ctxTrends = document.getElementById('loginTrendsChart')?.getContext('2d');
  if (ctxTrends && loginData.labels.length > 0) {
    loginTrendsChart = new Chart(ctxTrends, { type: 'line', data: { labels: loginData.labels, datasets: [{ label: 'Logins', data: loginData.values, borderColor: '#2fc7ff', backgroundColor: 'rgba(47, 199, 255, 0.1)', fill: true, tension: 0.4, pointBackgroundColor: '#2fc7ff', pointBorderColor: '#fff', pointRadius: 4, pointHoverRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Number of Logins' } } } } });
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
  for (const [user, sessions] of Object.entries(userSessionsData)) {
    for (const session of sessions) {
      const sessionDate = new Date(session.timestamp).toISOString().split('T')[0];
      if (last30Days[sessionDate] !== undefined) last30Days[sessionDate]++;
    }
  }
  return { labels: Object.keys(last30Days).map(date => { const d = new Date(date); return `${d.getMonth() + 1}/${d.getDate()}`; }), values: Object.values(last30Days) };
}

function updateRecentLogins() {
  const allSessions = [];
  for (const [user, sessions] of Object.entries(userSessionsData)) {
    for (const session of sessions) allSessions.push({ user: user, ...session });
  }
  allSessions.sort((a, b) => b.timestamp - a.timestamp);
  const recentSessions = allSessions.slice(0, 20);
  const tbody = document.getElementById('recentLoginsTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (recentSessions.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="text-center">No login data available</td></tr>'; return; }
  for (const session of recentSessions) {
    const row = tbody.insertRow();
    row.insertCell(0).innerHTML = `<strong>${window.escapeHtml(session.user)}</strong>`;
    row.insertCell(1).innerHTML = new Date(session.timestamp).toLocaleString();
    row.insertCell(2).innerHTML = session.ip || 'N/A';
    row.insertCell(3).innerHTML = session.location ? `${session.location.city || 'N/A'}, ${session.location.country || 'N/A'}` : 'N/A';
    row.insertCell(4).innerHTML = session.device ? `${session.device.deviceType || 'N/A'} - ${session.device.browser || 'N/A'}` : 'N/A';
    row.insertCell(5).innerHTML = session.device ? session.device.os || 'N/A' : 'N/A';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const user = window.SessionManager?.getCurrentUser();
    if (user && window.APP_CONFIG?.adminUsers?.includes(user.username)) setTimeout(loadUserAnalytics, 500);
  });
} else {
  const user = window.SessionManager?.getCurrentUser();
  if (user && window.APP_CONFIG?.adminUsers?.includes(user.username)) setTimeout(loadUserAnalytics, 500);
}
