// api/_lib/recuperacion-acceso.js — motor de decisión compartido de RECUPERACION-DE-ACCESO-SYSTEM,
// primera instancia en 001-masterclass-soberana. Ver NO-RECIBI-MI-ACCESO-SPEC.md para el contrato
// completo (Escenarios A-E, mensajes, anti-bucle, auditoría).
//
// Único punto que decide qué hacer cuando alguien pide ayuda porque no recibió su acceso — invocado
// desde api/whatsapp.js (botón "💛 Necesito ayuda") y, más adelante, desde la página de recuperación
// por correo (Nivel 3) — misma función, dos puntos de entrada, nunca lógica duplicada.

import { fsGet, fsUpdate } from './firestore-rest.js';

const PROJECT = 'soberana-app';

async function getToken() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const { google } = await import('googleapis');
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/datastore']
  });
  return auth.getAccessToken();
}

// Busca la compra por teléfono (mismo patrón/colección que buscarNombreMasterclass en
// api/whatsapp.js, pero devuelve el documento completo — incluido su docId — no solo el nombre.
async function buscarCompraPorTelefono(telefono) {
  const token = await getToken();
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'masterclass_compras' }],
      where: { fieldFilter: { field: { fieldPath: 'telefono' }, op: 'EQUAL', value: { stringValue: telefono } } },
      limit: 1
    }
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const rows = await res.json();
  const doc = (Array.isArray(rows) ? rows : []).find(r => r.document);
  if (!doc) return null;

  const docId = doc.document.name.split('/').pop();
  const f = doc.document.fields || {};
  return {
    docId,
    email: f.email?.stringValue || '',
    nombre: f.nombre?.stringValue || '',
    producto: f.producto?.stringValue || '',
    telefono: f.telefono?.stringValue || '',
    bienvenida_estado: f.bienvenida_estado?.stringValue || null,
    contingencia_usada: f.contingencia_usada?.booleanValue === true,
    comunicacion_suspendida: f.comunicacion_suspendida?.booleanValue === true
  };
}

// Único punto de entrada del motor. `origen` es solo para auditoría ('whatsapp' | 'correo') — nunca
// cambia la decisión, los dos puntos de entrada comparten exactamente la misma lógica.
async function resolverContingenciaAcceso({ telefono, origen }) {
  const compra = await buscarCompraPorTelefono(telefono);

  // Escenario A — sin compra encontrada con este teléfono.
  if (!compra) {
    return { escenario: 'A', escalar: true, reenviar: false, compra: null };
  }

  // Escenario E — freno anti-bucle, compartido entre WhatsApp y correo (por compra, no por canal).
  if (compra.contingencia_usada) {
    return { escenario: 'E', escalar: true, reenviar: false, compra };
  }

  // Reembolso/pausa preventiva (REFUND-MANAGEMENT-SYSTEM.md) — una compra con comunicación
  // suspendida nunca reenvía, sin importar el escenario B/C/D que le tocaría: se trata igual que
  // A/E (escalar), porque reenviar aquí sería reactivar comunicación que ya se decidió detener.
  if (compra.comunicacion_suspendida) {
    return { escenario: 'SUSPENDIDA', escalar: true, reenviar: false, compra };
  }

  // A partir de aquí (B, C o D) se reenvía — se marca el freno ANTES de reenviar, no después, para
  // que dos solicitudes casi simultáneas no pasen ambas la verificación (ver limitación aceptada en
  // NO-RECIBI-MI-ACCESO-SPEC.md sobre la ventana de concurrencia).
  await fsUpdate('masterclass_compras', compra.docId, {
    contingencia_usada: true,
    contingencia_fecha: new Date().toISOString(),
    contingencia_origen: origen || 'desconocido'
  });

  const escenario = compra.bienvenida_estado === 'ACEPTADO' ? 'D'
    : compra.bienvenida_estado === 'ERROR' ? 'C'
    : 'B';

  return { escenario, escalar: false, reenviar: true, compra };
}

// Registra el resultado real de un envío (ACEPTADO/ERROR) — mismo campo que consulta
// resolverContingenciaAcceso para decidir Escenario B/C/D. Recibe docId directo (usado desde el
// motor mismo, tras un reenvío) o teléfono (usado desde el envío original en api/whatsapp.js, que
// todavía no tiene el docId a mano).
async function registrarResultadoBienvenida(docId, aceptado) {
  await fsUpdate('masterclass_compras', docId, {
    bienvenida_estado: aceptado ? 'ACEPTADO' : 'ERROR',
    bienvenida_fecha: new Date().toISOString()
  });
}

async function registrarResultadoBienvenidaPorTelefono(telefono, aceptado) {
  const compra = await buscarCompraPorTelefono(telefono);
  if (!compra) return; // compra todavía no persistida en el momento del envío — no bloquea nada
  await registrarResultadoBienvenida(compra.docId, aceptado);
}

export { resolverContingenciaAcceso, registrarResultadoBienvenida, registrarResultadoBienvenidaPorTelefono };
