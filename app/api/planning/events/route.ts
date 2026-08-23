import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import { listPlanningEventSnapshots } from '@/lib/planning/event-store';
import { eventStartTimestamp } from '@/lib/planning/p0-rules';
import { setCurrentClubId } from '@/lib/auth/club-context';

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const type = url.searchParams.get('type');
  const query = url.searchParams.get('q')?.trim().toLowerCase() ?? '';
  const fromTime = from && !Number.isNaN(Date.parse(from)) ? Date.parse(from) : null;
  const toTime = to && !Number.isNaN(Date.parse(to)) ? Date.parse(to) + 24 * 60 * 60_000 - 1 : null;

  const db = await getDb();
  const snapshots = await listPlanningEventSnapshots(db);
  const items = snapshots
    .filter((snapshot) => !type || snapshot.eventType === type)
    .filter((snapshot) => !query || `${snapshot.title} ${snapshot.location ?? ''}`.toLowerCase().includes(query))
    .filter((snapshot) => {
      const time = eventStartTimestamp(snapshot.date, snapshot.time);
      if (time === null) return fromTime === null && toTime === null;
      return (fromTime === null || time >= fromTime) && (toTime === null || time <= toTime);
    })
    .sort((a, b) => (eventStartTimestamp(a.date, a.time) ?? 0) - (eventStartTimestamp(b.date, b.time) ?? 0))
    .map((snapshot) => ({
      eventId: snapshot.eventId,
      eventType: snapshot.eventType,
      title: snapshot.title,
      date: snapshot.date,
      time: snapshot.time,
      durationMinutes: snapshot.durationMinutes,
      location: snapshot.location,
      planningStatus: snapshot.planningStatus,
      counts: Object.fromEntries(Object.entries(snapshot.assignments).map(([role, contacts]) => [role, contacts.length])),
    }));
  return NextResponse.json({ items });
}
