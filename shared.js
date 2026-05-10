// shared.js - Data management, PDF generation, helpers
// Fetches projects.json & certificates.json from GitHub (configurable)
// Caches in localStorage, exports whole dataset as ZIP.

/* ========== Default data (fallback) ========== */
const defaultProjects = {
  batch: {
    id: "batch", title: "Batch Automation Upgrade", controllerType: "MD", cabinetCount: 3,
    projectType: "DCS", deltaVVersion: "v14.3",
    io: { AI:48, AO:24, DI:96, DO:48 },
    dates: { start:"2024-01-15", finish:"2024-06-30", ifat:"2024-05-10", cfat:"2024-06-20" },
    siteLocation: "Houston, TX",
    team: { lead: "John Smith", engineer: "Lucas Chen", technician: "Mike Ross" },
    description: "Complete redesign of batch sequence phases, integration with ERP, and OEE dashboard. Achieved 22% reduction in cycle time and 31% decrease in batch exceptions.",
    graphType: "bar",
    selectedImages: [
      { url: "https://picsum.photos/id/21/400/300", caption: "Main control cabinet" },
      { url: "https://picsum.photos/id/47/400/300", caption: "HMI batch overview" }
    ]
  },
  sis: {
    id: "sis", title: "SIS Logic Migration", controllerType: "SQ", cabinetCount: 2,
    projectType: "SIS", deltaVVersion: "v14.0",
    io: { AI:32, AO:16, DI:64, DO:32 },
    dates: { start:"2024-02-01", finish:"2024-07-15", ifat:"2024-06-01", cfat:"2024-07-05" },
    siteLocation: "Baton Rouge, LA",
    team: { lead: "Sarah Lee", engineer: "Lucas Chen", technician: "James Carter" },
    description: "Migrated legacy emergency shutdown system to DeltaV SIS, achieving 99.9% availability and reduced spurious trips by 34%.",
    graphType: "pie",
    selectedImages: [
      { url: "https://picsum.photos/id/19/400/300", caption: "SIS logic solver" },
      { url: "https://picsum.photos/id/39/400/300", caption: "Safety matrix" }
    ]
  },
  apc: {
    id: "apc", title: "Advanced Process Control", controllerType: "IQ", cabinetCount: 1,
    projectType: "DCS", deltaVVersion: "v14.2",
    io: { AI:24, AO:12, DI:32, DO:16 },
    dates: { start:"2024-03-10", finish:"2024-08-20", ifat:"2024-07-10", cfat:"2024-08-10" },
    siteLocation: "Corpus Christi, TX",
    team: { lead: "David Wu", engineer: "Lucas Chen", technician: "Anna Gomez" },
    description: "Model Predictive Control on crude distillation unit. Stabilized product specs, reduced temperature variance 47% and fuel gas consumption 12%.",
    graphType: "line",
    selectedImages: [
      { url: "https://picsum.photos/id/15/400/300", caption: "APC controller configuration" },
      { url: "https://picsum.photos/id/29/400/300", caption: "Trend analysis" }
    ]
  },
  pharma: {
    id: "pharma", title: "Pharma Cleanroom Automation", controllerType: "SD", cabinetCount: 2,
    projectType: "DCS", deltaVVersion: "v14.3",
    io: { AI:64, AO:32, DI:128, DO:64 },
    dates: { start:"2023-09-01", finish:"2024-02-28", ifat:"2024-01-10", cfat:"2024-02-15" },
    siteLocation: "Boston, MA",
    team: { lead: "Emily Watson", engineer: "Lucas Chen", technician: "Raj Patel" },
    description: "Full cleanroom HVAC and batch process control meeting FDA 21 CFR Part 11, integrated with LIMS. Reduced deviation events by 40%.",
    graphType: "bar",
    selectedImages: [
      { url: "https://picsum.photos/id/63/400/300", caption: "Cleanroom panel" },
      { url: "https://picsum.photos/id/65/400/300", caption: "Batch report" }
    ]
  },
  oilywater: {
    id: "oilywater", title: "Oily Water Separation Upgrade", controllerType: "PK", cabinetCount: 1,
    projectType: "DCS", deltaVVersion: "v14.1",
    io: { AI:20, AO:10, DI:48, DO:24 },
    dates: { start:"2024-04-15", finish:"2024-09-30", ifat:"2024-08-20", cfat:"2024-09-10" },
    siteLocation: "Beaumont, TX",
    team: { lead: "Robert Kim", engineer: "Lucas Chen", technician: "Sandra Mills" },
    description: "Retrofitted DeltaV control for TPI separators. Oil-in-water discharge below 5 ppm, saving $120k/year in compliance penalties.",
    graphType: "pie",
    selectedImages: [
      { url: "https://picsum.photos/id/13/400/300", caption: "Separator skid" },
      { url: "https://picsum.photos/id/14/400/300", caption: "DCS mimic" }
    ]
  },
  gascomp: {
    id: "gascomp", title: "Gas Compressor Control Retrofit", controllerType: "SX", cabinetCount: 2,
    projectType: "SIS", deltaVVersion: "v14.2",
    io: { AI:40, AO:20, DI:80, DO:40 },
    dates: { start:"2023-11-01", finish:"2024-05-20", ifat:"2024-04-10", cfat:"2024-05-05" },
    siteLocation: "Midland, TX",
    team: { lead: "Mark Davis", engineer: "Lucas Chen", technician: "Omar Hassan" },
    description: "Anti-surge and load-sharing control for two 5 MW centrifugal compressors, improving efficiency by 8% and preventing surge incidents.",
    graphType: "bar",
    selectedImages: [
      { url: "https://picsum.photos/id/35/400/300", caption: "Compressor train" },
      { url: "https://picsum.photos/id/36/400/300", caption: "Load-sharing display" }
    ]
  },
  wastewater: {
    id: "wastewater", title: "Wastewater Treatment SCADA", controllerType: "MQ", cabinetCount: 3,
    projectType: "DCS", deltaVVersion: "v14.3",
    io: { AI:56, AO:28, DI:112, DO:56 },
    dates: { start:"2024-05-10", finish:"2024-11-30", ifat:"2024-10-15", cfat:"2024-11-10" },
    siteLocation: "Atlanta, GA",
    team: { lead: "Linda Park", engineer: "Lucas Chen", technician: "Javier Ruiz" },
    description: "Complete SCADA replacement with DeltaV, integrating 12 remote pumping stations via Modbus TCP. Reduced energy use by 18%.",
    graphType: "line",
    selectedImages: [
      { url: "https://picsum.photos/id/41/400/300", caption: "SCADA overview" },
      { url: "https://picsum.photos/id/42/400/300", caption: "Pump station" }
    ]
  },
  bioreactor: {
    id: "bioreactor", title: "Bioreactor Batch Optimization", controllerType: "IQ", cabinetCount: 1,
    projectType: "DCS", deltaVVersion: "v14.4",
    io: { AI:36, AO:18, DI:64, DO:32 },
    dates: { start:"2024-02-10", finish:"2024-07-25", ifat:"2024-06-15", cfat:"2024-07-10" },
    siteLocation: "San Francisco, CA",
    team: { lead: "Nina Adams", engineer: "Lucas Chen", technician: "Tom Briggs" },
    description: "Applied advanced control strategies to mammalian cell culture, increasing product titer by 30% and consistency between batches.",
    graphType: "pie",
    selectedImages: [
      { url: "https://picsum.photos/id/57/400/300", caption: "Bioreactor skid" },
      { url: "https://picsum.photos/id/58/400/300", caption: "Batch trends" }
    ]
  },
  sulfur: {
    id: "sulfur", title: "Sulfur Recovery Unit Revamp", controllerType: "SQ", cabinetCount: 2,
    projectType: "SIS", deltaVVersion: "v14.0",
    io: { AI:28, AO:14, DI:56, DO:28 },
    dates: { start:"2023-12-01", finish:"2024-06-15", ifat:"2024-05-01", cfat:"2024-06-01" },
    siteLocation: "Lake Charles, LA",
    team: { lead: "Alex Turner", engineer: "Lucas Chen", technician: "Patricia Owens" },
    description: "Redesigned Claus unit control with advanced tail-gas analysis, improving sulfur recovery efficiency to 96.5% and reducing H2S emissions.",
    graphType: "line",
    selectedImages: [
      { url: "https://picsum.photos/id/73/400/300", caption: "SRU control room" },
      { url: "https://picsum.photos/id/74/400/300", caption: "Analyzer house" }
    ]
  },
  flare: {
    id: "flare", title: "Flare Gas Recovery System", controllerType: "MD", cabinetCount: 1,
    projectType: "DCS", deltaVVersion: "v14.3",
    io: { AI:18, AO:8, DI:32, DO:16 },
    dates: { start:"2024-06-01", finish:"2024-12-20", ifat:"2024-11-10", cfat:"2024-12-05" },
    siteLocation: "Norco, LA",
    team: { lead: "Diana Brooks", engineer: "Lucas Chen", technician: "Kevin Hart" },
    description: "Automated flare gas recovery compressors and control valves, recovering 98% of flare gas, saving $350k/year and reducing CO2 emissions.",
    graphType: "bar",
    selectedImages: [
      { url: "https://picsum.photos/id/83/400/300", caption: "Flare recovery skid" },
      { url: "https://picsum.photos/id/84/400/300", caption: "HMI recovery" }
    ]
  },
  ammonia: {
    id: "ammonia", title: "Ammonia Plant DCS Migration", controllerType: "SD", cabinetCount: 4,
    projectType: "DCS", deltaVVersion: "v14.5",
    io: { AI:96, AO:48, DI:192, DO:96 },
    dates: { start:"2023-08-01", finish:"2024-04-30", ifat:"2024-03-15", cfat:"2024-04-15" },
    siteLocation: "Donaldsonville, LA",
    team: { lead: "Gregory Miller", engineer: "Lucas Chen", technician: "Monica Singh" },
    description: "Migrated legacy Provox to DeltaV in a 2000 t/d ammonia plant; cut commissioning time by 25% using virtual commissioning.",
    graphType: "line",
    selectedImages: [
      { url: "https://picsum.photos/id/91/400/300", caption: "Migrated DCS rack" },
      { url: "https://picsum.photos/id/92/400/300", caption: "Virtual FAT" }
    ]
  }
};

const defaultCertificates = [
  { id: "cert1", title: "Emerson DeltaV Advanced Training", issuer: "Emerson Educational Services", date: "2023-06", link: "https://drive.google.com/file/d/example1/preview", thumbnail: "https://picsum.photos/id/26/300/200" },
  { id: "cert2", title: "ISA Certified Automation Professional (CAP)", issuer: "ISA", date: "2022-10", link: "https://drive.google.com/file/d/example2/preview", thumbnail: "https://picsum.photos/id/28/300/200" },
  { id: "cert3", title: "IEC 61511 Functional Safety", issuer: "TÜV Rheinland", date: "2024-01", link: "https://drive.google.com/file/d/example3/preview", thumbnail: "https://picsum.photos/id/29/300/200" }
];

/* ========== Remote fetching ========== */
async function fetchJSON(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Not found");
    return await resp.json();
  } catch {
    return null;
  }
}

/* ========== Core data API ========== */
window.portfolioData = (function() {
  const PROJECTS_KEY = 'deltaVProjects';
  const CERTS_KEY = 'deltaVCertificates';
  const REMOTE_PROJECTS_URL = (window.REMOTE_DATA_BASE || '') + 'projects.json';
  const REMOTE_CERTS_URL = (window.REMOTE_DATA_BASE || '') + 'certificates.json';

  // Fetch remote data once and cache in localStorage
  async function fetchRemoteOrCache() {
    if (!window.REMOTE_DATA_BASE) return;
    const [remoteProjects, remoteCerts] = await Promise.all([
      fetchJSON(REMOTE_PROJECTS_URL),
      fetchJSON(REMOTE_CERTS_URL)
    ]);
    if (remoteProjects) localStorage.setItem(PROJECTS_KEY, JSON.stringify(remoteProjects));
    if (remoteCerts) localStorage.setItem(CERTS_KEY, JSON.stringify(remoteCerts));
  }

  // Call automatically (non-blocking)
  fetchRemoteOrCache();

  function loadProjects() {
    const stored = localStorage.getItem(PROJECTS_KEY);
    if (stored) {
      try { return JSON.parse(stored); } catch(e) {}
    }
    return defaultProjects;
  }

  function saveProjects(data) {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(data));
  }

  function loadCertificates() {
    const stored = localStorage.getItem(CERTS_KEY);
    if (stored) {
      try { return JSON.parse(stored); } catch(e) {}
    }
    return defaultCertificates;
  }

  function saveCertificates(data) {
    localStorage.setItem(CERTS_KEY, JSON.stringify(data));
  }

  function resetProjectsToDefault() {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(defaultProjects));
    return defaultProjects;
  }

  // Export data as downloadable ZIP
  function exportData() {
    const projects = loadProjects();
    const certs = loadCertificates();
    const zip = new JSZip();
    zip.file("projects.json", JSON.stringify(projects, null, 2));
    zip.file("certificates.json", JSON.stringify(certs, null, 2));
    zip.generateAsync({ type: "blob" }).then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = "deltaV_data.zip";
      a.click();
    });
  }

  return { loadProjects, saveProjects, loadCertificates, saveCertificates, resetProjectsToDefault, exportData };
})();

/* ========== PDF Generation (themed) ========== */
window.generateProjectReport = async function(projectId) {
  const data = window.portfolioData.loadProjects();
  const proj = data[projectId];
  if (!proj) {
    alert("Project not found!");
    return;
  }

  // Determine theme
  let projectType = proj.projectType || 'Other';
  let primaryColor, bgColor;
  if (projectType === 'DCS') {
    primaryColor = '#2fc7ff';
    bgColor = '#f9fbfd';
  } else if (projectType === 'SIS') {
    primaryColor = '#ffc107';
    bgColor = '#fffdf0';
  } else {
    primaryColor = '#6c757d';
    bgColor = '#f8f9fa';
  }

  // Chart
  const chartCanvas = document.createElement('canvas');
  chartCanvas.width = 500;
  chartCanvas.height = 250;
  const ctx = chartCanvas.getContext('2d');
  let chart;
  const chartColors = (projectType === 'DCS') ? ['#2fc7ff','#1d9fcf','#0f5c6b','#0a4b59'] :
                      (projectType === 'SIS') ? ['#ffc107','#ffb300','#ff8f00','#ff6f00'] :
                      ['#adb5bd','#6c757d','#495057','#212529'];
  if (proj.graphType === 'pie') {
    chart = new Chart(ctx, {
      type: 'pie',
      data: { labels: ['AI','AO','DI','DO'], datasets: [{ data: [proj.io.AI, proj.io.AO, proj.io.DI, proj.io.DO], backgroundColor: chartColors }] },
      options: { responsive: false }
    });
  } else if (proj.graphType === 'line') {
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels: ['AI','AO','DI','DO'], datasets: [{ label: 'I/O Count', data: [proj.io.AI, proj.io.AO, proj.io.DI, proj.io.DO], borderColor: primaryColor, fill: true }] },
      options: { responsive: false }
    });
  } else {
    chart = new Chart(ctx, {
      type: 'bar',
      data: { labels: ['AI','AO','DI','DO'], datasets: [{ label: 'I/O Count', data: [proj.io.AI, proj.io.AO, proj.io.DI, proj.io.DO], backgroundColor: primaryColor }] },
      options: { responsive: false }
    });
  }
  await new Promise(r => setTimeout(r, 200));
  const chartBase64 = chartCanvas.toDataURL('image/png');
  chart.destroy();

  // Images grid
  let imagesHtml = '';
  if (proj.selectedImages.length) {
    imagesHtml = `<div style="display: flex; flex-wrap: wrap; gap:10px; margin-top:10px;">`;
    proj.selectedImages.forEach(img => {
      imagesHtml += `
        <div style="flex:0 0 calc(50% - 5px); text-align:center; background:#f8f9fa; border-radius:8px; padding:5px;">
          <img src="${img.url}" style="width:100%; max-height:150px; object-fit:cover; border-radius:8px;" />
          <div style="font-size:10px; color:#555; margin-top:4px;">${img.caption || ''}</div>
        </div>`;
    });
    imagesHtml += `</div>`;
  } else {
    imagesHtml = '<p>No images selected.</p>';
  }

  const dateStr = new Date().toLocaleDateString();
  const reportHTML = `
    <div style="font-family:Inter, sans-serif; padding:20px; background:white; max-width:680px; margin:0 auto; color:#1e2a3e;">
      <div style="border-bottom:4px solid ${primaryColor}; padding-bottom:10px; margin-bottom:20px;">
        <h1 style="color:#0f4c5f; margin:0;">DeltaV Engineering Report</h1>
        <p style="color:#5a7d9a; margin:5px 0 0;">${proj.title} | Technical Summary</p>
        <span style="display:inline-block; background:${primaryColor}; color:white; padding:3px 12px; border-radius:20px; font-size:0.8rem; margin-top:8px;">
          ${projectType} ${proj.deltaVVersion ? '· DeltaV ' + proj.deltaVVersion : ''}
        </span>
      </div>

      <div style="background:${bgColor}; padding:20px; border-radius:16px; margin:20px 0;">
        <h3>Project Overview</h3>
        <table style="width:100%">
          <tr><td><strong>Title:</strong></td><td>${proj.title}</td></tr>
          <tr><td><strong>Location:</strong></td><td>${proj.siteLocation||'N/A'}</td></tr>
          <tr><td><strong>Controller:</strong></td><td>${proj.controllerType}</td></tr>
          <tr><td><strong>Cabinets:</strong></td><td>${proj.cabinetCount}</td></tr>
          ${proj.deltaVVersion ? `<tr><td><strong>DeltaV Version:</strong></td><td>${proj.deltaVVersion}</td></tr>` : ''}
        </table>
      </div>

      <div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px;">
        <h3>Description</h3>
        <p>${proj.description}</p>
      </div>

      <div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px;">
        <h3>I/O Configuration</h3>
        <table style="width:100%; text-align:center; border-collapse:collapse;">
          <tr style="background:${primaryColor}; color:white;"><th>AI</th><th>AO</th><th>DI</th><th>DO</th></tr>
          <tr><td>${proj.io.AI}</td><td>${proj.io.AO}</td><td>${proj.io.DI}</td><td>${proj.io.DO}</td></tr>
        </table>
      </div>

      <div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px; text-align:center;">
        <h3>I/O Distribution (${proj.graphType})</h3>
        <img src="${chartBase64}" style="max-width:100%; margin-top:10px;" />
      </div>

      <div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px;">
        <h3>Team Members</h3>
        <p><strong>Lead Engineer:</strong> ${proj.team.lead}<br>
        <strong>Project Engineer:</strong> ${proj.team.engineer}<br>
        <strong>Technician:</strong> ${proj.team.technician}</p>
      </div>

      <div style="background:${bgColor}; padding:20px; border-radius:16px; margin-bottom:20px;">
        <h3>Project Images</h3>
        ${imagesHtml}
      </div>

      <div style="margin-top:30px; font-size:10px; color:#999; text-align:center;">
        Generated ${dateStr} | DeltaV Portfolio
      </div>
    </div>
  `;

  let container = document.getElementById('reportTempContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'reportTempContainer';
    container.style.position = 'fixed';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    container.style.width = '680px';
    document.body.appendChild(container);
  }
  container.innerHTML = reportHTML;

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'mm', 'a4');
  await pdf.html(container.firstElementChild, {
    callback: function (doc) {
      doc.save(`${proj.title.replace(/\s/g, '_')}_Report.pdf`);
    },
    x: 15,
    y: 15,
    width: 180,
    windowWidth: 680
  });
};