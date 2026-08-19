import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';

const PUBLIC_PAGE_PATHS = ['/login'];
const PUBLIC_PAGE_PREFIXES = ['/inscription/'];
const PUBLIC_API_PREFIXES = ['/api/auth', '/api/cron', '/api/ical'];

function isPlausibleSessionToken(value: string | undefined): boolean {
    return !!value && /^[a-f0-9]{64}$/.test(value);
}

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME);
    const isAuthenticated = isPlausibleSessionToken(sessionToken?.value);

    const isPublicPage = PUBLIC_PAGE_PATHS.includes(pathname)
        || PUBLIC_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    const isPublicApi = PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    const isPublicRoute = isPublicPage || isPublicApi;

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

        if (pathname.startsWith('/api')) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
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
