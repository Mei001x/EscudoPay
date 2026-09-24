/* =========================================================
   DATA SIMULADA — reemplazar por una llamada real a la API
   cuando tenga el backend conectado 
   
   ========================================================= */
const BUSCADOS = [
  {
    id: 1,
    alias: "Alias 'El Cóndor'",
    departamento: 'Lima',
    delito: 'Extorsión',
    descripcion: 'Cobro de cupo a comerciantes del Cercado de Lima.',
    recompensa: 'S/ 5,000',
    estado: 'Prófugo',
    sexo: 'Masculino',
    lugarRQ: 'Lima',
    delitoDetalle: 'Extorsión agravada en banda organizada',
  },
  {
    id: 2,
    alias: "Alias 'La Serpiente'",
    departamento: 'Arequipa',
    delito: 'Extorsión',
    descripcion: 'Amenazas a transportistas de la zona sur.',
    recompensa: 'S/ 3,000',
    estado: 'Prófugo',
    sexo: 'Femenino',
    lugarRQ: 'Arequipa',
    delitoDetalle: 'Extorsión con amenaza de daño físico',
  },
  {
    id: 3,
    alias: "Alias 'El Búho'",
    departamento: 'La Libertad',
    delito: 'Sicariato',
    descripcion: 'Vinculado a ataques armados por encargo.',
    recompensa: 'S/ 10,000',
    estado: 'Prófugo',
    sexo: 'Masculino',
    lugarRQ: 'Trujillo',
    delitoDetalle: 'Sicariato / organización criminal',
  },
  {
    id: 4,
    alias: "Alias 'Fantasma 23'",
    departamento: 'Lima',
    delito: 'Extorsión',
    descripcion: 'Cobro de cupo a negocios de construcción.',
    recompensa: 'S/ 4,500',
    estado: 'Prófugo',
    sexo: 'Masculino',
    lugarRQ: 'Lima Este',
    delitoDetalle: 'Extorsión agravada',
  },
  {
    id: 5,
    alias: "Alias 'El Toro'",
    departamento: 'Piura',
    delito: 'Cobro de cupo',
    descripcion: 'Exige pagos semanales a mototaxistas.',
    recompensa: 'S/ 2,500',
    estado: 'Prófugo',
    sexo: 'Masculino',
    lugarRQ: 'Piura',
    delitoDetalle: 'Extorsión / cobro de cupo',
  },
  {
    id: 6,
    alias: "Alias 'La Sombra'",
    departamento: 'Callao',
    delito: 'Extorsión',
    descripcion: 'Amenazas a comerciantes del mercado central.',
    recompensa: 'S/ 6,000',
    estado: 'Prófugo',
    sexo: 'Femenino',
    lugarRQ: 'Callao',
    delitoDetalle: 'Extorsión agravada en banda organizada',
  },
];

let currentTarget = null;
const uploaded = { images: [], audio: [], video: [] };

/* =========================================================
   NAVEGACIÓN ENTRE VISTAS
   ========================================================= */
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelector(`[data-view="${name}"]`).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =========================================================
   RELOJ 
   ========================================================= */
function startClock(el) {
  if (!el) return;
  const tick = () => { el.textContent = new Date().toTimeString().slice(0, 8); };
  tick();
  setInterval(tick, 1000);
}
startClock(document.getElementById('clock'));
startClock(document.getElementById('clock2'));

/* =========================================================
   VISTA 1 → SELECCIÓN DE PERFIL
   ========================================================= */
document.getElementById('btnPnp').addEventListener('click', () => showView('restricted'));
document.getElementById('btnBackFromRestricted').addEventListener('click', () => showView('profile'));
document.getElementById('btnInformante').addEventListener('click', () => {
  renderFilters();
  renderGrid();
  showView('list');
});

/* =========================================================
   VISTA 3 → LISTA DE BUSCADOS
   ========================================================= */
function uniqueValues(key) {
  return [...new Set(BUSCADOS.map((b) => b[key]))].sort();
}

function renderFilters() {
  const deptoSelect = document.getElementById('filterDepto');
  const delitoSelect = document.getElementById('filterDelito');
  if (deptoSelect.dataset.filled) return;

  uniqueValues('departamento').forEach((d) => {
    const opt = document.createElement('option');
    opt.value = d; opt.textContent = d;
    deptoSelect.appendChild(opt);
  });
  uniqueValues('delito').forEach((d) => {
    const opt = document.createElement('option');
    opt.value = d; opt.textContent = d;
    delitoSelect.appendChild(opt);
  });
  deptoSelect.dataset.filled = '1';
}

function renderGrid() {
  const grid = document.getElementById('wantedGrid');
  const empty = document.getElementById('emptyState');
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const depto = document.getElementById('filterDepto').value;
  const delito = document.getElementById('filterDelito').value;

  const filtrados = BUSCADOS.filter((b) => {
    const matchQ = !q || b.alias.toLowerCase().includes(q) || b.descripcion.toLowerCase().includes(q);
    const matchDepto = !depto || b.departamento === depto;
    const matchDelito = !delito || b.delito === delito;
    return matchQ && matchDepto && matchDelito;
  });

  grid.innerHTML = '';
  empty.style.display = filtrados.length ? 'none' : 'block';

  filtrados.forEach((b) => {
    const card = document.createElement('button');
    card.className = 'wanted-card';
    card.innerHTML = `
      <span class="wanted-tag">${b.departamento}</span>
      <span class="avatar-icon"><span class="head"></span><span class="body"></span></span>
      <div class="wanted-name">${b.alias}</div>
      <div class="wanted-desc">${b.descripcion}</div>
    `;
    card.addEventListener('click', () => openDetail(b.id));
    grid.appendChild(card);
  });
}

document.getElementById('searchInput').addEventListener('input', renderGrid);
document.getElementById('filterDepto').addEventListener('change', renderGrid);
document.getElementById('filterDelito').addEventListener('change', renderGrid);
document.getElementById('btnLogout').addEventListener('click', () => showView('profile'));

/* =========================================================
   VISTA 4 → DETALLE DEL BUSCADO
   ========================================================= */
function openDetail(id) {
  const b = BUSCADOS.find((x) => x.id === id);
  if (!b) return;
  currentTarget = b;

  document.getElementById('detailName').textContent = b.alias;
  document.getElementById('infoEstado').textContent = b.estado;
  document.getElementById('infoSexo').textContent = b.sexo;
  document.getElementById('infoLugar').textContent = b.lugarRQ;
  document.getElementById('infoDelito').textContent = b.delitoDetalle;
  document.getElementById('infoDesc').textContent = b.descripcion;
  document.getElementById('infoRecompensa').textContent = b.recompensa;

  showView('detail');
}

document.getElementById('btnBackToList').addEventListener('click', () => showView('list'));

/* =========================================================
   VISTA 5 → FORMULARIO DE REPORTE
   ========================================================= */
document.getElementById('btnReport').addEventListener('click', () => {
  document.getElementById('reportTargetTag').textContent = currentTarget ? currentTarget.alias : '—';
  resetReportForm();
  showView('report');
});
document.getElementById('btnBackFromReport').addEventListener('click', () => showView('detail'));

const reportText = document.getElementById('reportText');
const charCount = document.getElementById('charCount');
reportText.addEventListener('input', () => { charCount.textContent = reportText.value.length; });

function wireUpload(boxId, inputId, countId, bucket) {
  const box = document.getElementById(boxId);
  const input = document.getElementById(inputId);
  const countEl = document.getElementById(countId);
  box.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    uploaded[bucket] = Array.from(input.files);
    countEl.textContent = uploaded[bucket].length ? `${uploaded[bucket].length} archivo(s)` : '';
  });
}
wireUpload('uploadImages', 'fileImages', 'countImages', 'images');
wireUpload('uploadAudio', 'fileAudio', 'countAudio', 'audio');
wireUpload('uploadVideo', 'fileVideo', 'countVideo', 'video');

function resetReportForm() {
  reportText.value = '';
  charCount.textContent = '0';
  ['images', 'audio', 'video'].forEach((k) => { uploaded[k] = []; });
  document.getElementById('countImages').textContent = '';
  document.getElementById('countAudio').textContent = '';
  document.getElementById('countVideo').textContent = '';
  document.getElementById('uploadProgress').classList.remove('show');
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('progressPct').textContent = '0%';
  document.getElementById('btnSubmitReport').disabled = false;
  document.getElementById('btnSubmitReport').textContent = 'Subir información (todo)';
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

document.getElementById('btnSubmitReport').addEventListener('click', async () => {
  if (!reportText.value.trim() && !uploaded.images.length && !uploaded.audio.length && !uploaded.video.length) {
    reportText.focus();
    return;
  }

  const btn = document.getElementById('btnSubmitReport');
  const wrap = document.getElementById('uploadProgress');
  const fill = document.getElementById('progressFill');
  const pct = document.getElementById('progressPct');

  btn.disabled = true;
  btn.textContent = 'Enviando…';
  wrap.classList.add('show');

  /*
   * TODO backend: aquí es donde se arma el FormData real y se hace el
   * POST a tu endpoint, algo como:
   *
   * const form = new FormData();
   * form.append('texto', reportText.value);
   * form.append('buscadoId', currentTarget.id);
   * uploaded.images.forEach(f => form.append('imagenes', f));
   * uploaded.audio.forEach(f => form.append('audios', f));
   * uploaded.video.forEach(f => form.append('videos', f));
   * await fetch('/api/reportes', { method: 'POST', body: form });
   *
   * Por ahora se simula el progreso para la demo.
   */
  const pasos = [30, 65, 100];
  for (const p of pasos) {
    fill.style.width = p + '%';
    pct.textContent = p + '%';
    await wait(600);
  }
  await wait(400);

  showView('thanks');
});

document.getElementById('btnBackToListFromThanks').addEventListener('click', () => {
  renderGrid();
  showView('list');
});

/* Vista inicial */
showView('profile');