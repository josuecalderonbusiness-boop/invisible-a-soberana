/**
 * test-evento.js
 * Simula lo que hace la PWA: escribe un documento en
 * eventos/{email}/secciones/{seccionId} para disparar onEventoProgreso.
 *
 * Uso: node test-evento.js [email] [seccion]
 * Por defecto: email del .env o josuecalderonbusiness@gmail.com, sección s3
 */

const path = require('path');

// Usar firebase-admin de la carpeta functions
const admin = require('./functions/node_modules/firebase-admin');

const KEY_PATH = path.join(__dirname, 'serviceAccountKey.json.json');
const email    = process.argv[2] || 'josuecalderonbusiness@gmail.com';
const seccion  = process.argv[3] || 's3';

admin.initializeApp({
  credential: admin.credential.cert(KEY_PATH),
});

const db = admin.firestore();

async function main() {
  const docRef = db
    .collection('eventos').doc(email)
    .collection('secciones').doc(seccion);

  // ── Paso 1: escribir con timestamp en el pasado para superar el delay ────────
  // s3 requiere 48 h. Ponemos timestamp hace 50 h para que la función lo envíe.
  const horasAtras = 50;
  const tsAntiguo  = new Date(Date.now() - horasAtras * 60 * 60 * 1000);

  console.log(`\n📝 Escribiendo evento…`);
  console.log(`   colección : eventos/${email}/secciones/${seccion}`);
  console.log(`   timestamp : hace ${horasAtras}h (${tsAntiguo.toISOString()})`);
  console.log(`   notifEnviada: false\n`);

  await docRef.set({
    seccion,
    nombre: 'Josué',
    email,
    timestamp: admin.firestore.Timestamp.fromDate(tsAntiguo),
    notifEnviada: false,
  }, { merge: false });

  console.log('✅ Documento escrito. La Cloud Function debería dispararse en segundos.');
  console.log('\n⏳ Esperando 8 s para dar tiempo al trigger…\n');

  await new Promise(r => setTimeout(r, 8000));

  // ── Paso 2: leer el documento y ver si notifEnviada cambió a true ────────────
  const snap = await docRef.get();
  const data = snap.data();

  console.log('📄 Estado del documento después del trigger:');
  console.log(JSON.stringify(data, null, 2));

  if (data.notifEnviada === true) {
    console.log('\n🟢 notifEnviada = true → la función se ejecutó y marcó el envío.');
  } else {
    console.log('\n🟡 notifEnviada sigue false. Puede que:');
    console.log('   • La función aún esté procesando (espera unos segundos más).');
    console.log('   • No haya token FCM registrado para este email.');
    console.log('   • Revisa los logs: firebase functions:log --only onEventoProgreso');
  }

  await admin.app().delete();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
