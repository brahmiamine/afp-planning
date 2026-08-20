import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
    normalizeAppSettings,
} from '@/lib/settings';
import { readAppSettings, updateAppSettings } from '@/lib/settings-store';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';

export async function GET() {
    try {
        const settings = await readAppSettings(await getDb());
        return NextResponse.json(settings);
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
        const settings = await updateAppSettings(db, (current) => {
            const requested = normalizeAppSettings(payload);
            return {
                ...requested,
                features: isSuperadmin ? requested.features : current.features,
                timeZone: isSuperadmin ? requested.timeZone : current.timeZone,
            };
        });

        return NextResponse.json({ success: true, settings });
    } catch (error) {
        console.error('Error updating app settings:', error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}
