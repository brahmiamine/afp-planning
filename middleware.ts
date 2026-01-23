import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authSession = request.cookies.get('auth_session');

  // Vérifier si l'utilisateur est authentifié
  const isAuthenticated = authSession?.value === 'authenticated';

  // Routes publiques qui ne nécessitent pas d'authentification
  const publicRoutes = ['/login'];
  const isPublicRoute = publicRoutes.includes(pathname) || pathname.startsWith('/api/auth');

  // Si l'utilisateur essaie d'accéder à /login et est déjà connecté, rediriger vers /
  if (pathname === '/login' && isAuthenticated) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Si l'utilisateur n'est pas authentifié et essaie d'accéder à une route protégée
  if (!isAuthenticated && !isPublicRoute) {
    // Ignorer les fichiers statiques et les routes Next.js internes
    if (
      pathname.startsWith('/_next') ||
      pathname.startsWith('/favicon') ||
      pathname.startsWith('/icon') ||
      pathname.startsWith('/apple-icon') ||
      pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)
    ) {
      return NextResponse.next();
    }
    
    // Rediriger vers /login pour toutes les autres routes protégées
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

// Configuration du middleware pour s'appliquer aux routes appropriées
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
