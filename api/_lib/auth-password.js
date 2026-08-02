// api/_lib/auth-password.js — hash de contraseñas, versionado por algoritmo.
//
// Formato de almacenamiento: { algoritmo, salt, hash } — nunca un string plano — para
// poder migrar de algoritmo en el futuro sin romper cuentas existentes (verificar con el
// algoritmo viejo en el próximo login exitoso, re-hashear con el nuevo).
//
// scrypt nativo de Node (sin dependencias nuevas), mismo algoritmo ya usado en producción
// por orbit-mc/lib/auth.js — se descartó Argon2id por requerir binarios nativos en Vercel
// (auditoría de arquitectura de 3.1, 2026-08-01).

import crypto from 'node:crypto';

const ALGORITMO_ACTUAL = 'scrypt';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { algoritmo: ALGORITMO_ACTUAL, salt, hash };
}

function verifyPassword(password, stored) {
  if (!stored || stored.algoritmo !== 'scrypt' || !stored.salt || !stored.hash) return false;
  const hash = crypto.scryptSync(password, stored.salt, 64);
  const guardado = Buffer.from(stored.hash, 'hex');
  if (hash.length !== guardado.length) return false;
  return crypto.timingSafeEqual(hash, guardado);
}

export { hashPassword, verifyPassword, ALGORITMO_ACTUAL };
