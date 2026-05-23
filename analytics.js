// analytics.js - Analytics Dashboard

let projectsChart = null;
let statusChart = null;
let timelineChart = null;
let hoursCategoryChart = null;

let analyticsData = {
  projects: [],
  certificates: [],
  timesheetEntries: [],
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
  await loadAnalyticsData();
  setupEventListeners();
});

function setupEventListeners() {
  const dateRangeSelect = document.getElementById('dateRangeSelect');
  if (dateRangeSelect) {
    dateRangeSelect.addEventListener('change', (e) => {
      const value = e.target.value;
      currentDateRange = value === 'all' ? 'all' : parseInt(value);
      refreshAnalytics();
    });
  }
  
  const refreshBtn = document.getElementById('refreshAnalyticsBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', refreshAnalytics);
  
  const exportBtn = document.getElementById('exportReportBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportAnalyticsReport);
}

async function loadAnalyticsData() {
  window.showLoading('Loading analytics data...');
  
  try {
    const projects = await window.portfolioData.loadProjectsForView();
    analyticsData.projects = Object.values(projects);
    
    const certificates = await window.portfolioData.loadCertificatesForView();
    analyticsData.certificates = certificates;
    
    const user = window.SessionManager.getCurrentUser();
    if (user && user.pat) {
      analyticsData.timesheetEntries = await loadTimesheetEntries(user);
    }
    
    const isAdmin = window.APP_CONFIG.adminUsers && window.APP_CONFIG.adminUsers.includes(user.username);
    if (isAdmin) {
      try {
        const users = await window.AccountManager.listUsers(user.pat);
        analyticsData.users = users;
        document.getElementById('totalUsers').textContent = users.length;
      } catch (e) {
        console.error('Could not load users:', e);
      }
    }
    
    refreshAnalytics();
  } catch (error) {
    console.error('Error loading analytics data:', error);
    showToast('Failed to load analytics data', 'error');
  } finally {
    window.hideLoading();
  }
}

async function loadTimesheetEntries(user) {
  const { owner, repo, branch, dataPath } = window.REPO_CONFIG;
  const encUser = encodeURIComponent(user.username);
  const path = `${dataPath}/users/${encUser}/timesheet.json`;
  
  try {
    const file = await GitHubAPI.getFileContent(owner, repo, path, branch, user.pat);
    if (file && file.content) {
      return JSON.parse(file.content);
    }
  } catch (e) {}
  return [];
}

function refreshAnalytics() {
  updateStats();
  updateCharts();
  updateInsights();
  updateTopProjectsTable();
}

function updateStats() {
  const filteredProjects = filterByDateRange(analyticsData.projects, 'updatedAt');
  
  document.getElementById('totalProjects').textContent = filteredProjects.length;
  document.getElementById('totalCertificates').textContent = analyticsData.certificates.length;
  
  let totalHours = 0;
  let billableHours = 0;
  const filteredEntries = filterByDateRange(analyticsData.timesheetEntries, 'date');
  for (const entry of filteredEntries) {
    totalHours += entry.hours || 0;
    if (entry.billable === 'yes') billableHours += entry.hours || 0;
  }
  document.getElementById('totalHours').textContent = totalHours.toFixed(1);
  
  window.analyticsStats = {
    completedProjects: filteredProjects.filter(p => p.status === 'Completed').length,
    ongoingProjects: filteredProjects.filter(p => p.status === 'Ongoing').length,
    deltaVProjects: filteredProjects.filter(p => p.projectCategory === 'deltaV' || p.controllerType).length,
    nonDeltaVProjects: filteredProjects.length - filteredProjects.filter(p => p.projectCategory === 'deltaV' || p.controllerType).length,
    totalProjects: filteredProjects.length,
    totalHours: totalHours,
    billableHours: billableHours,
    nonBillableHours: totalHours - billableHours,
    totalCertificates: analyticsData.certificates.length,
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
      data: { labels: ['DeltaV Projects', 'Non-DeltaV Projects'], datasets: [{ data: [stats.deltaVProjects, stats.nonDeltaVProjects], backgroundColor: ['#2fc7ff', '#ffc107'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } }
    });
  }
  
  if (statusChart) statusChart.destroy();
  const ctxStatus = document.getElementById('projectsByStatusChart')?.getContext('2d');
  if (ctxStatus) {
    statusChart = new Chart(ctxStatus, {
      type: 'doughnut',
      data: { labels: ['Completed', 'Ongoing', 'Paused', 'Planned'], datasets: [{ data: [stats.completedProjects, stats.ongoingProjects, filteredProjects.filter(p => p.status === 'Paused').length, filteredProjects.filter(p => !p.status || p.status === 'Planned').length], backgroundColor: ['#28a745', '#2fc7ff', '#ffc107', '#6c757d'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } }
    });
  }
  
  const timelineData = getProjectsTimelineData(filteredProjects);
  if (timelineChart) timelineChart.destroy();
  const ctxTimeline = document.getElementById('projectsTimelineChart')?.getContext('2d');
  if (ctxTimeline) {
    timelineChart = new Chart(ctxTimeline, {
      type: 'bar',
      data: { labels: timelineData.labels, datasets: [{ label: 'Projects Created', data: timelineData.values, backgroundColor: '#2fc7ff', borderRadius: 8 }] },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } } }
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
  const deltaVPercentage = stats.totalProjects > 0 ? ((stats.deltaVProjects / stats.totalProjects) * 100).toFixed(1) : 0;
  const avgHoursPerProject = stats.totalProjects > 0 ? (stats.totalHours / stats.totalProjects).toFixed(1) : 0;
  const insights = [`📊 Project completion rate: <strong>${completionRate}%</strong> (${stats.completedProjects} of ${stats.totalProjects} projects completed).`, `🎯 DeltaV projects make up <strong>${deltaVPercentage}%</strong> of your portfolio.`, `⏱️ You've logged <strong>${stats.totalHours.toFixed(1)} hours</strong> across ${stats.totalProjects} projects (avg ${avgHoursPerProject} hours per project).`, `💰 Billable hours: <strong>${stats.billableHours.toFixed(1)}</strong> | Non-billable: <strong>${stats.nonBillableHours.toFixed(1)}</strong>`, `📜 You have <strong>${stats.totalCertificates}</strong> professional certificates in your portfolio.`, `🖼️ Total project images: <strong>${stats.totalImages}</strong> across all projects.`];
  document.getElementById('insightsText').innerHTML = insights.join(' ');
}

function updateTopProjectsTable() {
  const projectHours = {};
  for (const entry of analyticsData.timesheetEntries) projectHours[entry.project || 'Uncategorized'] = (projectHours[entry.project || 'Uncategorized'] || 0) + (entry.hours || 0);
  const sortedProjects = Object.entries(projectHours).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const projectMap = {};
  for (const project of analyticsData.projects) projectMap[project.title] = project;
  const tbody = document.getElementById('topProjectsTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (sortedProjects.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="text-center">No timesheet data available</td></tr>'; return; }
  for (const [projectName, hours] of sortedProjects) {
    const project = projectMap[projectName] || {};
    const projectType = (project.projectCategory === 'deltaV' || project.controllerType) ? 'DeltaV' : 'General';
    const status = project.status || 'N/A';
    const imageCount = project.selectedImages?.length || 0;
    const row = tbody.insertRow();
    row.insertCell(0).innerHTML = `<strong>${window.escapeHtml(projectName)}</strong>`;
    row.insertCell(1).innerHTML = `<span class="badge badge-info">${projectType}</span>`;
    row.insertCell(2).innerHTML = `<span class="badge ${status === 'Completed' ? 'badge-success' : (status === 'Ongoing' ? 'badge-primary' : 'badge-secondary')}">${status}</span>`;
    row.insertCell(3).innerHTML = `<strong>${hours.toFixed(1)} hrs</strong>`;
    row.insertCell(4).innerHTML = `${imageCount} images`;
  }
}

async function exportAnalyticsReport() {
  window.showLoading('Generating analytics report...');
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    doc.setFillColor(11, 43, 59);
    doc.rect(0, 0, pageWidth, 25, 'F');
    doc.setFillColor(47, 199, 255);
    doc.rect(0, 25, pageWidth, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont(undefined, 'bold');
    doc.text('Analytics Report', pageWidth / 2, 18, { align: 'center' });
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, 35, { align: 'center' });
    const stats = window.analyticsStats;
    let yPos = 55;
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(11, 43, 59);
    doc.text('Key Metrics', margin, yPos);
    yPos += 10;
    const statsData = [{ label: 'Total Projects', value: stats.totalProjects }, { label: 'Completed', value: stats.completedProjects }, { label: 'Ongoing', value: stats.ongoingProjects }, { label: 'DeltaV Projects', value: stats.deltaVProjects }, { label: 'Total Hours', value: stats.totalHours.toFixed(1) }, { label: 'Billable Hours', value: stats.billableHours.toFixed(1) }, { label: 'Certificates', value: stats.totalCertificates }, { label: 'Total Images', value: stats.totalImages }];
    let xPos = margin;
    for (let i = 0; i < statsData.length; i++) {
      const stat = statsData[i];
      doc.setFillColor(245, 248, 250);
      doc.roundedRect(xPos, yPos, 40, 20, 3, 3, 'F');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(stat.label, xPos + 2, yPos + 6);
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(11, 43, 59);
      doc.text(stat.value.toString(), xPos + 2, yPos + 16);
      xPos += 45;
      if (xPos + 45 > pageWidth - margin) { xPos = margin; yPos += 25; }
    }
    yPos += 30;
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(11, 43, 59);
    doc.text('Key Insights', margin, yPos);
    yPos += 8;
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(80, 80, 80);
    const completionRate = stats.totalProjects > 0 ? ((stats.completedProjects / stats.totalProjects) * 100).toFixed(1) : 0;
    const insights = [`• Project completion rate: ${completionRate}% (${stats.completedProjects} of ${stats.totalProjects} projects)`, `• DeltaV projects: ${stats.deltaVProjects} (${stats.totalProjects > 0 ? ((stats.deltaVProjects / stats.totalProjects) * 100).toFixed(1) : 0}% of portfolio)`, `• Total hours logged: ${stats.totalHours.toFixed(1)} hours across all projects`, `• Billable vs Non-billable: ${stats.billableHours.toFixed(1)} / ${stats.nonBillableHours.toFixed(1)} hours`, `• Certificates earned: ${stats.totalCertificates}`, `• Project images uploaded: ${stats.totalImages}`];
    for (const insight of insights) { doc.text(insight, margin, yPos); yPos += 6; }
    doc.save(`analytics_report_${new Date().toISOString().slice(0, 10)}.pdf`);
    showToast('Analytics report exported successfully!', 'success');
  } catch (err) {
    console.error('Export error:', err);
    showToast('Failed to export report: ' + err.message, 'error');
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
  const html = `<div id="${toastId}" style="background: ${bgColor}; color: white; padding: 12px 20px; border-radius: 8px; margin-top: 10px; min-width: 200px; max-width: 90%; box-shadow: 0 2px 10px rgba(0,0,0,0.1); animation: fadeInOut 3s ease; font-size: 14px;">${message}</div>`;
  container.insertAdjacentHTML('beforeend', html);
  setTimeout(() => { const toast = document.getElementById(toastId); if (toast) toast.remove(); }, 3000);
}
