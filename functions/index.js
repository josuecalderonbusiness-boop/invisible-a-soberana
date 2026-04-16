const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const cors = require("cors")({ origin: true });

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
          }
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
