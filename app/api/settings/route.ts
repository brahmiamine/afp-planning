import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
    normalizeAppSettings,
    type AppSettings,
} from '@/lib/settings';
import { readAppSettings, updateAppSettings } from '@/lib/settings-store';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { getSessionUser } from '@/lib/auth/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';

/** Résout le club dont on affiche les réglages publics (page de connexion non authentifiée incluse). */
async function publicClubId(request: NextRequest): Promise<string> {
    const user = await getSessionUser(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    if (user) return user.clubId;
    const fromQuery = request.nextUrl.searchParams.get('club')?.trim();
    return fromQuery || process.env.APP_CLUB_ID || 'afp';
}

/**
 * Les paramètres de scraping sont administrés exclusivement depuis /plateforme.
 * Ils ne sont jamais exposés par l'API de configuration d'un club.
 */
function toClubVisibleSettings(settings: AppSettings): AppSettings {
    return {
        ...settings,
        matchesUrlKey: '',
        scraperClubName: '',
    };
}

export async function GET(request: NextRequest) {
    try {
        const settings = await readAppSettings(await getDb(), await publicClubId(request));
        return NextResponse.json(toClubVisibleSettings(settings));
    } catch (error) {
        console.error('Error reading app settings:', error);
        return NextResponse.json({ error: 'Failed to read settings' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const auth = await requireRole(request, WRITE_ROLES);
    if ('error' in auth) {
        return auth.error;
    }

    try {
        const db = await getDb();
        const payload = await request.json();
        const isSuperadmin = auth.user.roles.includes('superadmin');
        const rawSmtpPassword = payload && typeof payload === 'object' && payload.smtp && typeof payload.smtp === 'object'
            ? (payload.smtp as Record<string, unknown>).password
            : undefined;
        const smtpPassword = typeof rawSmtpPassword === 'string' ? rawSmtpPassword : undefined;
        const settings = await updateAppSettings(db, auth.user.clubId, (current) => {
            const requested = normalizeAppSettings(payload);
            return {
                ...requested,
                matchesUrlKey: current.matchesUrlKey,
                scraperClubName: current.scraperClubName,
                features: isSuperadmin ? requested.features : current.features,
                timeZone: isSuperadmin ? requested.timeZone : current.timeZone,
            };
        }, isSuperadmin ? smtpPassword : undefined);

        return NextResponse.json({ success: true, settings: toClubVisibleSettings(settings) });
    } catch (error) {
        console.error('Error updating app settings:', error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}
