<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard | DeltaV Portfolio</title>
  <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <script src="config.js"></script>
  <script src="crypto.js"></script>
  <script src="api.js"></script>
  <script src="shared.js"></script>
  <style>
    .cert-thumb-preview { max-width:80px; max-height:80px; margin-top:8px; border-radius:12px; }
    .form-row.mt-2 { margin-top:12px!important; }
    .image-input-group { margin-bottom:15px; background:#f8f9fa; padding:12px; border-radius:12px; display:flex; align-items:center; gap:12px; }
    .image-input-group .img-preview-thumb { width:80px; height:80px; object-fit:cover; border-radius:8px; background:#e9ecef; }
    .image-input-group .img-details { flex:1; min-width:0; }
    .image-input-group .remove-img-btn { font-size:1.2rem; color:#dc3545; cursor:pointer; }
    .drop-zone { border:2px dashed #2fc7ff; border-radius:16px; padding:30px; text-align:center; color:#2fc7ff; margin-bottom:20px; cursor:pointer; transition:background 0.2s; }
    .drop-zone:hover, .drop-zone.dragover { background:#e6f7ff; }
    .drop-zone i { font-size:2rem; display:block; margin-bottom:8px; }
    .drop-zone .size-warning { font-size:0.75rem; color:#888; margin-top:5px; }
    .user-badge { background:#2fc7ff; color:white; padding:4px 12px; border-radius:20px; font-size:0.9rem; }
    .admin-section { border-left:4px solid #ffc107; padding-left:15px; }
    .footer-status { font-size:0.85rem; }
  </style>
</head>
<body style="background:#eef3fc;">

<div id="dashboard" style="display:none;">
  <div class="container admin-container">
    <div class="d-flex justify-content-between align-items-center flex-wrap">
      <h1><i class="fa fa-dashboard"></i> DeltaV Portfolio Dashboard</h1>
      <div class="d-flex align-items-center">
        <span class="user-badge mr-3" id="currentUserDisplay"></span>
        <button class="btn btn-outline-danger btn-sm mr-2" id="logoutBtn"><i class="fa fa-sign-out"></i> Logout</button>
        <button class="btn btn-outline-success btn-sm mr-2" id="downloadDataBtn"><i class="fa fa-download"></i> Export</button>
      </div>
    </div>
    <hr>
    <ul class="nav nav-tabs" id="adminTabs">
      <li class="nav-item"><a class="nav-link active" data-toggle="tab" href="#projectsTab">Projects</a></li>
      <li class="nav-item"><a class="nav-link" data-toggle="tab" href="#certificatesTab">Certificates</a></li>
      <li class="nav-item" id="usersTabNav" style="display:none;"><a class="nav-link" data-toggle="tab" href="#usersTab">Users</a></li>
    </ul>

    <div class="tab-content mt-4">
      <!-- Projects Tab -->
      <div class="tab-pane fade show active" id="projectsTab">
        <div class="mb-3 d-flex flex-wrap">
          <button class="btn btn-delta mr-2" id="addProjectBtn"><i class="fa fa-plus"></i> Add New Project</button>
          <button class="btn btn-outline-danger mr-2" id="deleteAllProjectsBtn"><i class="fa fa-trash"></i> Delete All</button>
          <button class="btn btn-outline-info" id="syncProjectsBtn"><i class="fa fa-refresh"></i> Sync from GitHub</button>
        </div>
        <div id="projectsList"></div>
      </div>

      <!-- Certificates Tab -->
      <div class="tab-pane fade" id="certificatesTab">
        <div class="mb-3 d-flex">
          <button class="btn btn-delta mr-2" id="addCertBtn"><i class="fa fa-plus"></i> Add Certificate</button>
          <button class="btn btn-outline-danger" id="deleteAllCertsBtn"><i class="fa fa-trash"></i> Delete All</button>
        </div>
        <div id="certificatesList"></div>
      </div>

      <!-- Users Tab (Admin only) -->
      <div class="tab-pane fade" id="usersTab">
        <div class="mb-3 d-flex align-items-center">
          <button class="btn btn-delta mr-2" id="refreshUsersBtn"><i class="fa fa-refresh"></i> Refresh List</button>
          <span class="text-muted">Blocked users cannot log in. Deleting a user permanently removes all their data.</span>
        </div>
        <div id="usersList"></div>
      </div>
    </div>
    <hr>
    <div class="text-center footer-status">
      <span id="userFooterStatus"></span>
    </div>
  </div>
</div>

<!-- Project Modal -->
<div class="modal fade" id="projectModal" tabindex="-1">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header"><h5 id="projectModalTitle">Project</h5><button type="button" class="close" data-dismiss="modal">&times;</button></div>
      <div class="modal-body">
        <form id="projectForm">
          <input type="hidden" id="projectId">
          <div class="form-row">
            <div class="col-md-6"><label>Title *</label><input type="text" id="projTitle" class="form-control" required></div>
            <div class="col-md-6"><label>Controller Type</label>
              <select id="projController" class="form-control">
                <option value="PK">PK</option><option value="SQ">SQ</option><option value="MD">MD</option>
                <option value="SD">SD</option><option value="IQ">IQ</option><option value="MQ">MQ</option>
                <option value="SX">SX</option><option value="SZ">SZ</option>
              </select>
            </div>
          </div>
          <div class="form-row mt-2">
            <div class="col-md-6"><label>Project Type</label>
              <select id="projType" class="form-control">
                <option value="">Select...</option>
                <option value="DCS">DCS</option>
                <option value="SIS">SIS</option>
                <option value="SIS & DCS">SIS & DCS</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div class="col-md-6"><label>DeltaV Version</label><input type="text" id="projVersion" class="form-control" placeholder="v14.3"></div>
          </div>
          <div class="form-row mt-2">
            <div class="col-md-6"><label># Cabinets</label><input type="number" id="projCabinet" class="form-control"></div>
            <div class="col-md-6"><label>Site Location</label><input type="text" id="projLocation" class="form-control"></div>
          </div>
          <div class="form-row mt-2">
            <div class="col-md-3"><label>AI</label><input type="number" id="projAI" class="form-control"></div>
            <div class="col-md-3"><label>AO</label><input type="number" id="projAO" class="form-control"></div>
            <div class="col-md-3"><label>DI</label><input type="number" id="projDI" class="form-control"></div>
            <div class="col-md-3"><label>DO</label><input type="number" id="projDO" class="form-control"></div>
          </div>
          <div class="form-row mt-2">
            <div class="col-md-3"><label>Start Date</label><input type="date" id="projStart" class="form-control"></div>
            <div class="col-md-3"><label>Finish Date</label><input type="date" id="projFinish" class="form-control"></div>
            <div class="col-md-3"><label>IFAT</label><input type="date" id="projIFAT" class="form-control"></div>
            <div class="col-md-3"><label>CFAT</label><input type="date" id="projCFAT" class="form-control"></div>
          </div>
          <div class="form-row mt-2">
            <div class="col-md-4"><label>Lead Engineer</label><input type="text" id="projLead" class="form-control"></div>
            <div class="col-md-4"><label>Project Engineer</label><input type="text" id="projEngineer" class="form-control"></div>
            <div class="col-md-4"><label>Technician</label><input type="text" id="projTech" class="form-control"></div>
          </div>
          <div class="form-group mt-2"><label>Description</label><textarea id="projDesc" rows="3" class="form-control"></textarea></div>
          <div class="form-group"><label>Graph Type</label>
            <select id="projGraphType" class="form-control">
              <option value="bar">Bar Chart</option><option value="pie">Pie Chart</option><option value="line">Line Chart</option>
            </select>
          </div>

          <div class="form-group">
            <label>Images (drag & drop or browse, unlimited – images are automatically compressed)</label>
            <div class="drop-zone" id="imageDropZone">
              <i class="fa fa-cloud-upload"></i>
              <span>Drag & drop images here or click to browse</span>
              <div class="size-warning">Large photos will be resized for web performance</div>
              <input type="file" id="imageFileInput" multiple accept="image/*" style="display:none;">
            </div>
            <div id="imagesContainer"></div>
          </div>

          <button type="submit" class="btn btn-delta mt-3">Save Project</button>
        </form>
      </div>
    </div>
  </div>
</div>

<!-- Certificate Modal -->
<div class="modal fade" id="certModal" tabindex="-1">
  <div class="modal-dialog modal-md">
    <div class="modal-content">
      <div class="modal-header"><h5 id="certModalTitle">Certificate</h5><button type="button" class="close" data-dismiss="modal">&times;</button></div>
      <div class="modal-body">
        <form id="certForm">
          <input type="hidden" id="certIndex">
          <div><label>Title *</label><input type="text" id="certTitle" class="form-control" required></div>
          <div class="mt-2"><label>Issuer</label><input type="text" id="certIssuer" class="form-control"></div>
          <div class="mt-2"><label>Date (YYYY-MM)</label><input type="text" id="certDate" class="form-control" placeholder="2024-01"></div>
          <div class="mt-2"><label>PDF / Google Drive Link</label><input type="url" id="certLink" class="form-control" placeholder="https://drive.google.com/file/d/.../preview"></div>
          <div class="mt-2">
            <label>Thumbnail Image</label>
            <div class="input-group">
              <input type="url" id="certThumb" class="form-control" placeholder="https://... or choose file">
              <div class="input-group-append">
                <label class="btn btn-outline-secondary mb-0" for="certThumbFile"><i class="fa fa-folder-open"></i> Browse</label>
                <input type="file" id="certThumbFile" accept="image/*" style="display:none" onchange="window.handleCertThumbUpload(this)">
              </div>
            </div>
            <img id="thumbPreview" class="cert-thumb-preview" style="display:none;">
          </div>
          <button type="submit" class="btn btn-delta mt-3">Save Certificate</button>
        </form>
      </div>
    </div>
  </div>
</div>

<script>
  const user = window.SessionManager?.getCurrentUser();
  if (!user) {
    window.location.href = 'login.html';
  } else {
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('currentUserDisplay').textContent = user.username;
    window.updateUserFooter();
    window.showLoading('Loading your projects...');
    initDashboard();
  }

  function compressImage(file, maxW = 1200, maxH = 1200, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxW || height > maxH) {
            const ratio = Math.min(maxW / width, maxH / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function initDashboard() {
    const imgContainer = document.getElementById('imagesContainer');
    const dropZone = document.getElementById('imageDropZone');
    const fileInput = document.getElementById('imageFileInput');

    function addImageRow(url = '', caption = '') {
      const placeholder = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ddd"/><text x="50%" y="50%" font-size="14" fill="#999" text-anchor="middle" dy=".3em">No Img</text></svg>');
      const row = document.createElement('div');
      row.className = 'image-input-group';
      row.innerHTML = `
        <img src="${url || placeholder}" class="img-preview-thumb" onerror="this.src='${placeholder}'">
        <div class="img-details">
          <input type="text" class="form-control img-url-input" placeholder="Image URL" value="${window.escapeHtml(url)}" readonly style="display:none;">
          <input type="text" class="form-control img-caption-input" placeholder="Caption" value="${window.escapeHtml(caption)}">
          <label class="local-upload-btn" style="cursor:pointer; color:#2fc7ff;">
            <i class="fa fa-folder-open"></i> Change
            <input type="file" accept="image/*" style="display:none;" onchange="window.updateImageRow(this)">
          </label>
        </div>
        <i class="fa fa-times-circle remove-img-btn" onclick="this.closest('.image-input-group').remove()"></i>
      `;
      imgContainer.appendChild(row);
    }

    window.updateImageRow = function(el) {
      const file = el.files[0];
      if (!file) return;
      compressImage(file).then(dataUrl => {
        const row = el.closest('.image-input-group');
        row.querySelector('.img-url-input').value = dataUrl;
        row.querySelector('.img-preview-thumb').src = dataUrl;
      });
    };

    window.handleCertThumbUpload = function(el) {
      const file = el.files[0];
      if (!file) return;
      compressImage(file, 300, 200, 0.6).then(dataUrl => {
        document.getElementById('certThumb').value = dataUrl;
        const preview = document.getElementById('thumbPreview');
        preview.src = dataUrl;
        preview.style.display = 'inline-block';
      });
    };

    dropZone.addEventListener('click', () => fileInput.click());
    ['dragenter','dragover','dragleave','drop'].forEach(ev => {
      dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); });
    });
    dropZone.addEventListener('dragover', () => dropZone.classList.add('dragover'));
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
      dropZone.classList.remove('dragover');
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      if (files.length) {
        for (const file of files) compressImage(file).then(dataUrl => addImageRow(dataUrl, ''));
      }
    });
    fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files);
      if (files.length) {
        for (const file of files) compressImage(file).then(dataUrl => addImageRow(dataUrl, ''));
        fileInput.value = '';
      }
    });

    // ---------- RENDER FUNCTIONS ----------
    async function renderProjects() {
      const projects = await window.portfolioData.loadProjects();
      const container = document.getElementById('projectsList');
      container.innerHTML = '';
      if (Object.keys(projects).length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa fa-folder-open-o"></i><h5>No projects yet</h5></div>';
        return;
      }
      for (const [id, proj] of Object.entries(projects)) {
        const card = document.createElement('div');
        card.className = 'card mb-3';
        card.innerHTML = `
          <div class="card-body">
            <div class="d-flex justify-content-between">
              <h5>${window.escapeHtml(proj.title)}</h5>
              <div>
                <button class="btn btn-sm btn-outline-primary edit-project" data-id="${id}">Edit</button>
                <button class="btn btn-sm btn-outline-danger delete-project" data-id="${id}">Delete</button>
              </div>
            </div>
            <p><strong>Controller:</strong> ${proj.controllerType} | <strong>Cabinets:</strong> ${proj.cabinetCount} | <strong>Location:</strong> ${proj.siteLocation || ''}</p>
            <small>${window.escapeHtml(proj.description.substring(0, 120))}...</small>
          </div>`;
        container.appendChild(card);
      }
      document.querySelectorAll('.edit-project').forEach(btn => btn.addEventListener('click', () => openProjectModal(btn.dataset.id)));
      document.querySelectorAll('.delete-project').forEach(btn => btn.addEventListener('click', () => {
        if (confirm('Delete this project?')) safeDeleteProject(btn.dataset.id);
      }));
    }

    async function renderCertificates() {
      const certs = await window.portfolioData.loadCertificates();
      const container = document.getElementById('certificatesList');
      container.innerHTML = '';
      if (certs.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa fa-certificate"></i><h5>No certificates added</h5></div>';
        return;
      }
      certs.forEach((cert, idx) => {
        const card = document.createElement('div');
        card.className = 'card mb-2';
        card.innerHTML = `
          <div class="card-body d-flex justify-content-between align-items-center">
            <div><strong>${window.escapeHtml(cert.title)}</strong> - ${window.escapeHtml(cert.issuer)} (${cert.date})</div>
            <div>
              <button class="btn btn-sm btn-outline-primary edit-cert" data-index="${idx}">Edit</button>
              <button class="btn btn-sm btn-outline-danger delete-cert" data-index="${idx}">Delete</button>
            </div>
          </div>`;
        container.appendChild(card);
      });
      document.querySelectorAll('.edit-cert').forEach(btn => btn.addEventListener('click', () => openCertModal(parseInt(btn.dataset.index))));
      document.querySelectorAll('.delete-cert').forEach(btn => btn.addEventListener('click', () => {
        if (confirm('Delete this certificate?')) safeDeleteCertificate(parseInt(btn.dataset.index));
      }));
    }

    // ---------- SAFE DELETE / SAVE (transactional) ----------
    async function safeDeleteProject(id) {
      showLoading('Deleting project...');
      const current = await window.portfolioData.loadProjects();
      if (!current[id]) { hideLoading(); return; }
      delete current[id];
      try {
        await window.portfolioData.saveProjects(current);
        await renderProjects();
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
      hideLoading();
    }

    async function safeDeleteCertificate(idx) {
      showLoading('Deleting certificate...');
      const certs = await window.portfolioData.loadCertificates();
      if (!certs[idx]) { hideLoading(); return; }
      certs.splice(idx, 1);
      try {
        await window.portfolioData.saveCertificates(certs);
        await renderCertificates();
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
      hideLoading();
    }

    async function safeSaveProject(project) {
      showLoading('Saving project...');
      const allProjects = await window.portfolioData.loadProjects();
      allProjects[project.id] = project;
      try {
        await window.portfolioData.saveProjects(allProjects);
        await renderProjects();
        $('#projectModal').modal('hide');
      } catch (err) {
        alert('Save failed: ' + err.message);
      }
      hideLoading();
    }

    async function safeSaveCertificate(certs) {
      showLoading('Saving certificate...');
      try {
        await window.portfolioData.saveCertificates(certs);
        await renderCertificates();
        $('#certModal').modal('hide');
      } catch (err) {
        alert('Save failed: ' + err.message);
      }
      hideLoading();
    }

    // ---------- PROJECT MODAL ----------
    async function openProjectModal(projectId = null) {
      const isEdit = projectId !== null;
      document.getElementById('projectModalTitle').innerText = isEdit ? 'Edit Project' : 'New Project';
      if (isEdit) {
        const projects = await window.portfolioData.loadProjects();
        const proj = projects[projectId];
        if (proj) {
          document.getElementById('projectId').value = projectId;
          document.getElementById('projTitle').value = proj.title;
          document.getElementById('projController').value = proj.controllerType;
          document.getElementById('projType').value = proj.projectType || '';
          document.getElementById('projVersion').value = proj.deltaVVersion || '';
          document.getElementById('projCabinet').value = proj.cabinetCount;
          document.getElementById('projLocation').value = proj.siteLocation || '';
          document.getElementById('projAI').value = proj.io.AI;
          document.getElementById('projAO').value = proj.io.AO;
          document.getElementById('projDI').value = proj.io.DI;
          document.getElementById('projDO').value = proj.io.DO;
          document.getElementById('projStart').value = proj.dates.start;
          document.getElementById('projFinish').value = proj.dates.finish;
          document.getElementById('projIFAT').value = proj.dates.ifat;
          document.getElementById('projCFAT').value = proj.dates.cfat;
          document.getElementById('projLead').value = proj.team.lead;
          document.getElementById('projEngineer').value = proj.team.engineer;
          document.getElementById('projTech').value = proj.team.technician;
          document.getElementById('projDesc').value = proj.description;
          document.getElementById('projGraphType').value = proj.graphType;
          imgContainer.innerHTML = '';
          if (proj.selectedImages && proj.selectedImages.length) {
            proj.selectedImages.forEach(img => addImageRow(img.url, img.caption));
          }
        }
      } else {
        document.getElementById('projectId').value = '';
        ['projTitle','projLocation','projLead','projEngineer','projTech','projDesc','projVersion'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('projController').value = 'MD';
        document.getElementById('projType').value = '';
        document.getElementById('projCabinet').value = 1;
        document.getElementById('projAI').value = 0;
        document.getElementById('projAO').value = 0;
        document.getElementById('projDI').value = 0;
        document.getElementById('projDO').value = 0;
        document.getElementById('projGraphType').value = 'bar';
        ['projStart','projFinish','projIFAT','projCFAT'].forEach(id => document.getElementById(id).value = '');
        imgContainer.innerHTML = '';
      }
      $('#projectModal').modal('show');
    }

    document.getElementById('projectForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const projectId = document.getElementById('projectId').value;
      const newId = projectId || ('proj_' + Date.now());
      const imgGroups = document.querySelectorAll('#imagesContainer .image-input-group');
      const selectedImages = [];
      imgGroups.forEach(group => {
        const urlInput = group.querySelector('.img-url-input');
        const capInput = group.querySelector('.img-caption-input');
        if (urlInput && urlInput.value) {
          selectedImages.push({ url: urlInput.value, caption: capInput.value });
        }
      });
      const project = {
        id: newId,
        title: document.getElementById('projTitle').value,
        controllerType: document.getElementById('projController').value,
        projectType: document.getElementById('projType').value || 'Other',
        deltaVVersion: document.getElementById('projVersion').value,
        cabinetCount: parseInt(document.getElementById('projCabinet').value) || 0,
        io: {
          AI: parseInt(document.getElementById('projAI').value) || 0,
          AO: parseInt(document.getElementById('projAO').value) || 0,
          DI: parseInt(document.getElementById('projDI').value) || 0,
          DO: parseInt(document.getElementById('projDO').value) || 0
        },
        dates: {
          start: document.getElementById('projStart').value,
          finish: document.getElementById('projFinish').value,
          ifat: document.getElementById('projIFAT').value,
          cfat: document.getElementById('projCFAT').value
        },
        siteLocation: document.getElementById('projLocation').value,
        team: {
          lead: document.getElementById('projLead').value,
          engineer: document.getElementById('projEngineer').value,
          technician: document.getElementById('projTech').value
        },
        description: document.getElementById('projDesc').value,
        graphType: document.getElementById('projGraphType').value,
        selectedImages
      };

      await safeSaveProject(project);
    });

    // ---------- CERTIFICATE MODAL ----------
    async function openCertModal(index = null) {
      const certs = await window.portfolioData.loadCertificates();
      const isEdit = index !== null && certs[index];
      document.getElementById('certModalTitle').innerText = isEdit ? 'Edit Certificate' : 'New Certificate';
      if (isEdit) {
        const cert = certs[index];
        document.getElementById('certIndex').value = index;
        document.getElementById('certTitle').value = cert.title;
        document.getElementById('certIssuer').value = cert.issuer;
        document.getElementById('certDate').value = cert.date;
        document.getElementById('certLink').value = cert.link || '';
        document.getElementById('certThumb').value = cert.thumbnail || '';
        updateThumbPreview(cert.thumbnail);
      } else {
        document.getElementById('certIndex').value = '';
        document.getElementById('certTitle').value = '';
        document.getElementById('certIssuer').value = '';
        document.getElementById('certDate').value = '';
        document.getElementById('certLink').value = '';
        document.getElementById('certThumb').value = '';
        updateThumbPreview('');
      }
      $('#certModal').modal('show');
    }

    function updateThumbPreview(url) {
      const preview = document.getElementById('thumbPreview');
      if (url) { preview.src = url; preview.style.display = 'inline-block'; }
      else preview.style.display = 'none';
    }

    document.getElementById('certThumb').addEventListener('input', e => updateThumbPreview(e.target.value));

    document.getElementById('certForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const certs = await window.portfolioData.loadCertificates();
      const idx = document.getElementById('certIndex').value;
      const newCert = {
        id: (idx !== '' && certs[idx]) ? certs[idx].id : ('cert_' + Date.now()),
        title: document.getElementById('certTitle').value,
        issuer: document.getElementById('certIssuer').value,
        date: document.getElementById('certDate').value,
        link: document.getElementById('certLink').value,
        thumbnail: document.getElementById('certThumb').value
      };
      if (idx !== '' && certs[idx]) certs[idx] = newCert;
      else certs.push(newCert);

      await safeSaveCertificate(certs);
    });

    // ---------- USER MANAGEMENT (Admin only) ----------
    const isAdmin = window.APP_CONFIG.adminUsers && window.APP_CONFIG.adminUsers.includes(user.username);
    if (isAdmin) {
      document.getElementById('usersTabNav').style.display = 'block';
      document.getElementById('refreshUsersBtn').addEventListener('click', loadUsers);
      loadUsers();
    }

    async function loadUsers() {
      showLoading('Loading users...');
      const container = document.getElementById('usersList');
      try {
        const usernames = await window.AccountManager.listUsers(user.pat);
        const blocked = await window.AccountManager.getBlockedUsers();
        container.innerHTML = '';
        if (usernames.length === 0) {
          container.innerHTML = '<div class="empty-state"><i class="fa fa-users"></i><h5>No registered users yet.</h5></div>';
        } else {
          for (const username of usernames) {
            const isBlocked = blocked.includes(username);
            let stats = { projects: 0, certificates: 0 };
            try {
              stats = await window.AccountManager.getUserStats(username, user.pat);
            } catch(e) {}

            const card = document.createElement('div');
            card.className = 'card mb-2';
            card.innerHTML = `
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center">
                  <div>
                    <strong>${window.escapeHtml(username)}</strong>
                    ${isBlocked ? '<span class="badge badge-danger ml-2">Blocked</span>' : '<span class="badge badge-success ml-2">Active</span>'}
                    <div class="small text-muted">
                      Projects: ${stats.projects} | Certificates: ${stats.certificates}
                    </div>
                  </div>
                  <div>
                    <button class="btn btn-sm ${isBlocked ? 'btn-success' : 'btn-warning'} toggle-block-btn" data-username="${username}">
                      ${isBlocked ? 'Unblock' : 'Block'}
                    </button>
                    <button class="btn btn-sm btn-danger delete-user-btn" data-username="${username}">Delete</button>
                  </div>
                </div>
              </div>`;
            container.appendChild(card);
          }

          document.querySelectorAll('.toggle-block-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              const username = btn.dataset.username;
              const block = !blocked.includes(username);
              if (!confirm(`Are you sure you want to ${block ? 'block' : 'unblock'} "${username}"?`)) return;
              showLoading(`${block ? 'Blocking' : 'Unblocking'} user...`);
              try {
                await window.AccountManager.toggleBlock(username, block, user.pat);
                await loadUsers();
              } catch(err) {
                hideLoading();
                alert('Failed: ' + err.message);
              }
            });
          });

          document.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              const username = btn.dataset.username;
              if (!confirm(`Delete all data for "${username}"? This cannot be undone.`)) return;
              showLoading('Deleting user...');
              try {
                await window.AccountManager.deleteUser(username, user.pat);
                await loadUsers();
              } catch(err) {
                hideLoading();
                alert('Failed: ' + err.message);
              }
            });
          });
        }
      } catch (err) {
        container.innerHTML = `<div class="alert alert-danger">Unable to load users: ${err.message}</div>`;
      }
      hideLoading();
    }

    // ---------- BUTTON HANDLERS ----------
    document.getElementById('addProjectBtn').addEventListener('click', () => openProjectModal());
    document.getElementById('addCertBtn').addEventListener('click', () => openCertModal());
    document.getElementById('downloadDataBtn').addEventListener('click', () => window.portfolioData.exportData());
    document.getElementById('deleteAllProjectsBtn').addEventListener('click', async () => {
      if (confirm('Permanently delete ALL your projects?')) {
        showLoading('Deleting all projects...');
        try {
          await window.portfolioData.saveProjects({});
          await renderProjects();
        } catch (err) {
          alert('Failed: ' + err.message);
        }
        hideLoading();
      }
    });
    document.getElementById('syncProjectsBtn').addEventListener('click', async () => {
      showLoading('Syncing from GitHub...');
      await renderProjects();
      await renderCertificates();
      hideLoading();
      alert('Data refreshed.');
    });
    document.getElementById('deleteAllCertsBtn').addEventListener('click', async () => {
      if (confirm('Delete all certificates?')) {
        showLoading('Deleting all certificates...');
        try {
          await window.portfolioData.saveCertificates([]);
          await renderCertificates();
        } catch (err) {
          alert('Failed: ' + err.message);
        }
        hideLoading();
      }
    });
    document.getElementById('logoutBtn').addEventListener('click', () => {
      window.SessionManager.logout();
      window.location.href = 'login.html';
    });

    // Initial load
    await renderProjects();
    await renderCertificates();
    hideLoading();
  }
</script>

<script src="https://code.jquery.com/jquery-3.5.1.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/popper.js@1.16.0/dist/umd/popper.min.js"></script>
<script src="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/js/bootstrap.min.js"></script>
</body>
</html>
