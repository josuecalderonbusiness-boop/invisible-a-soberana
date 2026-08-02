// api/_lib/derecho-provisional.js — verificación PROVISIONAL de Derecho por correo.
//
// Interfaz abstracta que usa el sistema de Login (Fase 3, subfase 3.1): "¿este correo
// tiene Derecho vigente a algún Programa?". Hoy responde reutilizando la consulta que ya
// existía en mi-espacio-login.js (Firestore, colección masterclass_compras, activo=true).
//
// En subfase 3.2 esta función se reemplaza por la llamada real a Orbit (Conversación 3
// rediseñada, DR-007 aún sin enmendar a propósito — ver orbit_v2_roadmap_protocol) — el
// resto del sistema de Login solo depende de esta firma, nunca de cómo se resuelve por
// dentro. No tocar esta función fuera de 3.2 sin motivo explícito.

import { getToken } from './firestore-rest.js';

const FIRESTORE_QUERY_URL =
  'https://firestore.googleapis.com/v1/projects/soberana-app/databases/(default)/documents:runQuery';

// Consulta compartida — evita repetir la misma query de Firestore en cada función pública
// de este módulo (agregado al conectar index.html al backend nuevo, 2026-08-01).
async function buscarComprasActivas(correo) {
  const token = await getToken();
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'masterclass_compras' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: correo } } },
            { fieldFilter: { field: { fieldPath: 'activo' }, op: 'EQUAL', value: { booleanValue: true } } }
          ]
        }
      }
    }
  };
  const res = await fetch(FIRESTORE_QUERY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).filter((r) => r.document);
}

async function tieneDerechoVigente(correo) {
  const filas = await buscarComprasActivas(correo);
  return filas.length > 0;
}

// Lista de compras vigentes — usada por mi-espacio-login.js/mi-espacio-sesion.js para que
// index.html pueda armar la biblioteca tras iniciar sesión. Es la misma consulta que ya
// hacía el login viejo (sin contraseña) — no es una llamada a Orbit ni cambia el contrato
// de Conversación 3 (DR-007), que sigue intacto hasta 3.2.
async function obtenerComprasVigentes(correo) {
  const filas = await buscarComprasActivas(correo);
  return filas.map((r) => {
    const f = r.document.fields || {};
    return {
      producto: f.producto?.stringValue || '',
      nombre: f.nombre?.stringValue || '',
      fecha: f.fecha?.stringValue || ''
    };
  });
}

export { tieneDerechoVigente, obtenerComprasVigentes };
