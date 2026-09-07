import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, PLATFORM_SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { getSessionUser } from '@/lib/auth/session';
import { canEdit } from '@/lib/auth/roles';

// Next.js Proxy s'exécute nativement sur le runtime Node.js, nécessaire à getSessionUser (TypeORM).
const LOGIN_PAGE = '/login';

// Portes d'entrée communes à /club et /mon-planning : partagées, à la racine, avant même
// de savoir dans quel espace la session atterrira.
// /sw.js doit rester accessible sans session : un navigateur refuse d'enregistrer un
// service worker dont le script est servi derrière une redirection (ici, vers /login).
const PUBLIC_PAGE_PATHS = ['/login', '/mot-de-passe-oublie', '/manifest.webmanifest', '/sw.js'];
const PUBLIC_PAGE_PREFIXES = ['/inscription/', '/reinitialiser/'];
// /api/settings expose en lecture les réglages publics d'un club (thème, logo) pour que
// la page de connexion non authentifiée puisse s'afficher personnalisée ; l'écriture (PUT)
// reste protégée par requireRole dans le handler lui-même.
const PUBLIC_API_PREFIXES = ['/api/auth', '/api/cron', '/api/ical', '/api/pwa', '/api/settings'];

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

function homeForUser(user: Awaited<ReturnType<typeof getSessionUser>>): string {
    return user && canEdit(user.roles) ? '/club' : '/mon-planning';
}

/**
 * Un cookie de session bien formé (64 hex) mais que `getSessionUser` ne résout pas
 * (session révoquée, expirée, utilisateur inactif…) doit être purgé : sinon les
 * gardes basées sur le seul format du token renvoient `/login` vers l'espace, que
 * le client relance aussitôt vers `/login` faute de session réelle — boucle infinie
 * `/login` ↔ `/mon-planning`.
 */
function clearStaleSession(response: NextResponse): NextResponse {
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
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
    const hasWellFormedToken = isPlausibleSessionToken(sessionToken?.value);

    const isPublicRoute = PUBLIC_PAGE_PATHS.includes(pathname)
        || PUBLIC_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
        || PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));

    // Les redirections d'entrée (racine, /login) et le filtre admin dépendent de
    // l'identité réelle : on résout la session en base plutôt que de se fier au
    // seul format du token, pour rester cohérent avec /api/auth/me côté client.
    const needsSessionUser = pathname === '/' || pathname === LOGIN_PAGE || isAdminOnlyPage(pathname);
    const sessionUser = needsSessionUser && hasWellFormedToken
        ? await getSessionUser(sessionToken?.value)
        : null;

    // Il n'y a pas de page à la racine "/" : on redirige vers le bon espace selon la session.
    if (pathname === '/') {
        if (!sessionUser) {
            const response = NextResponse.redirect(new URL(LOGIN_PAGE, request.url));
            return hasWellFormedToken ? clearStaleSession(response) : response;
        }
        return NextResponse.redirect(new URL(homeForUser(sessionUser), request.url));
    }

    if (pathname === LOGIN_PAGE) {
        if (sessionUser) {
            return NextResponse.redirect(new URL(homeForUser(sessionUser), request.url));
        }
        // Session absente ou périmée : laisser le formulaire s'afficher et purger un
        // éventuel cookie mort pour casser la boucle de redirection.
        return hasWellFormedToken ? clearStaleSession(NextResponse.next()) : NextResponse.next();
    }

    if (!hasWellFormedToken && !isPublicRoute) {
        if (pathname.startsWith('/api')) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }
        return NextResponse.redirect(new URL(LOGIN_PAGE, request.url));
    }

    if (hasWellFormedToken && isAdminOnlyPage(pathname)) {
        if (!sessionUser || !canEdit(sessionUser.roles)) {
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
