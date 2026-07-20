// unified admin.js
const API_BASE = '/api/admin';
let globalState = null;
let currentNews = [];
let selectedNewsIdx = 0;
let currentPhotos = [];
let selectedPhoto = null;
let editorRecipe = {};

// Navigation
document.querySelectorAll('.nav-links a').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('.nav-links a').forEach(n => n.classList.remove('active'));
    a.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    document.getElementById(`page-${a.dataset.page}`).style.display = 'block';
    if (a.dataset.page === 'workbench') loadState();
    if (a.dataset.page === 'news') loadNews();
    if (a.dataset.page === 'photos') loadPhotos('learning');
    if (a.dataset.page === 'history') loadHistory();
    if (a.dataset.page === 'system') loadState();
  });
});

async function api(path, options = {}) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const data = await res.json().catch(()=>({}));
    throw new Error(data.error || res.statusText);
  }
  return res.json();
}

function showError(msg) {
  const b = document.getElementById('error-banner');
  b.textContent = msg;
  b.style.display = 'block';
  setTimeout(() => b.style.display = 'none', 5000);
}

// 1. State / Workbench
async function loadState() {
  try {
    globalState = await api(`${API_BASE}/state`);
    
    // Check consistency
    if (!globalState.consistent) {
       showError('状态不一致，禁止发布: ' + JSON.stringify(globalState.inconsistencies));
    }

    document.getElementById('workbench-last-refresh').textContent = new Date().toLocaleTimeString();
    
    // Workbench Status
    document.getElementById('wb-mode').textContent = globalState.active.contentMode;
    document.getElementById('wb-opmode').textContent = globalState.active.operatingMode;
    document.getElementById('wb-lastpub').textContent = globalState.lastPublication ? new Date(globalState.lastPublication.publishedAt).toLocaleString() : '未发布';
    document.getElementById('wb-nextswitch').textContent = globalState.schedule.nextSwitchAt ? new Date(globalState.schedule.nextSwitchAt).toLocaleString() : '-';
    document.getElementById('wb-device').textContent = globalState.device.connected ? '在线' : '离线';

    // System Status
    document.getElementById('sys-health-status').textContent = globalState.health.status;
    document.getElementById('sys-health-uptime').textContent = Math.floor(globalState.health.uptime);
    document.getElementById('sys-content-mode').textContent = globalState.active.contentMode;
    document.getElementById('sys-op-mode').textContent = globalState.active.operatingMode;
    document.getElementById('sys-snap-id').textContent = globalState.active.snapshotId || '-';
    document.getElementById('sys-frame-id').textContent = globalState.active.frameId || '-';
    document.getElementById('sys-frame-len').textContent = globalState.active.frameLength || '0';

    document.getElementById('sys-build-commit').textContent = globalState.build.commit;
    document.getElementById('sys-build-branch').textContent = globalState.build.branch;
    document.getElementById('sys-build-time').textContent = globalState.build.buildTime;
    document.getElementById('sys-build-version').textContent = globalState.build.serverVersion;

    // Load actual preview depending on content type
    const pimg = document.getElementById('workbench-preview-img');
    const perror = document.getElementById('workbench-preview-error');
    if (globalState.active.contentMode === 'news') {
        pimg.src = '/public/fake_news_preview.gif'; // Replace with actual frame API if we had one
        pimg.style.display = 'block';
        perror.style.display = 'none';
    } else if (globalState.active.contentMode === 'photo' && globalState.active.assetId) {
        const body = { assetId: globalState.active.assetId, recipe: {} }; // Ideally load canonical recipe
        const res = await fetch(`${API_BASE}/photo-eink-preview`, { method: 'POST', body: JSON.stringify(body) });
        if (res.ok) {
           const blob = await res.blob();
           pimg.src = URL.createObjectURL(blob);
           pimg.style.display = 'block';
           perror.style.display = 'none';
        } else {
           pimg.style.display = 'none';
           perror.style.display = 'flex';
        }
    }

  } catch(e) {
    showError('无法加载状态: ' + e.message);
  }
}
document.getElementById('btn-workbench-refresh').addEventListener('click', loadState);

// 2. News
async function loadNews() {
  try {
    const data = await api(`${API_BASE}/news`);
    currentNews = data.selected || [];
    renderNewsList();
  } catch(e) {
    showError(e.message);
  }
}

function renderNewsList() {
  const container = document.getElementById('news-list-container');
  container.innerHTML = '';
  currentNews.forEach((n, idx) => {
    const div = document.createElement('div');
    div.className = `news-list-item ${idx === selectedNewsIdx ? 'active' : ''}`;
    div.innerHTML = `<strong>${n.displayTitle || n.title || n.rawTitle || '无标题'}</strong><br><small>${n.source || '未知来源'}</small>`;
    div.addEventListener('click', () => {
      selectedNewsIdx = idx;
      renderNewsList();
      populateNewsEditor();
    });
    container.appendChild(div);
  });
  if (currentNews.length > 0) populateNewsEditor();
}

function populateNewsEditor() {
  const item = currentNews[selectedNewsIdx];
  if (!item) return;
  document.getElementById('news-editor-container').style.display = 'block';
  document.getElementById('news-edit-raw-title').value = item.rawTitle || item.title || '';
  document.getElementById('news-edit-display-title').value = item.displayTitle || item.title || '';
  document.getElementById('news-edit-raw-summary').value = item.rawSummary || item.summary || '';
  document.getElementById('news-edit-display-summary').value = item.displaySummary || item.summary || '';
  document.getElementById('news-edit-width-status').textContent = `宽度: ${item.titleWidthPx || '-'}/${item.titleMaxWidthPx || '-'}px`;
  document.getElementById('news-edit-review-status').textContent = `状态: ${item.titleStatus || '-'}`;
}

document.getElementById('btn-news-save').addEventListener('click', async () => {
  const item = currentNews[selectedNewsIdx];
  item.displayTitle = document.getElementById('news-edit-display-title').value;
  item.displaySummary = document.getElementById('news-edit-display-summary').value;
  try {
    const res = await api(`${API_BASE}/news/draft`, { method: 'POST', body: JSON.stringify({ items: currentNews }) });
    currentNews = res.items;
    renderNewsList();
    showError('保存成功');
  } catch (e) {
    showError(e.message);
  }
});

// 3. Photos
document.querySelectorAll('#page-photos .tab').forEach(t => {
  t.addEventListener('click', (e) => {
    document.querySelectorAll('#page-photos .tab').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    const target = e.target.dataset.target.replace('pool-', '');
    loadPhotos(target);
  });
});

async function loadPhotos(pool) {
  try {
    const data = await api(`${API_BASE}/assets?libraryType=${pool === 'learning' ? 'LEARNING' : 'CUSTOM'}`);
    currentPhotos = data.assets || [];
    // If we only have the old /photos route for now, map it:
    if (!data.assets) {
       const old = await api(`${API_BASE}/photos`);
       currentPhotos = old.photos.filter(p => pool === 'learning' ? p.poolType==='learning' : p.poolType==='custom');
    }
    renderPhotoGrid();
  } catch (e) {
    showError(e.message);
  }
}

function renderPhotoGrid() {
  const c = document.getElementById('photos-grid-container');
  c.innerHTML = '';
  document.getElementById('photo-inspector').style.display = 'none';
  document.getElementById('photo-empty-state').style.display = 'block';

  currentPhotos.forEach(p => {
    const div = document.createElement('div');
    div.className = 'photo-card';
    div.innerHTML = `<img src="${API_BASE}/photos/${p.id}/thumbnail">`;
    div.addEventListener('click', () => {
      document.querySelectorAll('.photo-card').forEach(n => n.classList.remove('active'));
      div.classList.add('active');
      selectedPhoto = p;
      showPhotoInspector();
    });
    c.appendChild(div);
  });
}

function showPhotoInspector() {
  if (!selectedPhoto) return;
  document.getElementById('photo-empty-state').style.display = 'none';
  const ins = document.getElementById('photo-inspector');
  ins.style.display = 'block';
  document.getElementById('inspector-thumb').src = `${API_BASE}/photos/${selectedPhoto.id}/thumbnail`;
  document.getElementById('insp-source').textContent = selectedPhoto.source || '-';
  document.getElementById('insp-type').textContent = selectedPhoto.poolType || '-';
  document.getElementById('insp-safe').textContent = selectedPhoto.safetyStatus || '-';
  document.getElementById('insp-review').textContent = selectedPhoto.reviewStatus || '-';
}

document.getElementById('btn-photo-edit').addEventListener('click', () => {
  if (!selectedPhoto) return;
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.getElementById('page-image-editor').style.display = 'block';
  editorRecipe = { fitMode: 'contain', zoom: 1, panX: 0, panY: 0, crop: {x:0, y:0, width:1, height:1}, rotate: 0, brightness: 1, contrast: 1, saturation: 1, gamma: 1, sharpen: 0, blur: 0 };
  updateEditorPreview();
});

// 4. Image Editor
const previewImg = document.getElementById('iedit-preview');
async function updateEditorPreview() {
  if (!selectedPhoto) return;
  // Sync UI
  document.getElementById('ip-fit').value = editorRecipe.fitMode;
  try {
    const res = await fetch(`${API_BASE}/photo-eink-preview`, {
      method: 'POST',
      body: JSON.stringify({ assetId: selectedPhoto.id, recipe: editorRecipe })
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    previewImg.src = URL.createObjectURL(blob);
  } catch (e) {
    showError('预览失败: ' + e.message);
  }
}

['fit', 'zoom', 'panX', 'panY', 'rot', 'bri', 'con', 'sat', 'gam', 'shp', 'blr'].forEach(k => {
  const el = document.getElementById('ip-' + k);
  if (el) el.addEventListener('change', (e) => {
    let val = e.target.type === 'range' || e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
    if (k === 'fit') editorRecipe.fitMode = val;
    if (k === 'zoom') editorRecipe.zoom = val;
    if (k === 'panX') editorRecipe.panX = val;
    if (k === 'panY') editorRecipe.panY = val;
    if (k === 'rot') editorRecipe.rotate = parseInt(val);
    if (k === 'bri') editorRecipe.brightness = val;
    if (k === 'con') editorRecipe.contrast = val;
    if (k === 'sat') editorRecipe.saturation = val;
    if (k === 'gam') editorRecipe.gamma = val;
    if (k === 'shp') editorRecipe.sharpen = val;
    if (k === 'blr') editorRecipe.blur = val;
    
    const valEl = document.getElementById(`ip-${k}-val`);
    if(valEl) valEl.textContent = val;

    updateEditorPreview();
  });
});

document.getElementById('btn-iedit-back').addEventListener('click', () => {
  document.getElementById('page-image-editor').style.display = 'none';
  document.getElementById('page-photos').style.display = 'block';
});

// 5. History
async function loadHistory() {
  try {
    const data = await api(`${API_BASE}/publish-history`);
    const tb = document.getElementById('history-tbody');
    tb.innerHTML = '';
    (data.history || []).forEach(h => {
      const tr = document.createElement('tr');
      const title = h.type === 'news' && h.news && h.news[0] ? h.news[0].displayTitle : '图片';
      tr.innerHTML = `
        <td>${h.status === 'active' ? '<b style="color:green">Active</b>' : 'Archived'}</td>
        <td>${h.type}</td>
        <td>${title}</td>
        <td>${new Date(h.publishedAt).toLocaleString()}</td>
        <td>${h.snapshotId || '-'}</td>
        <td>${h.frameId || '-'}</td>
        <td><button onclick="restoreHistory('${h.snapshotId}')">恢复</button></td>
      `;
      tb.appendChild(tr);
    });
  } catch (e) {
    showError(e.message);
  }
}

window.restoreHistory = async function(id) {
  if (!confirm('确认恢复该版本?')) return;
  try {
    await api(`${API_BASE}/rollback`, { method: 'POST', body: JSON.stringify({ snapshotId: id }) });
    showError('恢复成功');
    loadHistory();
    loadState(); // Refresh consistency
  } catch (e) {
    showError(e.message);
  }
}

document.getElementById('btn-restore-auto').addEventListener('click', async () => {
   try {
     await api(`${API_BASE}/override`, { method: 'DELETE' });
     loadState();
   } catch(e) { showError(e.message); }
});

// Load init
loadState();
