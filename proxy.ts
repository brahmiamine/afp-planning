import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const authSession = request.cookies.get('auth_session');

    const isAuthenticated = authSession?.value === 'authenticated';

    const publicRoutes = ['/login'];
    const isPublicRoute = publicRoutes.includes(pathname) || pathname.startsWith('/api/auth');

    if (pathname === '/login' && isAuthenticated) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    if (!isAuthenticated && !isPublicRoute) {
        if (
            pathname.startsWith('/_next') ||
            pathname.startsWith('/favicon') ||
            pathname.startsWith('/icon') ||
            pathname.startsWith('/apple-icon') ||
            pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)
        ) {
            return NextResponse.next();
        }

        return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
