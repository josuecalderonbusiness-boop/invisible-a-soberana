// api/_lib/auth-token.js — tokens de un solo uso para verificación de correo y
// recuperación de contraseña.
//
// Solo se guarda el hash (sha256) del token en Firestore — nunca el valor en texto plano —
// así una filtración de la base de datos no entrega tokens directamente utilizables.
// 32 bytes de entropía (256 bits), muy por encima del mínimo seguro.

import crypto from 'node:crypto';
import { fsGet, fsSet, fsDelete } from './firestore-rest.js';

const COLECCION = 'mi_espacio_tokens';

// Marca de "último token emitido" por correo+tipo — evita que dos solicitudes casi
// simultáneas (doble clic, reintento de red) generen y envíen dos correos distintos
// (auditoría de 3.1, 2026-08-01, hallazgo menor #11).
const COLECCION_COOLDOWN = 'mi_espacio_token_emitido';
const COOLDOWN_MS = 60 * 1000;

function generarToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// tipo: 'verificacion_correo' | 'recuperacion'
// Devuelve el token, o null si ya se emitió uno para este correo+tipo hace menos de
// COOLDOWN_MS — el caller debe entonces omitir el envío de correo sin cambiar la
// respuesta visible para la alumna (no hay token nuevo que enviar, el anterior sigue vigente).
async function crearToken(correo, tipo, horasValidez) {
  const cooldownId = `${tipo}__${correo}`;
  const marca = await fsGet(COLECCION_COOLDOWN, cooldownId);
  if (marca && Date.now() - marca.emitidoEn < COOLDOWN_MS) {
    return null;
  }

  const token = generarToken();
  const hash = hashToken(token);
  const expiraEn = Date.now() + horasValidez * 60 * 60 * 1000;
  await fsSet(COLECCION, hash, { correo, tipo, expiraEn });
  await fsSet(COLECCION_COOLDOWN, cooldownId, { emitidoEn: Date.now() });
  return token;
}

// Verifica el token y lo elimina de inmediato si es válido (garantiza un solo uso).
// Devuelve { correo } si es válido, o null si no existe / expiró / no coincide el tipo.
//
// No es una transacción Firestore real (REST simple, lectura + borrado) — la ventana de
// doble uso bajo un envío simultáneo exacto es mínima y aceptable para este caso (no es
// una operación financiera). Documentado como límite conocido, no como bug.
async function consumirToken(token, tipoEsperado) {
  const hash = hashToken(token);
  const doc = await fsGet(COLECCION, hash);
  if (!doc) return null;
  if (doc.tipo !== tipoEsperado) return null;
  if (Date.now() > doc.expiraEn) return null;

  await fsDelete(COLECCION, hash);
  return { correo: doc.correo };
}

// Misma validación que consumirToken (existe / tipo correcto / no expiró) pero SIN borrar el
// token — para flujos que necesitan mostrar algo (ej. el correo asociado) antes de que la persona
// complete la acción real. El único uso real del token sigue siendo consumirToken.
async function peekToken(token, tipoEsperado) {
  const hash = hashToken(token);
  const doc = await fsGet(COLECCION, hash);
  if (!doc) return null;
  if (doc.tipo !== tipoEsperado) return null;
  if (Date.now() > doc.expiraEn) return null;
  return { correo: doc.correo };
}

export { crearToken, consumirToken, peekToken };
