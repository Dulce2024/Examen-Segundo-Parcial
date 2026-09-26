require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const Database = require('better-sqlite3');

const JWT_SECRET = process.env.JWT_SECRET || 'copart_secret_dev';
const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ---------------- Base de datos ----------------
const db = new Database(path.join(__dirname, 'copart.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT, apellido TEXT, correo TEXT UNIQUE, telefono TEXT, password TEXT
);
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER,
  anio INTEGER, tipo TEXT, marca TEXT, modelo TEXT, motor TEXT,
  transmision TEXT, combustible TEXT, tren TEXT, cilindros INTEGER,
  danio TEXT,
  fotos TEXT,
  precio_base REAL, fecha_inicio TEXT, fecha_cierre TEXT,
  current_bid REAL DEFAULT 0, estado TEXT DEFAULT 'activa',
  FOREIGN KEY(owner_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER, user_id INTEGER, monto REAL, ts TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// ---------------- Usuarios de prueba ----------------
const seedUsers = [
  { nombre: 'Ana', apellido: 'García', correo: 'ana@demo.com', telefono: '50212345678', password: 'Demo1234!' },
  { nombre: 'Luis', apellido: 'Pérez', correo: 'luis@demo.com', telefono: '50287654321', password: 'Demo1234!' },
  { nombre: 'Carla', apellido: 'López', correo: 'carla@demo.com', telefono: '50255566677', password: 'Demo1234!' },
];
if (db.prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
  const ins = db.prepare('INSERT INTO users (nombre, apellido, correo, telefono, password) VALUES (?,?,?,?,?)');
  seedUsers.forEach(u => ins.run(u.nombre, u.apellido, u.correo, u.telefono, bcrypt.hashSync(u.password, 10)));
  console.log('Usuarios de prueba creados.');
}

// ---------------- Middleware ----------------
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

const upload = multer({ dest: path.join(__dirname, 'uploads') });

// ---------------- Rutas Auth ----------------
app.post('/api/auth/register', (req, res) => {
  const { nombre, apellido, correo, telefono, password } = req.body;
  if (!nombre || !apellido || !correo || !telefono || !password)
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  if (password.length < 6)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (nombre, apellido, correo, telefono, password) VALUES (?,?,?,?,?)')
      .run(nombre, apellido, correo, telefono, hash);
    res.json({ id: info.lastInsertRowid, nombre, apellido, correo });
  } catch {
    res.status(400).json({ error: 'El correo ya está registrado' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { correo, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE correo = ?').get(correo);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Credenciales inválidas' });
  const token = jwt.sign({ id: user.id, nombre: user.nombre, correo: user.correo }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, nombre: user.nombre, apellido: user.apellido, correo: user.correo } });
});

// ---------------- Vehículos ----------------
app.get('/api/vehicles', (req, res) => {
  const { marca, modelo, anio, combustible, danio, tren } = req.query;
  let q = 'SELECT * FROM vehicles WHERE 1=1';
  const params = [];
  if (marca) { q += ' AND marca LIKE ?'; params.push(`%${marca}%`); }
  if (modelo) { q += ' AND modelo LIKE ?'; params.push(`%${modelo}%`); }
  if (anio) { q += ' AND anio = ?'; params.push(anio); }
  if (combustible) { q += ' AND combustible = ?'; params.push(combustible); }
  if (danio) { q += ' AND danio = ?'; params.push(danio); }
  if (tren) { q += ' AND tren = ?'; params.push(tren); }
  q += ' ORDER BY id DESC';
  
  const rows = db.prepare(q).all(...params).map(v => {
    let fotos = [];
    try { fotos = JSON.parse(v.fotos || '[]'); } catch { fotos = [v.fotos]; }
    return { ...v, fotos };
  });
  res.json(rows);
});

// RUTA AGREGADA: Obtener detalle individual de un vehículo por ID
app.get('/api/vehicles/:id', (req, res) => {
  try {
    const v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
    if (!v) return res.status(404).json({ error: 'Vehículo no encontrado' });

    let fotos = [];
    try {
      fotos = JSON.parse(v.fotos || '[]');
    } catch {
      fotos = v.fotos ? [v.fotos] : [];
    }

    res.json({ ...v, fotos });
  } catch (err) {
    console.error('Error al obtener vehículo:', err);
    res.status(500).json({ error: 'Error del servidor al obtener el detalle' });
  }
});

app.post('/api/vehicles', auth, upload.array('fotos', 20), (req, res) => {
  const b = req.body;
  const required = ['anio', 'tipo', 'marca', 'modelo', 'motor', 'transmision', 'combustible', 'tren', 'cilindros', 'danio', 'precio_base', 'fecha_inicio', 'fecha_cierre'];
  for (const f of required) if (!b[f]) return res.status(400).json({ error: `Falta el campo: ${f}` });
  const files = (req.files || []).map(f => `/uploads/${f.filename}`);
  if (files.length < 5) return res.status(400).json({ error: 'Se requieren mínimo 5 fotografías' });

  const info = db.prepare(`INSERT INTO vehicles
    (owner_id, anio, tipo, marca, modelo, motor, transmision, combustible, tren, cilindros, danio, fotos, precio_base, fecha_inicio, fecha_cierre, current_bid, estado)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,'activa')`).run(
    req.user.id, b.anio, b.tipo, b.marca, b.modelo, b.motor, b.transmision, b.combustible, b.tren, b.cilindros,
    b.danio, JSON.stringify(files), b.precio_base, b.fecha_inicio, b.fecha_cierre
  );
  res.json({ id: info.lastInsertRowid });
});

app.put('/api/vehicles/:id', auth, (req, res) => {
  const v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'No encontrado' });
  if (v.owner_id !== req.user.id) return res.status(403).json({ error: 'No puedes editar una publicación que no es tuya' });
  const fields = ['anio', 'tipo', 'marca', 'modelo', 'motor', 'transmision', 'combustible', 'tren', 'cilindros', 'danio', 'precio_base', 'fecha_inicio', 'fecha_cierre'];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'Nada que actualizar' });
  db.prepare(`UPDATE vehicles SET ${updates.map(f => `${f} = ?`).join(', ')} WHERE id = ?`)
    .run(...updates.map(f => req.body[f]), req.params.id);
  res.json({ ok: true });
});

app.get('/api/my/vehicles', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM vehicles WHERE owner_id = ? ORDER BY id DESC').all(req.user.id)
    .map(v => {
      let fotos = [];
      try { fotos = JSON.parse(v.fotos || '[]'); } catch { fotos = [v.fotos]; }
      return { ...v, fotos };
    });
  res.json(rows);
});

// ---------------- Pujas ----------------
app.post('/api/vehicles/:id/bids', auth, (req, res) => {
  const v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'No encontrado' });
  const now = new Date();
  if (now < new Date(v.fecha_inicio)) return res.status(400).json({ error: 'La subasta aún no ha iniciado' });
  if (now > new Date(v.fecha_cierre) || v.estado !== 'activa') return res.status(400).json({ error: 'La oferta está cerrada' });

  const monto = parseFloat(req.body.monto);
  if (isNaN(monto)) return res.status(400).json({ error: 'Monto inválido' });
  if (monto < v.precio_base) return res.status(400).json({ error: `La oferta no puede ser menor al monto base (Q.${v.precio_base})` });
  const minimo = v.current_bid > 0 ? v.current_bid * 1.10 : v.precio_base;
  if (v.current_bid > 0 && monto < minimo)
    return res.status(400).json({ error: `Debes superar la oferta actual por al menos 10% (mínimo Q.${minimo.toFixed(2)})` });

  db.prepare('INSERT INTO bids (vehicle_id, user_id, monto) VALUES (?,?,?)').run(v.id, req.user.id, monto);
  db.prepare('UPDATE vehicles SET current_bid = ? WHERE id = ?').run(monto, v.id);

  io.to(`vehicle_${v.id}`).emit('bid_update', { vehicleId: v.id, monto, leaderId: req.user.id });
  res.json({ ok: true, current_bid: monto });
});

// ---------------- Socket.io ----------------
io.on('connection', socket => {
  socket.on('join_vehicle', vehicleId => socket.join(`vehicle_${vehicleId}`));
});

setInterval(() => {
  const now = new Date().toISOString();
  const expired = db.prepare("SELECT * FROM vehicles WHERE estado = 'activa' AND fecha_cierre < ?").all(now);
  expired.forEach(v => {
    const estado = v.current_bid >= v.precio_base && v.current_bid > 0 ? 'vendida' : 'desierta';
    db.prepare('UPDATE vehicles SET estado = ? WHERE id = ?').run(estado, v.id);
    io.to(`vehicle_${v.id}`).emit('auction_closed', { vehicleId: v.id, estado });
  });
}, 15000);

server.listen(PORT, () => console.log(`API + Frontend corriendo en puerto ${PORT}`));