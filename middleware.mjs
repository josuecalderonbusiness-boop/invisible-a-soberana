// Enruta el subdominio he-intentado-todo-porque-nada-cambia.josuecalderon.lat a la landing de
// masterclass, sin afectar el resto de rutas de josuecalderon.lat. Usa Routing Middleware
// (no vercel.json "rewrites") porque el enrutamiento condicionado por Host no es un tipo de
// "has" soportado en rewrites — solo existen header/cookie/query.
import { rewrite, next } from '@vercel/functions';

export const config = {
  matcher: ['/', '/gracias'],
};

const TARGET_HOST = 'he-intentado-todo-porque-nada-cambia.josuecalderon.lat';

export default function middleware(request) {
  const host = request.headers.get('host') || '';
  if (host !== TARGET_HOST) return next();

  const url = new URL(request.url);
  if (url.pathname === '/') {
    return rewrite(new URL('/masterclass/mas-se-aleja/index.html', request.url));
  }
  if (url.pathname === '/gracias') {
    return rewrite(new URL('/masterclass/mas-se-aleja/gracias/index.html', request.url));
  }
  return next();
}
