// api/_lib/cuenta.js — Cuenta de Mi Espacio (Firestore, colección "cuentas").
//
// Entidad exclusiva de Mi Espacio — Orbit nunca la conoce (nunca almacena contraseñas ni
// sesiones, principio reafirmado explícitamente por Josué al cerrar la auditoría de 3.1,
// 2026-08-01). No es una entidad del dominio compartido, no cruza a Orbit.
//
// Doc ID = correo normalizado (minúsculas, sin espacios) → unicidad atómica sin condición
// de carrera, sin necesidad de transacción explícita (ver firestore-rest.js: fsSet con
// exigirNoExiste).
//
// La Cuenta NUNCA expira ni se elimina por inactividad — regla de negocio permanente. Solo
// la sesión del dispositivo expira (ver auth-session.js). Este módulo no implementa ningún
// mecanismo de borrado ni de expiración de Cuenta.

import { fsGet, fsSet, fsUpdate } from './firestore-rest.js';

const COLECCION = 'cuentas';

function normalizarCorreo(correo) {
  return String(correo || '').trim().toLowerCase();
}

async function obtenerCuenta(correo) {
  return fsGet(COLECCION, normalizarCorreo(correo));
}

// Crea la cuenta ya activa, con contraseña, en un solo paso atómico — decisión de negocio
// 2026-08-01: la alumna crea su contraseña de inmediato dentro de Mi Espacio, sin depender
// de un enlace de correo (prioriza no romper el impulso de compra; el riesgo teórico de que
// alguien más conocido el correo cree la cuenta antes se acepta explícitamente para este
// producto). `emailVerified` empieza en false y se confirma después, sin bloquear nada.
// Devuelve false si ya existía una cuenta con ese correo (condición de carrera real, ej. dos
// pestañas simultáneas) — esta sigue siendo la garantía de unicidad "una cuenta ↔ un correo".
async function crearCuenta(correo, passwordHash) {
  const id = normalizarCorreo(correo);
  try {
    await fsSet(
      COLECCION,
      id,
      {
        correo: id,
        estado: 'activa',
        passwordHash,
        emailVerified: false,
        sessionVersion: 0,
        creadaEn: Date.now()
      },
      { exigirNoExiste: true }
    );
    return true;
  } catch (err) {
    // Acotado a la precondición real de "ya existe" (auditoría de 3.1, 2026-08-01) — antes
    // se trataba cualquier 4xx como "ya existía", enmascarando errores reales (token vencido,
    // payload malformado, permisos) como si fueran el caso de negocio normal.
    const esPrecondicionFallida =
      err.firestoreStatus === 'FAILED_PRECONDITION' ||
      err.firestoreStatus === 'ALREADY_EXISTS' ||
      (err.firestoreMessage && /already exists/i.test(err.firestoreMessage));
    if (esPrecondicionFallida) return false;
    throw err;
  }
}

// Marca el correo como verificado — no afecta acceso al contenido ni a la sesión, solo
// habilita contarla como "contacto verificado" para reputación de dominio y email marketing
// (decisión de negocio 2026-08-01).
async function marcarCorreoVerificado(correo) {
  const id = normalizarCorreo(correo);
  await fsUpdate(COLECCION, id, { emailVerified: true });
}

// Actualiza la contraseña e invalida todas las sesiones anteriores (sessionVersion++) —
// único uso aprobado de sessionVersion (cambio de contraseña), sin ningún otro mecanismo
// de revocación agregado (decisión explícita de Josué, 2026-08-01: "no quiero introducir
// complejidad innecesaria desde el día uno").
async function actualizarPassword(correo, passwordHash) {
  const id = normalizarCorreo(correo);
  const cuenta = await obtenerCuenta(id);
  const nuevaVersion = (cuenta?.sessionVersion || 0) + 1;
  await fsUpdate(COLECCION, id, { passwordHash, sessionVersion: nuevaVersion });
  return nuevaVersion;
}

export { normalizarCorreo, obtenerCuenta, crearCuenta, marcarCorreoVerificado, actualizarPassword };
