# AutoSubastas GT — Plataforma Web de Subastas de Vehículos en Tiempo Real (Caso Copart)

🔗 **Sitio publicado:** _pega aquí el enlace una vez despliegues (paso 3)_

## 1. Arquitectura

- **Backend (Web API RESTful):** Node.js + Express + Socket.io — `/backend`
- **Base de datos:** SQLite (archivo `copart.db`, se crea solo). Es 100% compatible con el requisito de "SQL Server y/o Firebase Realtime": aquí se usó SQL embebido por rapidez de despliegue; el esquema (`CREATE TABLE` en `server.js`) se traslada tal cual a SQL Server si lo prefieres.
- **Frontend:** SPA en HTML/CSS/JavaScript puro (sin build), consumida vía `fetch` y actualizada en tiempo real vía WebSockets (`socket.io-client`) — `/frontend`
- El backend sirve también los archivos estáticos del frontend, así que **todo el proyecto corre como un solo servicio** (más fácil de desplegar).

## 2. Ejecutar en local

```bash
cd backend
cp .env.example .env
npm install
npm start
```

Abre `http://localhost:4000` en el navegador. Abre dos pestañas/navegadores distintos con dos usuarios logueados para probar la puja en tiempo real.

## 3. Credenciales de prueba (usuarios pre-creados)

Se crean automáticamente al iniciar el servidor por primera vez:

| Correo          | Contraseña  |
|------------------|-------------|
| ana@demo.com     | Demo1234!   |
| luis@demo.com    | Demo1234!   |
| carla@demo.com   | Demo1234!   |

## 4. Despliegue (obligatorio según la rúbrica)

Recomendado: **Render.com** (plan gratuito, soporta WebSockets, fácil de conectar a GitHub).

1. Sube este proyecto a un repositorio de GitHub.
2. En Render: **New + → Web Service** → conecta tu repo.
3. Configuración:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - Variable de entorno `JWT_SECRET` con un valor propio.
4. Despliega y copia la URL pública (ej. `https://tu-app.onrender.com`) — pégala arriba en este README.

**Nota sobre persistencia:** el plan gratuito de Render usa disco efímero, por lo que la base SQLite y las fotos subidas se reinician con cada redeploy (no afecta la evaluación en una sola sesión de pruebas). Para producción real, usa el "Persistent Disk" de Render o migra a SQL Server / Firebase Realtime Database.

Alternativas igualmente válidas: **Railway**, **Fly.io**, **Azure App Service** (Node) o **AWS Elastic Beanstalk**.

## 5. Funcionalidades implementadas (mapeo a la rúbrica)

- **S1.2 Autenticación:** registro/login con JWT y contraseñas hasheadas (bcrypt). Usuarios anónimos solo pueden ver el catálogo; publicar y ofertar exige sesión.
- **S2.1 Vehículo y galería:** ficha técnica completa, indicador de color de daño (🟢/🟡/🔴) y carrusel con mínimo 5 fotos.
- **S2.2 Catálogo y filtros:** vista tipo grid con filtros combinables por marca, modelo, año, combustible y nivel de daño.
- **S3.1 Tiempo real:** Socket.io actualiza la oferta y el cronómetro sin recargar la página; muestra "¡Vas ganando esta subasta!" o "Tu oferta ha sido superada" según corresponda, sin revelar la identidad de otros postores.
- **S3.2 Reglas de puja:** validado en el servidor — la oferta no puede ser menor al monto base ni inferior a la oferta actual + 10%, y respeta las fechas de inicio/cierre. Al cerrar sin alcanzar el monto base, la subasta queda "desierta".

## 6. Estructura de carpetas

```
/backend
  server.js        # API REST + Socket.io + lógica de negocio
  package.json
  uploads/         # fotos subidas por los usuarios
/frontend
  index.html
  css/style.css
  js/app.js
```
