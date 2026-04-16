const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const cors = require("cors")({ origin: true });
const https = require("https");

setGlobalOptions({ maxInstances: 10 });

initializeApp();

const ADMIN_KEY = "Sob3rana@Admin2026";

exports.sendPushNotification = onRequest({ maxInstances: 10 }, (req, res) => {
  cors(req, res, async () => {
    // Preflight
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "POST");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Método no permitido" });
      return;
    }

    const { nombre, mensaje, adminKey, tipo: tipoRaw } = req.body;

    // 1. Verificar clave de admin
    if (adminKey !== ADMIN_KEY) {
      res.status(403).json({ error: "No autorizado" });
      return;
    }

    try {
      const db = getFirestore();
      const messaging = getMessaging();

      // 2. Leer todos los tokens de Firestore
      const tokensSnap = await db.collection("tokens").get();

      if (tokensSnap.empty) {
        res.json({ success: true, enviadas: 0 });
        return;
      }

      const tokenDocs = tokensSnap.docs
        .map(doc => ({ docId: doc.id, token: doc.data().token }))
        .filter(t => !!t.token);

      if (tokenDocs.length === 0) {
        res.json({ success: true, enviadas: 0 });
        return;
      }

      // 3. Construir payload según tipo
      const data = { nombre, mensaje };
      const configs = {
        novedades: {
          title: data.nombre ? `${data.nombre}, Valentina` : 'Soberana · 7D Novedades',
          body: data.mensaje || 'Nuevo contenido publicado en Novedades.',
          tag: 'novedades',
          data: { url: '/workbook/#tab-novedades', tipo: 'novedades' }
        },
        sistema: {
          title: data.nombre ? `${data.nombre}` : 'Soberana · Sistema',
          body: data.mensaje || 'Establece tu estándar para hoy.',
          tag: 'sistema',
          data: { url: '/workbook/#tab-inicio', tipo: 'sistema' }
        },
        inactividad: {
          title: '48 h sin configuración de sistema.',
          body: 'La gravedad del entorno está ganando terreno. Entra y recupera tu centro.',
          tag: 'inactividad',
          data: { url: '/workbook/', tipo: 'inactividad' }
        }
      };

      const tipo = tipoRaw && configs[tipoRaw] ? tipoRaw : 'novedades';
      const cfg = configs[tipo];

      // 4. Enviar en lotes de 500 (límite de FCM sendEachForMulticast)
      const BATCH_SIZE = 500;
      let enviadas = 0;
      const invalidTokenDocIds = [];

      for (let i = 0; i < tokenDocs.length; i += BATCH_SIZE) {
        const batch = tokenDocs.slice(i, i + BATCH_SIZE);
        const tokens = batch.map(t => t.token);

        const response = await messaging.sendEachForMulticast({
          tokens,
          data: {
            ...cfg.data,
            title: cfg.title,
            body: cfg.body,
            tag: cfg.tag,
            icon: '/workbook/icon-192.png',
            badge: '/workbook/icon-192.png'
          },
          android: {
            priority: 'high',
            notification: {
              color: tipo === 'novedades' ? '#5DAA7F'
                   : tipo === 'sistema'   ? '#8B1A2F'
                   : '#B8892A'
            }
          },
          webpush: { headers: { Urgency: 'high' } }
          // Sin campo "notification" — el SW controla el render completo
        });

        response.responses.forEach((r, idx) => {
          if (r.success) {
            enviadas++;
          } else {
            const code = r.error && r.error.code;
            if (
              code === "messaging/registration-token-not-registered" ||
              code === "messaging/invalid-registration-token" ||
              code === "messaging/invalid-argument"
            ) {
              invalidTokenDocIds.push(batch[idx].docId);
            }
          }
        });
      }

      // 5. Borrar tokens inválidos de Firestore
      if (invalidTokenDocIds.length > 0) {
        await Promise.all(
          invalidTokenDocIds.map(docId =>
            db.collection("tokens").doc(docId).delete()
          )
        );
      }

      res.json({ success: true, enviadas });

    } catch (e) {
      console.error("sendPushNotification error:", e);
      res.status(500).json({ error: e.message });
    }
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwr3Dtcs7ewrB8PGsdE0JRO7Ianw6FxFdN1KN12WQ_PGrzSseg98aUn0rr7T85uKs1K/exec";

function fetchEstado(email) {
  return new Promise((resolve, reject) => {
    const url = `${APPS_SCRIPT_URL}?action=estado&email=${encodeURIComponent(email)}`;
    const get = (targetUrl, redirects) => {
      if (redirects > 5) return reject(new Error("Too many redirects"));
      const mod = targetUrl.startsWith("https") ? https : require("http");
      mod.get(targetUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location, redirects + 1);
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error("Invalid JSON: " + data.slice(0, 100))); }
        });
      }).on("error", reject);
    };
    get(url, 0);
  });
}

// "jessicatovarmoda" → "Jessica"
function nombreDesdeEmail(email) {
  const parte = email.split("@")[0];
  const limpio = parte.split(/[\d._+-]/)[0];
  return limpio.charAt(0).toUpperCase() + limpio.slice(1).toLowerCase();
}

function buildMensaje(nombre, estado, seccionesCompletadas, vioQueSigue, fechaRegistro) {
  const ahora = Date.now();
  const msDesdeRegistro = fechaRegistro ? ahora - fechaRegistro.toMillis() : Infinity;
  const horas24 = 24 * 60 * 60 * 1000;

  // Caso: ya vio el CTA o completado+vioQueSigue → no enviar
  if (vioQueSigue && estado !== "completado") return null;
  if (estado === "completado" && vioQueSigue) return null;

  if (estado === "sin_iniciar" && msDesdeRegistro > horas24) {
    return {
      title: `${nombre}, tu entrenamiento te está esperando.`,
      body: "Abriste la puerta pero no entraste. El primer paso toma 3 minutos.",
      url: "/workbook/",
      tipo: "sistema"
    };
  }

  if (estado === "iniciando" || estado === "avanzando") {
    return {
      title: `${nombre}, tu sistema está incompleto.`,
      body: `Llevas ${seccionesCompletadas} de 11 secciones. Lo que construiste necesita base.`,
      url: "/workbook/",
      tipo: "sistema"
    };
  }

  if (estado === "completado" && !vioQueSigue) {
    return {
      title: `${nombre}, completaste el workshop.`,
      body: "Hay una dimensión que el workshop no toca. El 7D la abre.",
      url: "/workbook/",
      tipo: "sistema"
    };
  }

  return null;
}

async function enviarNotifIndividual(messaging, token, msg) {
  return messaging.send({
    token,
    data: {
      tipo: msg.tipo,
      title: msg.title,
      body: msg.body,
      tag: msg.tipo,
      url: msg.url,
      icon: "/workbook/icon-192.png",
      badge: "/workbook/icon-192.png"
    },
    android: {
      priority: "high",
      notification: { color: "#8B1A2F" }
    },
    webpush: { headers: { Urgency: "high" } }
  });
}

// ── checkAndNotify ────────────────────────────────────────────────────────────

exports.checkAndNotify = onRequest({ maxInstances: 10 }, (req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "POST, GET");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.status(204).send("");
      return;
    }

    // Auth: adminKey en body/query, o llamada desde Cloud Scheduler
    const adminKey = req.body?.adminKey || req.query?.adminKey;
    const esScheduler = req.headers["x-cloudscheduler"] === "true";
    if (!esScheduler && adminKey !== ADMIN_KEY) {
      res.status(403).json({ error: "No autorizado" });
      return;
    }

    try {
      const db = getFirestore();
      const messaging = getMessaging();
      const ahora = Timestamp.now();
      const HORAS_20 = 20 * 60 * 60 * 1000;

      const tokensSnap = await db.collection("tokens").get();
      if (tokensSnap.empty) {
        res.json({ success: true, procesadas: 0, enviadas: 0 });
        return;
      }

      let enviadas = 0;
      let skipped = 0;
      const resultados = [];

      for (const doc of tokensSnap.docs) {
        const data = doc.data();
        const email = doc.id;
        const token = data.token;

        if (!token || !email) { skipped++; continue; }

        // 1. Verificar throttle — máx 1 notif por 20 h
        const logRef = db.collection("notif_log").doc(email);
        const logSnap = await logRef.get();
        if (logSnap.exists) {
          const ultimoEnvio = logSnap.data().ultimoEnvio;
          if (ultimoEnvio && (ahora.toMillis() - ultimoEnvio.toMillis()) < HORAS_20) {
            resultados.push({ email, resultado: "skip_throttle" });
            skipped++;
            continue;
          }
        }

        // 2. Consultar Apps Script
        let estado;
        try {
          estado = await fetchEstado(email);
        } catch (e) {
          console.error(`[checkAndNotify] fetchEstado error para ${email}:`, e.message);
          resultados.push({ email, resultado: "error_fetch" });
          skipped++;
          continue;
        }

        if (!estado.ok) {
          resultados.push({ email, resultado: "no_encontrado" });
          skipped++;
          continue;
        }

        // 3. Decidir mensaje
        const nombre = nombreDesdeEmail(email);
        const msg = buildMensaje(
          nombre,
          estado.estado,
          estado.seccionesCompletadas || 0,
          estado.vioQueSigue,
          data.fecha || null
        );

        if (!msg) {
          resultados.push({ email, resultado: "skip_logica" });
          skipped++;
          continue;
        }

        // 4. Enviar
        try {
          await enviarNotifIndividual(messaging, token, msg);
          await logRef.set({ ultimoEnvio: ahora, tipo: msg.tipo });
          enviadas++;
          resultados.push({ email, resultado: "enviada", tipo: msg.tipo });
        } catch (e) {
          const code = e.errorInfo && e.errorInfo.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            await db.collection("tokens").doc(email).delete();
            resultados.push({ email, resultado: "token_invalido_borrado" });
          } else {
            console.error(`[checkAndNotify] send error para ${email}:`, e.message);
            resultados.push({ email, resultado: "error_send" });
          }
          skipped++;
        }
      }

      res.json({ success: true, procesadas: tokensSnap.size, enviadas, skipped, resultados });

    } catch (e) {
      console.error("checkAndNotify error:", e);
      res.status(500).json({ error: e.message });
    }
  });
});
