import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
    APP_SETTINGS_META_KEY,
    DEFAULT_APP_SETTINGS,
    normalizeAppSettings,
    type AppSettings,
} from '@/lib/settings';

async function readSettings(): Promise<AppSettings> {
    const db = await getDb();
    const repo = db.getRepository('AppMeta');
    const row = await repo.findOne({ where: { key: APP_SETTINGS_META_KEY } });

    if (!row?.value) {
        return DEFAULT_APP_SETTINGS;
    }

    try {
        const parsed = JSON.parse(row.value) as unknown;
        return normalizeAppSettings(parsed);
    } catch {
        return DEFAULT_APP_SETTINGS;
    }
}

export async function GET() {
    try {
        const settings = await readSettings();
        return NextResponse.json(settings);
    } catch (error) {
        console.error('Error reading app settings:', error);
        return NextResponse.json({ error: 'Failed to read settings' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const payload = await request.json();
        const settings = normalizeAppSettings(payload);

        const db = await getDb();
        const repo = db.getRepository('AppMeta');
        await repo.save({ key: APP_SETTINGS_META_KEY, value: JSON.stringify(settings) });

        return NextResponse.json({ success: true, settings });
    } catch (error) {
        console.error('Error updating app settings:', error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}
