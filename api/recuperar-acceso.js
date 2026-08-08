// api/recuperar-acceso.js — Nivel 3 de RECUPERACION-DE-ACCESO-SYSTEM.md, endpoint de la página
// public/masterclass/mas-se-aleja/recuperar-acceso.html. Consolidado en un solo archivo con
// ?accion= (mismo patrón que mi-espacio-auth.js) para no sumar una segunda función serverless al
// límite del plan Hobby de Vercel.
//
// No reimplementa nada que ya exista: el token usa auth-token.js (hash, expiración, un solo uso),
// el reenvío usa sendTemplateMasterclass/masterclassEnVivo/guardarEnSheets de api/whatsapp.js, y la
// decisión de qué hacer usa resolverContingenciaAcceso — el mismo motor que ya usa el botón
// "💛 Necesito ayuda" de WhatsApp. `origen: 'correo'` es la única diferencia real entre los dos
// puntos de entrada.

import { peekToken, consumirToken } from './_lib/auth-token.js';
import { fsGet, fsUpdate } from './_lib/firestore-rest.js';
import { resolverContingenciaAcceso, registrarResultadoBienvenidaPorTelefono } from './_lib/recuperacion-acceso.js';
import { masterclassEnVivo, sendTemplateMasterclass, guardarEnSheets } from './whatsapp.js';

const TIPO_TOKEN = 'recuperacion_acceso_masterclass';

// Mismo mensaje para cualquier fallo de validación del token (no existe / ya usado / expirado /
// la compra detrás del token ya no existe) — punto #3 y #10 del encargo: nunca dar pistas de cuál
// de esos casos fue, para no ayudar a quien intente adivinar tokens.
const ERROR_GENERICO = 'Este enlace ya no está disponible. Escríbenos y te ayudamos.';

function limpiarTelefono(telefono) {
  return String(telefono || '').replace(/[^0-9]/g, '');
}

async function validarAccion(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = req.query?.t;
  if (!token) return res.status(400).json({ error: ERROR_GENERICO });

  try {
    const datos = await peekToken(token, TIPO_TOKEN);
    if (!datos) return res.status(400).json({ error: ERROR_GENERICO });

    // datos.correo es en realidad el compra_id (email__producto) — ver nota en correo1-masterclass.js.
    const compra = await fsGet('masterclass_compras', datos.correo);
    if (!compra) return res.status(400).json({ error: ERROR_GENERICO }); // compra_id ya no existe — mismo error genérico

    return res.status(200).json({ ok: true, email: compra.email });
  } catch (err) {
    console.error('recuperar-acceso/validar error:', err.message);
    return res.status(400).json({ error: ERROR_GENERICO });
  }
}

async function guardarAccion(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = req.body?.t;
  const nuevoTelefono = limpiarTelefono(req.body?.telefono);

  if (!token) return res.status(400).json({ error: ERROR_GENERICO });
  if (!nuevoTelefono || nuevoTelefono.length < 7) {
    return res.status(400).json({ error: 'Escribe un número de WhatsApp válido.' });
  }

  try {
    // Único uso real del token — se consume aquí, después de que ella completó la acción, nunca
    // al cargar la página (punto #9 del encargo).
    const datos = await consumirToken(token, TIPO_TOKEN);
    if (!datos) return res.status(400).json({ error: ERROR_GENERICO });

    const compraId = datos.correo;
    const compra = await fsGet('masterclass_compras', compraId);
    if (!compra) return res.status(400).json({ error: ERROR_GENERICO });

    // Guarda el número corregido — a partir de aquí, el motor lo trata igual que cualquier otro
    // teléfono real (mismo camino que el botón de WhatsApp, punto #7 del encargo).
    await fsUpdate('masterclass_compras', compraId, { telefono: nuevoTelefono });

    const resultado = await resolverContingenciaAcceso({ telefono: nuevoTelefono, origen: 'correo' });

    if (resultado.escalar) {
      await guardarEnSheets({
        msgId: '', phone: nuevoTelefono, tipo: 'recuperacion_correo', texto: '',
        btnId: 'NECESITA_REVISION',
        btnTx: `Escenario ${resultado.escenario} — recuperación de acceso (origen: correo)`,
        timestamp: new Date().toISOString()
      });
      return res.status(200).json({ ok: true, mensaje: 'Ya registramos tu número. Estamos revisando tu caso y te escribimos pronto.' });
    }

    const templateName = masterclassEnVivo() ? 'bienvenida_live_cs' : 'bienvenida_replay_cs';
    const aceptado = await sendTemplateMasterclass(nuevoTelefono, resultado.compra?.nombre || compra.nombre || 'amiga', templateName);
    await registrarResultadoBienvenidaPorTelefono(nuevoTelefono, aceptado);

    return res.status(200).json({ ok: true, mensaje: 'Listo — te acabamos de escribir por WhatsApp a tu número nuevo.' });
  } catch (err) {
    console.error('recuperar-acceso/guardar error:', err.message);
    return res.status(500).json({ error: ERROR_GENERICO });
  }
}

const ACCIONES = { validar: validarAccion, guardar: guardarAccion };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const fn = ACCIONES[req.query?.accion];
  if (!fn) return res.status(404).json({ error: 'Acción no reconocida.' });
  return fn(req, res);
}
