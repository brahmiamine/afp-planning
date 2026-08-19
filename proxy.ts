import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AFP_SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/apple-icon') ||
    /\.(svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname)
  );
}

function isPublicRoute(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;

  if (pathname === '/login' || pathname === '/api/auth/login') {
    return true;
  }

  return pathname === '/api/settings' && request.method === 'GET';
}

function isPersonalRoute(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;

  if (pathname === '/me' || pathname.startsWith('/api/me/')) {
    return true;
  }

  if (pathname === '/api/auth/check' || pathname === '/api/auth/logout') {
    return true;
  }

  return pathname === '/api/settings' && request.method === 'GET';
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AFP_SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (pathname === '/login' && session) {
    return NextResponse.redirect(new URL(session.role === 'SUPER_ADMIN' ? '/' : '/me', request.url));
  }

  if (!session) {
    if (isPublicRoute(request) || pathname === '/api/auth/check' || pathname === '/api/auth/logout') {
      return NextResponse.next();
    }

    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
    }

    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (session.role !== 'SUPER_ADMIN' && !isPersonalRoute(request)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    return NextResponse.redirect(new URL('/me', request.url));
  }

  if (session.role === 'SUPER_ADMIN' && pathname === '/me') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
