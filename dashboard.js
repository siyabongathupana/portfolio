// dashboard.js - Admin dashboard functionality

function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m] || m); }

// Image compression same as before
function compressImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Image load error'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

// Image UI
const imageContainer = document.getElementById('imagesContainer');
const dropZone = document.getElementById('imageDropZone');
const fileInput = document.getElementById('imageFileInput');

function handleFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    compressImage(file).then(compressedDataUrl => {
      addImageRow(compressedDataUrl, '');
    }).catch(err => {
      alert('Could not process image: ' + file.name);
    });
  }
}

function addImageRow(url = '', caption = '') {
  const placeholder = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ddd"/><text x="50%" y="50%" font-size="14" fill="#999" text-anchor="middle" dy=".3em">No Img</text></svg>');
  const row = document.createElement('div');
  row.className = 'image-input-group';
  row.innerHTML = `
    <img src="${url || placeholder}" class="img-preview-thumb" onerror="this.src='${placeholder}'">
    <div class="img-details">
      <input type="text" class="form-control img-url-input" placeholder="Image URL (auto-filled)" value="${escapeHtml(url)}" readonly style="display:none;">
      <input type="text" class="form-control img-caption-input" placeholder="Caption" value="${escapeHtml(caption)}">
      <label class="local-upload-btn" style="cursor:pointer; color:#2fc7ff; display:inline-block; margin-top:5px;">
        <i class="fa fa-folder-open"></i> Change
        <input type="file" accept="image/*" style="display:none;" onchange="window.updateImageRow(this)">
      </label>
    </div>
    <i class="fa fa-times-circle remove-img-btn" onclick="this.closest('.image-input-group').remove()"></i>
  `;
  imageContainer.appendChild(row);
}

function clearImages() {
  imageContainer.innerHTML = '';
}

function renderExistingImages(images) {
  clearImages();
  if (images && images.length) {
    images.forEach(img => addImageRow(img.url, img.caption));
  }
}

window.updateImageRow = function(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;
  compressImage(file).then(compressedDataUrl => {
    const row = fileInput.closest('.image-input-group');
    row.querySelector('.img-url-input').value = compressedDataUrl;
    row.querySelector('.img-preview-thumb').src = compressedDataUrl;
  }).catch(err => {
    alert('Failed to update image');
  });
};

window.handleCertThumbUpload = function(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;
  compressImage(file, 300, 200, 0.6).then(compressed => {
    document.getElementById('certThumb').value = compressed;
    const preview = document.getElementById('thumbPreview');
    preview.src = compressed;
    preview.style.display = 'inline-block';
  }).catch(err => {
    alert('Thumbnail processing failed');
  });
};

dropZone.addEventListener('click', () => fileInput.click());
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, e => {
    e.preventDefault();
    e.stopPropagation();
  });
});
dropZone.addEventListener('dragover', () => dropZone.classList.add('dragover'));
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  dropZone.classList.remove('dragover');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (files.length) handleFiles(files);
});
fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files);
  if (files.length) {
    handleFiles(files);
    fileInput.value = '';
  }
});

// Render functions
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
          <h5>${escapeHtml(proj.title)}</h5>
          <div>
            <button class="btn btn-sm btn-outline-primary edit-project" data-id="${id}">Edit</button>
            <button class="btn btn-sm btn-outline-danger delete-project" data-id="${id}">Delete</button>
          </div>
        </div>
        <p><strong>Controller:</strong> ${proj.controllerType} | <strong>Cabinets:</strong> ${proj.cabinetCount} | <strong>Location:</strong> ${proj.siteLocation || ''}</p>
        <small>${escapeHtml(proj.description.substring(0, 120))}...</small>
      </div>
    `;
    container.appendChild(card);
  }
  document.querySelectorAll('.edit-project').forEach(btn => btn.addEventListener('click', () => openProjectModal(btn.dataset.id)));
  document.querySelectorAll('.delete-project').forEach(btn => btn.addEventListener('click', async () => {
    if (confirm('Delete this project?')) {
      const projs = await window.portfolioData.loadProjects();
      delete projs[btn.dataset.id];
      await window.portfolioData.saveProjects(projs);
      renderProjects();
    }
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
        <div><strong>${escapeHtml(cert.title)}</strong> - ${escapeHtml(cert.issuer)} (${cert.date})</div>
        <div>
          <button class="btn btn-sm btn-outline-primary edit-cert" data-index="${idx}">Edit</button>
          <button class="btn btn-sm btn-outline-danger delete-cert" data-index="${idx}">Delete</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
  document.querySelectorAll('.edit-cert').forEach(btn => btn.addEventListener('click', () => openCertModal(parseInt(btn.dataset.index))));
  document.querySelectorAll('.delete-cert').forEach(btn => btn.addEventListener('click', async () => {
    if (confirm('Delete this certificate?')) {
      const certsData = await window.portfolioData.loadCertificates();
      certsData.splice(parseInt(btn.dataset.index), 1);
      await window.portfolioData.saveCertificates(certsData);
      renderCertificates();
    }
  }));
}

// Modals
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
      renderExistingImages(proj.selectedImages);
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
    clearImages();
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
  const projectType = document.getElementById('projType').value || 'Other';
  const project = {
    id: newId,
    title: document.getElementById('projTitle').value,
    controllerType: document.getElementById('projController').value,
    projectType: projectType,
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
  try {
    const allProjects = await window.portfolioData.loadProjects();
    allProjects[newId] = project;
    await window.portfolioData.saveProjects(allProjects);
    $('#projectModal').modal('hide');
    renderProjects();
    alert('Project saved and synced to GitHub!');
  } catch (err) {
    alert('Saving failed: ' + err.message);
  }
});

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
  if (url) {
    preview.src = url;
    preview.style.display = 'inline-block';
  } else {
    preview.style.display = 'none';
  }
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
  try {
    if (idx !== '' && certs[idx]) {
      certs[idx] = newCert;
    } else {
      certs.push(newCert);
    }
    await window.portfolioData.saveCertificates(certs);
    $('#certModal').modal('hide');
    renderCertificates();
    alert('Certificate saved and synced!');
  } catch (err) {
    alert('Save failed: ' + err.message);
  }
});

// Buttons
document.getElementById('addProjectBtn').addEventListener('click', () => openProjectModal());
document.getElementById('addCertBtn').addEventListener('click', () => openCertModal());
document.getElementById('downloadDataBtn').addEventListener('click', () => window.portfolioData.exportData());
document.getElementById('deleteAllProjectsBtn').addEventListener('click', async () => {
  if (confirm('Permanently delete ALL your projects?')) {
    await window.portfolioData.saveProjects({});
    renderProjects();
  }
});
document.getElementById('syncProjectsBtn').addEventListener('click', async () => {
  await renderProjects();
  await renderCertificates();
  alert('Data refreshed from GitHub.');
});
document.getElementById('deleteAllCertsBtn').addEventListener('click', async () => {
  if (confirm('Delete all certificates?')) {
    await window.portfolioData.saveCertificates([]);
    renderCertificates();
  }
});
document.getElementById('logoutBtn').addEventListener('click', () => {
  SessionManager.logout();
  window.location.href = 'login.html';
});

// Initial render
renderProjects();
renderCertificates();