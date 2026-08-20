import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { normalizeAppSettings } from '@/lib/settings';
import { readAppSettings, updateAppSettings } from '@/lib/settings-store';

const SUPERADMIN_ONLY = ['superadmin'] as const;

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, [...SUPERADMIN_ONLY]);
  if ('error' in auth) return auth.error;
  try {
    const settings = await readAppSettings(await getDb());
    return NextResponse.json({ features: settings.features, timeZone: settings.timeZone });
  } catch (error) {
    console.error('Planning feature settings read failed:', error);
    return NextResponse.json({ error: 'Impossible de charger les fonctionnalités' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, [...SUPERADMIN_ONLY]);
  if ('error' in auth) return auth.error;
  try {
    const db = await getDb();
    const body = await request.json();
    const requestedFeatures = body?.features && typeof body.features === 'object' ? body.features : {};
    const settings = await updateAppSettings(db, (current) => normalizeAppSettings({
      ...current,
      features: { ...current.features, ...requestedFeatures },
      timeZone: body?.timeZone ?? current.timeZone,
    }));
    return NextResponse.json({ success: true, features: settings.features, timeZone: settings.timeZone });
  } catch (error) {
    console.error('Planning feature settings update failed:', error);
    return NextResponse.json({ error: 'Impossible de modifier les fonctionnalités' }, { status: 500 });
  }
}
