const API = ''; // mismo origen (el backend sirve el frontend)
let token = localStorage.getItem('token') || null;
let user = JSON.parse(localStorage.getItem('user') || 'null');
let socket = null;
let currentVehicle = null;
let timerInterval = null;

// ---------- Navegación ----------
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const targetView = document.getElementById('view-' + name);
  if (targetView) targetView.classList.add('active');
  document.querySelectorAll('.navBtn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'home') loadVehicles();
  if (name === 'mine') loadMine();
}

document.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => {
  const view = el.dataset.view;
  if ((view === 'publish' || view === 'mine') && !token) { 
    alert('Debes iniciar sesión para continuar.'); 
    showView('auth'); 
    return; 
  }
  showView(view);
}));

function renderAuthArea() {
  const el = document.getElementById('authArea');
  if (!el) return;
  if (user) {
    el.innerHTML = `<span style="color:#fff;margin-right:8px">Hola, ${user.nombre}</span><button class="navBtn" id="btnLogout">Salir</button>`;
    document.getElementById('btnLogout').onclick = () => { 
      localStorage.clear(); 
      token = null; 
      user = null; 
      renderAuthArea(); 
      showView('home'); 
    };
  } else {
    el.innerHTML = `<button class="navBtn" id="btnLoginNav">Ingresar / Registrarse</button>`;
    document.getElementById('btnLoginNav').onclick = () => showView('auth');
  }
}
renderAuthArea();

// ---------- Auth ----------
const formLogin = document.getElementById('formLogin');
if (formLogin) {
  formLogin.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const res = await fetch(API + '/api/auth/login', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(Object.fromEntries(fd)) 
    });
    const data = await res.json();
    if (!res.ok) return document.getElementById('authMsg').textContent = data.error;
    token = data.token; 
    user = data.user;
    localStorage.setItem('token', token); 
    localStorage.setItem('user', JSON.stringify(user));
    renderAuthArea(); 
    showView('home');
  });
}

const formRegister = document.getElementById('formRegister');
if (formRegister) {
  formRegister.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const res = await fetch(API + '/api/auth/register', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(Object.fromEntries(fd)) 
    });
    const data = await res.json();
    if (!res.ok) return document.getElementById('authMsg').textContent = data.error;
    document.getElementById('authMsg').style.color = 'green';
    document.getElementById('authMsg').textContent = 'Cuenta creada. Ahora inicia sesión.';
    e.target.reset();
  });
}

// ---------- Catálogo / filtros ----------
async function loadVehicles() {
  try {
    const params = new URLSearchParams();
    const getVal = id => document.getElementById(id) ? document.getElementById(id).value : '';
    const marca = getVal('fMarca');
    const modelo = getVal('fModelo');
    const anio = getVal('fAnio');
    const combustible = getVal('fCombustible');
    const danio = getVal('fDanio');

    if (marca) params.set('marca', marca);
    if (modelo) params.set('modelo', modelo);
    if (anio) params.set('anio', anio);
    if (combustible) params.set('combustible', combustible);
    if (danio) params.set('danio', danio);

    const res = await fetch(API + '/api/vehicles?' + params.toString());
    const rows = await res.json();
    const grid = document.getElementById('grid');
    if (!grid) return;

    if (!rows || !rows.length) { 
      grid.innerHTML = '<p class="empty">No hay vehículos disponibles.</p>'; 
      return; 
    }

    grid.innerHTML = rows.map(cardHTML).join('');
    grid.querySelectorAll('.card').forEach(c => c.addEventListener('click', () => openDetail(c.dataset.id)));
  } catch (err) {
    console.error('Error al cargar inventario:', err);
  }
}

function cardHTML(v) {
  const foto = (v.fotos && v.fotos.length) ? v.fotos[0] : '';
  return `<div class="card" data-id="${v.id}" style="cursor: pointer;">
    <img src="${foto}" onerror="this.style.display='none'">
    <div class="info">
      <h4>${v.marca} ${v.modelo} ${v.anio}</h4>
      <span class="dot ${v.danio}"></span>${labelDanio(v.danio)}
      <div class="price">Q. ${(v.current_bid > 0 ? v.current_bid : v.precio_base).toLocaleString()}</div>
      <small>${v.combustible} · ${v.tren} · ${v.estado === 'activa' ? 'En subasta' : v.estado}</small>
    </div>
  </div>`;
}

function labelDanio(d) { 
  if (d === 'verde') return 'Menor / Limpio';
  if (d === 'amarillo') return 'Medio / Reparable';
  return 'Severo / Salvamento'; 
}

const btnFilter = document.getElementById('btnFilter');
if (btnFilter) btnFilter.onclick = loadVehicles;

const btnClearFilter = document.getElementById('btnClearFilter');
if (btnClearFilter) {
  btnClearFilter.onclick = () => {
    ['fMarca', 'fModelo', 'fAnio', 'fCombustible', 'fDanio'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    loadVehicles();
  };
}

// ---------- Publicar ----------
const formPublish = document.getElementById('formPublish');
if (formPublish) {
  formPublish.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.getAll('fotos').filter(f => f.size).length < 5) {
      document.getElementById('publishMsg').textContent = 'Debes adjuntar mínimo 5 fotografías.';
      return;
    }
    const res = await fetch(API + '/api/vehicles', { 
      method: 'POST', 
      headers: { Authorization: 'Bearer ' + token }, 
      body: fd 
    });
    const data = await res.json();
    if (!res.ok) return document.getElementById('publishMsg').textContent = data.error;
    document.getElementById('publishMsg').style.color = 'green';
    document.getElementById('publishMsg').textContent = 'Vehículo publicado con éxito.';
    e.target.reset();
    setTimeout(() => showView('home'), 800);
  });
}

// ---------- Mis publicaciones ----------
async function loadMine() {
  const grid = document.getElementById('mineGrid');
  if (!grid) return;
  if (!token) { 
    grid.innerHTML = '<p class="empty">Inicia sesión para ver tus publicaciones.</p>'; 
    return; 
  }
  const res = await fetch(API + '/api/my/vehicles', { 
    headers: { Authorization: 'Bearer ' + token } 
  });
  const rows = await res.json();
  grid.innerHTML = rows.length ? rows.map(cardHTML).join('') : '<p class="empty">Aún no tienes publicaciones.</p>';
  grid.querySelectorAll('.card').forEach(c => c.addEventListener('click', () => openDetail(c.dataset.id)));
}

// ---------- Detalle + subasta en tiempo real ----------
async function openDetail(id) {
  try {
    const res = await fetch(API + '/api/vehicles/' + id);
    if (!res.ok) {
      alert('No se pudo cargar la información del vehículo.');
      return;
    }
    const v = await res.json();
    currentVehicle = v;
    renderDetail(v);
    showView('detail');

    if (socket) socket.disconnect();
    if (typeof io !== 'undefined') {
      socket = io();
      socket.emit('join_vehicle', v.id);
      socket.on('bid_update', data => {
        if (data.vehicleId != v.id) return;
        currentVehicle.current_bid = data.monto;
        updateBidPanel(data.leaderId === (user && user.id));
      });
      socket.on('auction_closed', data => {
        if (data.vehicleId != v.id) return;
        currentVehicle.estado = data.estado;
        updateBidPanel(false, true);
      });
    }
  } catch (err) {
    console.error('Error al abrir detalle:', err);
  }
}

function renderDetail(v) {
  let detailView = document.getElementById('view-detail');
  if (!detailView) {
    detailView = document.createElement('div');
    detailView.id = 'view-detail';
    detailView.className = 'view';
    const mainContainer = document.querySelector('main') || document.body;
    mainContainer.appendChild(detailView);
  }

  const fotos = (v.fotos && v.fotos.length) ? v.fotos : [''];

  detailView.innerHTML = `
    <button onclick="showView('home')" style="margin-bottom:15px; cursor:pointer; padding:8px 16px; background:#007bff; color:#fff; border:none; border-radius:4px;">← Volver al catálogo</button>
    <div id="detailContent">
      <div class="detailGrid" style="display:flex; gap:20px; flex-wrap:wrap;">
        <div class="carousel" style="flex:1; min-width:280px;">
          <img id="mainPhoto" src="${fotos[0]}" style="width:100%; max-height:350px; object-fit:cover; border-radius:8px;">
          <div class="thumbs" style="display:flex; gap:8px; margin-top:10px; overflow-x:auto;">
            ${fotos.map((f, i) => `<img src="${f}" class="${i === 0 ? 'active' : ''}" style="width:60px; height:60px; object-fit:cover; cursor:pointer; border-radius:4px;">`).join('')}
          </div>
        </div>
        <div class="specs" style="flex:1; min-width:280px;">
          <h2>${v.marca} ${v.modelo} (${v.anio})</h2>
          <p><strong>Daño:</strong> ${labelDanio(v.danio)}</p>
          <table style="width:100%; border-collapse:collapse; margin-bottom:15px;">
            <tr><td><strong>Tipo:</strong></td><td>${v.tipo}</td></tr>
            <tr><td><strong>Motor:</strong></td><td>${v.motor}</td></tr>
            <tr><td><strong>Transmisión:</strong></td><td>${v.transmision}</td></tr>
            <tr><td><strong>Combustible:</strong></td><td>${v.combustible}</td></tr>
            <tr><td><strong>Tren de manejo:</strong></td><td>${v.tren}</td></tr>
            <tr><td><strong>Cilindros:</strong></td><td>${v.cilindros}</td></tr>
          </table>
          <div class="bidBox" id="bidBox" style="background:#f4f6f8; padding:15px; border-radius:8px;"></div>
        </div>
      </div>
    </div>`;

  document.querySelectorAll('.thumbs img').forEach(t => t.onclick = () => {
    document.getElementById('mainPhoto').src = t.src;
  });

  updateBidPanel(false);
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => updateBidPanel(null, false, true), 1000);
}

function updateBidPanel(isLeader, closedNow, tickOnly) {
  const v = currentVehicle;
  const box = document.getElementById('bidBox');
  if (!box || !v) return;

  const now = new Date();
  const cierre = new Date(v.fecha_cierre);
  const inicio = new Date(v.fecha_inicio);
  const cerrada = v.estado !== 'activa' || now > cierre;
  const noIniciada = now < inicio;

  let badge = '';
  if (cerrada) badge = `<span class="badge cerrada" style="color:red; font-weight:bold;">Oferta cerrada — ${v.estado}</span>`;
  else if (isLeader === true) badge = `<span class="badge ganando" style="color:green; font-weight:bold;">¡Vas ganando esta subasta!</span>`;
  else if (isLeader === false && !tickOnly) badge = `<span class="badge superado" style="color:orange; font-weight:bold;">Tu oferta ha sido superada. ¡Haz tu oferta ahora antes de que termine el tiempo!</span>`;

  const restante = cerrada ? '' : `<div class="timer" style="font-size:1.1em; margin:10px 0;"><strong>${noIniciada ? 'Inicia en' : 'Cierra en'}:</strong> ${formatCountdown(noIniciada ? inicio - now : cierre - now)}</div>`;

  box.innerHTML = `
    <div class="current" style="font-size:1.3em; font-weight:bold;">Puja actual: Q. ${(v.current_bid > 0 ? v.current_bid : v.precio_base).toLocaleString()}</div>
    <small>Monto base: Q. ${v.precio_base.toLocaleString()}</small><br>
    ${badge}
    ${restante}
    ${(!cerrada && !noIniciada) ? `
      <div style="margin-top:10px;">
        <input type="number" id="bidAmount" placeholder="Tu oferta (Q.)" style="padding:6px; margin-right:5px;">
        <button id="btnBid" style="padding:6px 12px; background:#28a745; color:#fff; border:none; border-radius:4px; cursor:pointer;">Ofertar</button>
      </div>
      <p class="msg" id="bidMsg" style="color:red; margin-top:5px;"></p>` : ''}
  `;
  const btn = document.getElementById('btnBid');
  if (btn) btn.onclick = placeBid;
}

function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

async function placeBid() {
  if (!token) { alert('Debes iniciar sesión para ofertar.'); showView('auth'); return; }
  const monto = parseFloat(document.getElementById('bidAmount').value);
  const res = await fetch(API + `/api/vehicles/${currentVehicle.id}/bids`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ monto })
  });
  const data = await res.json();
  const msg = document.getElementById('bidMsg');
  if (!res.ok) { if (msg) msg.textContent = data.error; return; }
  currentVehicle.current_bid = data.current_bid;
  updateBidPanel(true);
}

// ---------- Inicio ----------
loadVehicles();