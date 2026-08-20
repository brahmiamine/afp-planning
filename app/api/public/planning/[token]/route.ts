import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { listPlanningEventSnapshots } from '@/lib/planning/event-store';
import { isVisiblePublicationStatus } from '@/lib/planning/p0-rules';
import { listPlanningRecords } from '@/lib/planning/records';
import {
  hashShareToken,
  isSnapshotInShareScope,
  toPublicPlanningItem,
  type PublicShareScope,
} from '@/lib/planning/public-share';
import { planningFeatureGuard } from '@/lib/planning/feature-guard';
import { setCurrentClubId } from '@/lib/auth/club-context';

interface PublicSharePayload {
  tokenHash: string;
  expiresAt: string;
  scope: PublicShareScope;
  createdByUserId: number;
}

function hashMatches(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) {
    return NextResponse.json({ error: 'Lien de partage invalide' }, { status: 404 });
  }

  try {
    const db = await getDb();
    const hash = hashShareToken(token);
    const shares = await listPlanningRecords<PublicSharePayload>(db, { kind: 'public-share', clubId: null }, 1000);
    const share = shares.find((record) => hashMatches(record.payload.tokenHash, hash));
    if (!share || Date.parse(share.payload.expiresAt) <= Date.now()) {
      return NextResponse.json({ error: 'Lien de partage expiré ou invalide' }, { status: 404 });
    }
    setCurrentClubId(share.clubId);
    const disabled = await planningFeatureGuard(db, 'publicSharing');
    if (disabled) return disabled;

    const items = (await listPlanningEventSnapshots(db))
      .filter((snapshot) => isVisiblePublicationStatus(snapshot.planningStatus))
      .filter((snapshot) => isSnapshotInShareScope(snapshot, share.payload.scope))
      .map(toPublicPlanningItem);

    return NextResponse.json(
      { expiresAt: share.payload.expiresAt, items },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    );
  } catch (error) {
    console.error('Public planning share failed:', error);
    return NextResponse.json({ error: 'Impossible de charger ce planning' }, { status: 500 });
  }
}
