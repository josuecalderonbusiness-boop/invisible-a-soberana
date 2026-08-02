// api/_lib/request-ip.js — extrae la IP del cliente de un request de Vercel (x-forwarded-for).
//
// Antes duplicado literalmente en 3 endpoints — extraído en la auditoría de 3.1
// (2026-08-01, hallazgo medio #3).

function ipDelRequest(req) {
  const xf = req.headers && req.headers['x-forwarded-for'];
  if (xf) return xf.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'desconocida';
}

export { ipDelRequest };
