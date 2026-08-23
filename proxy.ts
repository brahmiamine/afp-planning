import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, PLATFORM_SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { getSessionUser } from '@/lib/auth/session';
import { canEdit } from '@/lib/auth/roles';

// Next.js Proxy s'exécute nativement sur le runtime Node.js, nécessaire à getSessionUser (TypeORM).
const LOGIN_PAGE = '/login';

// Portes d'entrée communes à /club et /mon-planning : partagées, à la racine, avant même
// de savoir dans quel espace la session atterrira.
const PUBLIC_PAGE_PATHS = ['/login', '/mot-de-passe-oublie', '/manifest.webmanifest'];
const PUBLIC_PAGE_PREFIXES = ['/inscription/', '/reinitialiser/'];
const PUBLIC_API_PREFIXES = ['/api/auth', '/api/cron', '/api/ical', '/api/pwa'];

const PLATFORM_LOGIN_PAGE = '/plateforme/login';
const PLATFORM_LOGIN_API = '/api/plateforme/login';

function isPlausibleSessionToken(value: string | undefined): boolean {
    return !!value && /^[a-f0-9]{64}$/.test(value);
}

/** true pour tout ce qui vit sous /club/... (espace admin, séparé de /mon-planning). */
function isAdminOnlyPage(pathname: string): boolean {
    return pathname === '/club' || pathname.startsWith('/club/');
}

/**
 * /plateforme est un espace distinct (comptes platform_admins, cookie séparé) : il ne doit
 * jamais dépendre d'une session club, sous peine de rendre la connexion plateforme impossible.
 */
function isPlatformRoute(pathname: string): boolean {
    return pathname === '/plateforme' || pathname.startsWith('/plateforme/')
        || pathname === '/api/plateforme' || pathname.startsWith('/api/plateforme/');
}

function handlePlatformRoute(request: NextRequest, pathname: string) {
    if (pathname === PLATFORM_LOGIN_PAGE || pathname === PLATFORM_LOGIN_API) {
        return NextResponse.next();
    }

    const platformToken = request.cookies.get(PLATFORM_SESSION_COOKIE_NAME);
    const isPlatformAuthenticated = isPlausibleSessionToken(platformToken?.value);

    if (!isPlatformAuthenticated) {
        if (pathname.startsWith('/api')) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }
        return NextResponse.redirect(new URL(PLATFORM_LOGIN_PAGE, request.url));
    }

    return NextResponse.next();
}

function isStaticAsset(pathname: string): boolean {
    return pathname.startsWith('/_next')
        || pathname.startsWith('/favicon')
        || pathname.startsWith('/icon')
        || pathname.startsWith('/apple-icon')
        || /\.(svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname);
}

async function homeForSession(sessionToken: string | undefined): Promise<string> {
    const user = await getSessionUser(sessionToken);
    return user && canEdit(user.roles) ? '/club' : '/mon-planning';
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (isPlatformRoute(pathname)) {
        return handlePlatformRoute(request, pathname);
    }

    if (isStaticAsset(pathname)) {
        return NextResponse.next();
    }

    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME);
    const isAuthenticated = isPlausibleSessionToken(sessionToken?.value);

    const isPublicRoute = PUBLIC_PAGE_PATHS.includes(pathname)
        || PUBLIC_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
        || PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));

    // Il n'y a pas de page à la racine "/" : on redirige vers le bon espace selon la session.
    if (pathname === '/') {
        if (!isAuthenticated) {
            return NextResponse.redirect(new URL(LOGIN_PAGE, request.url));
        }
        const target = await homeForSession(sessionToken?.value);
        return NextResponse.redirect(new URL(target, request.url));
    }

    if (pathname === LOGIN_PAGE && isAuthenticated) {
        const target = await homeForSession(sessionToken?.value);
        return NextResponse.redirect(new URL(target, request.url));
    }

    if (!isAuthenticated && !isPublicRoute) {
        if (pathname.startsWith('/api')) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }
        return NextResponse.redirect(new URL(LOGIN_PAGE, request.url));
    }

    if (isAuthenticated && isAdminOnlyPage(pathname)) {
        const user = await getSessionUser(sessionToken?.value);
        if (!user || !canEdit(user.roles)) {
            return NextResponse.redirect(new URL('/mon-planning', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
