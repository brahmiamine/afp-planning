import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { MatchesData } from '@/types/match';
import { groupMatchesByDate } from '@/lib/db/helpers';
import { getOfficialMatchesMeta, toMatchPayload } from '@/lib/db/json-migrator';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const db = await getDb();
    const repo = db.getRepository('MatchOfficial');
    const rows = await repo.find();
    const meta = await getOfficialMatchesMeta(db);

    const matches = rows
      .map((row) => toMatchPayload(row.payload as unknown as Record<string, unknown>))
      .filter((item) => Boolean(item?.id));

    const matchesData: MatchesData = {
      club: meta.club,
      url: meta.url,
      scrapedAt: meta.scrapedAt,
      matches: groupMatchesByDate(matches),
    };

    return NextResponse.json(matchesData);
  } catch (error) {
    console.error('Error reading matches from DB:', error);
    return NextResponse.json({ error: 'Failed to load matches' }, { status: 500 });
  }
}
