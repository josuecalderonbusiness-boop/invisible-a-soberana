const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
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

function toMs(fechaRegistro) {
  if (!fechaRegistro) return null;
  if (typeof fechaRegistro.toMillis === "function") return fechaRegistro.toMillis();
  if (fechaRegistro instanceof Date) return fechaRegistro.getTime();
  if (typeof fechaRegistro === "number") return fechaRegistro;
  if (typeof fechaRegistro === "string") return new Date(fechaRegistro).getTime();
  return null;
}

function buildMensaje(nombre, estado, seccionesCompletadas, vioQueSigue, fechaRegistro) {
  const ahora = Date.now();
  const fechaMs = toMs(fechaRegistro);
  const msDesdeRegistro = fechaMs ? ahora - fechaMs : Infinity;
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

// ── activarMasterclassSemanal ────────────────────────────────────────────────

exports.activarMasterclassSemanal = onSchedule(
  { schedule: "0 8 * * 1", timeZone: "America/Bogota", maxInstances: 1 },
  async () => {
    const db = getFirestore();
    const messaging = getMessaging();
    const ahora = Timestamp.now();

    const masterclassesSnap = await db
      .collection("masterclasses")
      .where("activada", "==", false)
      .where("activaEl", "<=", ahora)
      .get();

    if (masterclassesSnap.empty) {
      console.log("[activarMasterclassSemanal] Ninguna masterclass pendiente de activar.");
      return;
    }

    for (const doc of masterclassesSnap.docs) {
      const data = doc.data();
      const semana = data.semana;
      const titulo = data.titulo || `Semana ${semana}`;

      // 1. Marcar como activada
      await doc.ref.update({ activada: true });

      // 2. Leer tokens
      const tokensSnap = await db.collection("tokens").get();
      const tokens = tokensSnap.docs.map(d => d.data().token).filter(Boolean);

      if (tokens.length === 0) {
        console.log(`[activarMasterclassSemanal] Semana ${semana} activada — 0 tokens.`);
        continue;
      }

      // 3. Enviar push en batches de 500
      const message = {
        data: {
          tipo: "masterclass",
          title: `Tu Masterclass está lista 🎬`,
          body: `Semana ${semana} · ${titulo} — Ya puedes verla`,
          tag: `masterclass_s${semana}`,
          url: `/workbook?masterclass=${semana}`,
          icon: "/workbook/icon-192.png",
          badge: "/workbook/icon-192.png"
        },
        android: {
          priority: "high",
          notification: { color: "#B8892A", channelId: "masterclass" }
        },
        apns: { payload: { aps: { sound: "default" } } },
        webpush: { headers: { Urgency: "high" } }
      };

      const BATCH = 500;
      let enviadas = 0;
      const invalidIds = [];

      for (let i = 0; i < tokens.length; i += BATCH) {
        const batch = tokensSnap.docs
          .slice(i, i + BATCH)
          .map(d => ({ docId: d.id, token: d.data().token }))
          .filter(t => !!t.token);

        const resp = await messaging.sendEachForMulticast({
          ...message,
          tokens: batch.map(t => t.token)
        });

        resp.responses.forEach((r, idx) => {
          if (r.success) {
            enviadas++;
          } else {
            const code = r.error && r.error.code;
            if (
              code === "messaging/registration-token-not-registered" ||
              code === "messaging/invalid-registration-token" ||
              code === "messaging/invalid-argument"
            ) {
              invalidIds.push(batch[idx].docId);
            }
          }
        });
      }

      // 4. Limpiar tokens inválidos
      if (invalidIds.length > 0) {
        await Promise.all(
          invalidIds.map(id => db.collection("tokens").doc(id).delete())
        );
      }

      console.log(`[activarMasterclassSemanal] Semana ${semana} activada. Push: ${enviadas}/${tokens.length}.`);
    }
  }
);

// ── onEventoProgreso ──────────────────────────────────────────────────────────

const EVENTO_CONFIG = {
  s0:            { horas: 24, titulo: (n) => `${n}, el primer paso toma 3 minutos.`,                     cuerpo: "" },
  s3:            { horas: 48, titulo: ()  => "Tu identidad Soberana está a medias.",                     cuerpo: "", checkActividad: true },
  s5:            { horas: 2,  titulo: ()  => "Protocolo Mental activado. ¿Ya lo aplicaste hoy?",         cuerpo: "" },
  s7:            { horas: 2,  titulo: ()  => "Los 3 protocolos están en ti. El sistema está completo.",  cuerpo: "" },
  s9:            { horas: 1,  titulo: ()  => "Completaste el workshop. Hay una dimensión que esto no toca.", cuerpo: "" },
  quesigue_visto:{ horas: 6,  titulo: ()  => "El 7D abre lo que el workshop no puede.",                  cuerpo: "" },
};

function tsToMs(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "number") return ts;
  if (typeof ts === "string") return new Date(ts).getTime();
  return null;
}

exports.onEventoProgreso = onDocumentWritten(
  "eventos/{email}/secciones/{seccionId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return; // documento borrado

    const data = after.data();
    if (data.notifEnviada === true) return;

    const { email, seccionId } = event.params;
    const seccion = data.seccion || seccionId;
    const cfg = EVENTO_CONFIG[seccion];
    if (!cfg) return; // sección no monitoreada

    const tsMs = tsToMs(data.timestamp);
    const horasTranscurridas = tsMs ? (Date.now() - tsMs) / (1000 * 60 * 60) : Infinity;

    if (horasTranscurridas < cfg.horas) return; // aún no es tiempo — se reintentará

    const db = getFirestore();
    const messaging = getMessaging();

    // Para s3: verificar que no haya actividad más reciente en la colección
    if (cfg.checkActividad && data.timestamp) {
      const recientes = await db
        .collection("eventos").doc(email).collection("secciones")
        .where("timestamp", ">", data.timestamp)
        .limit(1)
        .get();
      if (!recientes.empty) return; // hay actividad más reciente — no enviar
    }

    // Buscar token FCM
    const tokenDoc = await db.collection("tokens").doc(email).get();
    if (!tokenDoc.exists || !tokenDoc.data().token) return; // sin token, skip silencioso

    const token = tokenDoc.data().token;
    const nombre = tokenDoc.data().nombre || nombreDesdeEmail(email);
    const titulo = cfg.titulo(nombre);

    try {
      await messaging.send({
        token,
        data: {
          tipo:   "sistema",
          title:  titulo,
          body:   cfg.cuerpo,
          tag:    `evento_${seccion}`,
          url:    "/workbook/",
          icon:   "/workbook/icon-192.png",
          badge:  "/workbook/icon-192.png",
        },
        android: {
          priority: "high",
          notification: { color: "#8B1A2F" },
        },
        webpush: { headers: { Urgency: "high" } },
      });

      await after.ref.update({ notifEnviada: true });
    } catch (e) {
      console.error(`[onEventoProgreso] send error ${email}/${seccion}:`, e.message);
      const code = e.errorInfo?.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        await db.collection("tokens").doc(email).delete();
      }
    }
  }
);
