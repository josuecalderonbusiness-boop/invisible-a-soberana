// api/v1/orbit.js — capa de API consolidada del contrato Orbit ↔ Mi Espacio (DR-006/DR-007).
//
// Consolida 2 endpoints físicos en un solo archivo (límite de 12 funciones serverless
// del plan Hobby de Vercel — encontrado al validar el entorno real de 3.1/3.2,
// 2026-08-02). Las URLs externas NO cambian: vercel.json las reescribe hacia este
// archivo con ?accion=...&programa_id=...|edicion_id=... . Cada Conversación sigue
// siendo una función independiente — solo comparten el mismo despliegue físico.
//
// api/v1/autorizar-programa.js (Conversación 3 vieja, por persona_id) se eliminó por
// completo en este mismo cambio: era código muerto, nunca conectado al login real
// (bloqueo de arquitectura documentado en su momento) y ya superado por
// api/_lib/orbit-perfil-acceso.js (Fase 3.2).

import { resolverEdicion, obtenerEstado, autenticado } from '../_lib/programa.js';

async function resolverEdicionAccion(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!autenticado(req)) return res.status(401).json({ error: 'no autorizado' });

  const { programa_id } = req.query;
  if (!programa_id) return res.status(400).json({ error: 'programa_id requerido' });

  try {
    const resultado = await resolverEdicion(programa_id);
    return res.status(200).json(resultado);
  } catch (err) {
    console.error('orbit/resolver-edicion error:', err.message);
    return res.status(500).json({ error: 'error interno' });
  }
}

async function estadoAccion(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!autenticado(req)) return res.status(401).json({ error: 'no autorizado' });

  const { edicion_id } = req.query;
  if (!edicion_id) return res.status(400).json({ error: 'edicion_id requerido' });

  try {
    const estado = await obtenerEstado(edicion_id);
    if (!estado) return res.status(404).json({ error: 'edicion no encontrada' });
    return res.status(200).json({ edicion_id, estado });
  } catch (err) {
    console.error('orbit/estado error:', err.message);
    return res.status(500).json({ error: 'error interno' });
  }
}

const ACCIONES = {
  'resolver-edicion': resolverEdicionAccion,
  estado: estadoAccion,
};

export default async function handler(req, res) {
  const fn = ACCIONES[req.query?.accion];
  if (!fn) return res.status(404).json({ error: 'Acción no reconocida.' });
  return fn(req, res);
}
