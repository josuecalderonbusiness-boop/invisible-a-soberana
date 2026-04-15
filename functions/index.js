const { setGlobalOptions } = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

setGlobalOptions({ maxInstances: 10 });

initializeApp();

const ADMIN_KEY = "Sob3rana@Admin2026";

exports.sendPushNotification = onCall({
  maxInstances: 10,
  cors: [
    "https://soberana-app.josuecalderon.lat",
    "https://invisible-a-soberana.josuecalderon.lat",
  ],
}, async (request) => {
  const { titulo, mensaje, adminKey } = request.data;

  // 1. Verificar clave de admin
  if (adminKey !== ADMIN_KEY) {
    throw new HttpsError("permission-denied", "Clave de administrador incorrecta.");
  }

  if (!titulo || !mensaje) {
    throw new HttpsError("invalid-argument", "Se requieren titulo y mensaje.");
  }

  const db = getFirestore();
  const messaging = getMessaging();

  // 2. Leer todos los tokens de Firestore
  const tokensSnap = await db.collection("tokens").get();

  if (tokensSnap.empty) {
    return { success: true, enviadas: 0 };
  }

  const tokenDocs = tokensSnap.docs
    .map(doc => ({ docId: doc.id, token: doc.data().token }))
    .filter(t => !!t.token);

  if (tokenDocs.length === 0) {
    return { success: true, enviadas: 0 };
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

    response.responses.forEach((res, idx) => {
      if (res.success) {
        enviadas++;
      } else {
        const code = res.error && res.error.code;
        // Tokens inválidos o no registrados — marcar para borrar
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
    const deleteOps = invalidTokenDocIds.map(docId =>
      db.collection("tokens").doc(docId).delete()
    );
    await Promise.all(deleteOps);
  }

  return { success: true, enviadas };
});
