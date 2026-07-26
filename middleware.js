// Enruta el subdominio he-intentado-todo-porque-nada-cambia.josuecalderon.lat a la landing de
// masterclass, sin afectar el resto de rutas de josuecalderon.lat. Usa Routing Middleware
// (no vercel.json "rewrites"/"redirects") porque el enrutamiento condicionado por Host no es un
// tipo de "has" soportado ahí — solo existen header/cookie/query. Además, Vercel le da prioridad
// al archivo estático real sobre cualquier rewrite ("precedence is given to the filesystem prior
// to rewrites"), así que la única forma de apagar la ruta vieja del dominio principal es
// interceptarla aquí, antes de que la resuelva el filesystem.
import { rewrite, next } from '@vercel/functions';

export const config = {
  matcher: ['/', '/gracias', '/masterclass/mas-se-aleja', '/masterclass/mas-se-aleja/:path*'],
};

const TARGET_HOST = 'he-intentado-todo-porque-nada-cambia.josuecalderon.lat';

export default function middleware(request) {
  const host = request.headers.get('host') || '';
  const url = new URL(request.url);

  if (host === TARGET_HOST) {
    if (url.pathname === '/') {
      return rewrite(new URL('/masterclass/mas-se-aleja/index.html', request.url));
    }
    if (url.pathname === '/gracias') {
      return rewrite(new URL('/masterclass/mas-se-aleja/gracias/index.html', request.url));
    }
    return next();
  }

  // Todavía no hay lanzamiento — la ruta vieja en el dominio principal queda apagada
  // (redirige a home) hasta que se decida abrirla de nuevo.
  if (url.pathname === '/masterclass/mas-se-aleja' || url.pathname.startsWith('/masterclass/mas-se-aleja/')) {
    return Response.redirect(new URL('/', request.url), 307);
  }

  return next();
}
