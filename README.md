# Pulse Arena 2026

Juego online estilo "ultimo en pie" con:

- Intro animada en web.
- Registro/Login con JWT.
- Lobby con opciones (online, tutorial, privada, opciones, tienda, logout).
- Partidas online con hasta 100 jugadores por sala.
- Inicio de ronda desde 2 jugadores.
- Espectadores que esperan la siguiente ronda.
- Mapa grande, zona que se encoge cada 2 minutos, ataque pulse y dash.

## Stack

- Frontend: HTML/CSS/JS + Canvas.
- Realtime: Socket.IO.
- Backend: Node.js + Express.
- Base de datos: MongoDB (Mongoose).
- Deploy recomendado: Render.
- Repo: Git.

## Configuracion local

1. Copia `.env.example` a `.env`.
2. Ajusta `MONGODB_URI` y `JWT_SECRET`.
3. Instala dependencias:

```bash
npm install
```

4. Ejecuta:

```bash
npm start
```

5. Abre `http://localhost:3000`.

## Deploy en Render

- Crea un **Web Service** apuntando a este repo Git.
- Build command: `npm install`
- Start command: `npm start`
- Variables de entorno:
  - `MONGODB_URI`
  - `JWT_SECRET`
  - `PORT` (opcional, Render lo inyecta)

## Siguientes mejoras recomendadas

- Matchmaking dedicado y cola global.
- Sistema anti-cheat (validacion server-authoritative mas estricta).
- Persistencia de estadisticas por partida.
- Tienda real con inventario y cosmeticos.
- Reconexion y tolerancia a desconexiones.
