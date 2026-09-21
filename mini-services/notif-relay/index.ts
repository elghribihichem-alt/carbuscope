// CarbuScope — notif-relay (ports 3036 WebSocket + 3037 contrôle HTTP)
//
// Relais temps réel des notifications in-app : le moteur de veille et la
// publication de décrets POSTent sur http://localhost:3037/publish ; les
// portails enseigne connectés en WebSocket (room brand:{slug}) reçoivent
// l'événement « notification » instantanément — plus besoin d'attendre le
// polling 45 s du centre de notifications.
//
// Pourquoi deux ports dans un seul service : le client frontend DOIT se
// connecter via la passerelle avec io("/?XTransformPort=3036") et le path
// socket.io DOIT rester "/" — or engine.io intercepte alors TOUTES les
// requêtes HTTP du port (check = préfixe "/"). Les routes de contrôle vivent
// donc sur un second port (3037), interrogé en interne par le serveur Next.js
// et via la passerelle par le back-office.

import { createServer, type IncomingMessage, type ServerResponse } from "http"
import { Server } from "socket.io"

const WS_PORT = 3036
const HTTP_PORT = 3037
const startedAt = Date.now()
let publishedCount = 0

const sendJson = (res: ServerResponse, code: number, data: unknown) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" })
  res.end(JSON.stringify(data))
}

// ---------- Port 3037 : contrôle HTTP (status / publish) ----------

const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "content-type")
  if (req.method === "OPTIONS") {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url ?? "/", `http://localhost:${HTTP_PORT}`)

  if (req.method === "GET" && url.pathname === "/status") {
    sendJson(res, 200, {
      service: "notif-relay",
      ok: true,
      wsPort: WS_PORT,
      httpPort: HTTP_PORT,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      clients: io.engine.clientsCount,
      published: publishedCount,
    })
    return
  }

  if (req.method === "POST" && url.pathname === "/publish") {
    let body = ""
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString()
      if (body.length > 1_000_000) req.destroy()
    })
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}")
        if (typeof payload !== "object" || payload === null) throw new Error("object attendu")
        const brandSlug = typeof payload.brandSlug === "string" ? payload.brandSlug : null
        const room = brandSlug ? `brand:${brandSlug}` : "all"
        const receivers = io.sockets.adapter.rooms.get(room)?.size ?? 0
        io.to(room).emit("notification", { ...payload, relayedAt: new Date().toISOString() })
        publishedCount++
        console.log(`[publish] room=${room} receivers=${receivers} kind=${payload.kind ?? "?"} title=${String(payload.title ?? "").slice(0, 60)}`)
        sendJson(res, 200, { ok: true, room, receivers })
      } catch {
        sendJson(res, 400, { ok: false, error: "JSON invalide" })
      }
    })
    return
  }

  sendJson(res, 404, { ok: false, error: "route inconnue" })
})

// ---------- Port 3036 : WebSocket socket.io (path "/") ----------

// Serveur socket.io DÉTACHÉ du serveur HTTP de contrôle : io.listen(3036)
// crée son propre http server (toutes ses requêtes passent par engine.io).
const io = new Server({
  // NE PAS changer le path : le gateway Caddy route /?XTransformPort=3036
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on("connection", socket => {
  socket.on("subscribe", (brandSlug: unknown) => {
    if (typeof brandSlug !== "string" || !/^[\w-]{1,32}$/.test(brandSlug)) return
    void socket.join(`brand:${brandSlug}`)
    socket.emit("subscribed", { brandSlug })
    console.log(`[ws] ${socket.id} → room brand:${brandSlug}`)
  })
  socket.on("unsubscribe", (brandSlug: unknown) => {
    if (typeof brandSlug !== "string") return
    void socket.leave(`brand:${brandSlug}`)
  })
  socket.on("disconnect", () => {
    console.log(`[ws] ${socket.id} déconnecté`)
  })
})

httpServer.listen(HTTP_PORT, () => {
  console.log(`[notif-relay] Contrôle HTTP (status/publish) sur :${HTTP_PORT}`)
})

io.listen(WS_PORT)
console.log(`[notif-relay] WebSocket notifications CarbuScope en écoute sur :${WS_PORT}`)
