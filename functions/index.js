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

    const { titulo, mensaje, adminKey } = req.body;

    // 1. Verificar clave de admin
    if (adminKey !== ADMIN_KEY) {
      res.status(403).json({ error: "No autorizado" });
      return;
    }

    if (!titulo || !mensaje) {
      res.status(400).json({ error: "Se requieren titulo y mensaje" });
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

      // 3. Enviar en lotes de 500 (límite de FCM sendEachForMulticast)
      const BATCH_SIZE = 500;
      let enviadas = 0;
      const invalidTokenDocIds = [];

      for (let i = 0; i < tokenDocs.length; i += BATCH_SIZE) {
        const batch = tokenDocs.slice(i, i + BATCH_SIZE);
        const tokens = batch.map(t => t.token);

        const response = await messaging.sendEachForMulticast({
          tokens,
          notification: {
            title: titulo,
            body:  mensaje,
          },
          webpush: {
            notification: {
              icon:  "/workbook/icon-192.png",
              badge: "/workbook/icon-192.png",
            },
            fcmOptions: {
              link: "/workbook/",
            },
          },
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

      // 4. Borrar tokens inválidos de Firestore
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
