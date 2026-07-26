// Enruta el subdominio he-intentado-todo-porque-nada-cambia.josuecalderon.lat a la landing de
// masterclass, sin afectar el resto de rutas de josuecalderon.lat. Usa Routing Middleware
// (no vercel.json "rewrites"/"redirects") porque el enrutamiento condicionado por Host no es un
// tipo de "has" soportado ahí — solo existen header/cookie/query. Además, Vercel le da prioridad
// al archivo estático real sobre cualquier rewrite ("precedence is given to the filesystem prior
// to rewrites"), así que la única forma de apagar la ruta vieja del dominio principal es
// interceptarla aquí, antes de que la resuelva el filesystem.
import { rewrite, next } from '@vercel/functions';

export const config = {
  // "{/}?" hace la barra final opcional — sin esto, "/gracias/" (con barra) no calzaba con
  // "/gracias" y el middleware ni siquiera se ejecutaba, cayendo en un 404 de Vercel.
  matcher: ['/', '/gracias{/}?', '/masterclass/mas-se-aleja{/}?', '/masterclass/mas-se-aleja/:path*'],
};

const TARGET_HOST = 'he-intentado-todo-porque-nada-cambia.josuecalderon.lat';

// Normaliza quitando la barra final (excepto en la raíz), para no tener que comparar
// "/gracias" y "/gracias/" por separado en cada chequeo de abajo.
function normalizedPath(url) {
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    return url.pathname.slice(0, -1);
  }
  return url.pathname;
}

export default function middleware(request) {
  const host = request.headers.get('host') || '';
  const url = new URL(request.url);
  const pathname = normalizedPath(url);

  if (host === TARGET_HOST) {
    if (pathname === '/') {
      return rewrite(new URL('/masterclass/mas-se-aleja/index.html' + url.search, request.url));
    }
    if (pathname === '/gracias') {
      return rewrite(new URL('/masterclass/mas-se-aleja/gracias/index.html' + url.search, request.url));
    }
    return next();
  }

  // Todavía no hay lanzamiento — la ruta vieja en el dominio principal queda apagada
  // (redirige a home) hasta que se decida abrirla de nuevo.
  if (pathname === '/masterclass/mas-se-aleja' || pathname.startsWith('/masterclass/mas-se-aleja/')) {
    return Response.redirect(new URL('/', request.url), 307);
  }

  return next();
}
