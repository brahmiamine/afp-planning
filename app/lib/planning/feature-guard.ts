import { NextResponse } from 'next/server';
import type { DataSource } from 'typeorm';
import type { PlanningFeatureFlags } from '@/lib/settings';
import { isPlanningFeatureEnabled } from '@/lib/settings-store';
import { getCurrentClubId } from '@/lib/auth/club-context';

export async function planningFeatureGuard(
  db: DataSource,
  feature: keyof PlanningFeatureFlags,
): Promise<NextResponse | null> {
  if (await isPlanningFeatureEnabled(db, getCurrentClubId(), feature)) return null;
  return NextResponse.json(
    { error: 'Cette fonctionnalité est désactivée par l\'administrateur.', feature },
    { status: 409 },
  );
}
