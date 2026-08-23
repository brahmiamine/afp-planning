import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import type { AssignmentContact, Entrainement, Match, Plateau } from '@/types/match';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import type {
  EntrainementEntity,
  MatchAmicalEntity,
  MatchExtraEntity,
  MatchOfficialEntity,
  PlateauEntity,
} from '@/lib/db/schemas';
import { setCurrentClubId } from '@/lib/auth/club-context';

interface OverviewItem {
  eventId: string;
  eventType: 'officiel' | 'amical' | 'entrainement' | 'plateau';
  title: string;
  date: string;
  time: string;
  missingRoles: string[];
  pending: number;
  declined: number;
}

function countStatuses(contacts: AssignmentContact[] | undefined) {
  return (contacts ?? []).reduce((acc, contact) => {
    const status = contact.status ?? 'pending';
    if (status === 'pending') acc.pending += 1;
    if (status === 'declined') acc.declined += 1;
    return acc;
  }, { pending: 0, declined: 0 });
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  try {
    const db = await getDb();
    const [officialRows, friendlyRows, trainingRows, plateauRows, extraRows] = await Promise.all([
      db.getRepository<MatchOfficialEntity>('MatchOfficial').findBy({ clubId: auth.user.clubId }),
      db.getRepository<MatchAmicalEntity>('MatchAmical').findBy({ clubId: auth.user.clubId }),
      db.getRepository<EntrainementEntity>('Entrainement').findBy({ clubId: auth.user.clubId }),
      db.getRepository<PlateauEntity>('Plateau').findBy({ clubId: auth.user.clubId }),
      db.getRepository<MatchExtraEntity>('MatchExtra').findBy({ clubId: auth.user.clubId }),
    ]);

    const extras = new Map<string, MatchExtras>();
    extraRows.forEach((row) => extras.set(row.matchId, row.payload as unknown as MatchExtras));
    const items: OverviewItem[] = [];

    const addMatch = (match: Match, eventType: 'officiel' | 'amical') => {
      if (!match.id) return;
      const extra = extras.get(match.id);
      const missingRoles: string[] = [];
      if (!extra?.arbitreTouche?.length) missingRoles.push('Arbitre');
      if (!extra?.contactEncadrants?.length) missingRoles.push('Encadrant');
      if (!extra?.contactAccompagnateur?.length) missingRoles.push('Accompagnateur');
      const allContacts = [
        ...(extra?.arbitreTouche ?? []),
        ...(extra?.contactEncadrants ?? []),
        ...(extra?.contactAccompagnateur ?? []),
      ];
      const statuses = countStatuses(allContacts);
      items.push({
        eventId: match.id,
        eventType,
        title: `${match.localTeam} – ${match.awayTeam}`,
        date: match.date,
        time: match.time,
        missingRoles,
        ...statuses,
      });
    };

    officialRows.forEach((row) => addMatch(row.payload as unknown as Match, 'officiel'));
    friendlyRows.forEach((row) => addMatch(row.payload as unknown as Match, 'amical'));

    trainingRows.forEach((row) => {
      const event = row.payload as unknown as Entrainement;
      const statuses = countStatuses(event.encadrants);
      items.push({
        eventId: event.id,
        eventType: 'entrainement',
        title: event.categorie ? `Entraînement ${event.categorie}` : 'Entraînement',
        date: event.date,
        time: event.time,
        missingRoles: event.encadrants?.length ? [] : ['Encadrant'],
        ...statuses,
      });
    });

    plateauRows.forEach((row) => {
      const event = row.payload as unknown as Plateau;
      const statuses = countStatuses(event.encadrants);
      items.push({
        eventId: event.id,
        eventType: 'plateau',
        title: event.categories?.length ? `Plateau ${event.categories.join(', ')}` : 'Plateau',
        date: event.date,
        time: event.time,
        missingRoles: event.encadrants?.length ? [] : ['Encadrant'],
        ...statuses,
      });
    });

    const attention = items.filter((item) => item.missingRoles.length > 0 || item.declined > 0 || item.pending > 0);
    return NextResponse.json({
      totals: {
        events: items.length,
        complete: items.filter((item) => item.missingRoles.length === 0 && item.declined === 0 && item.pending === 0).length,
        attention: attention.length,
        missingRoles: items.reduce((sum, item) => sum + item.missingRoles.length, 0),
        pending: items.reduce((sum, item) => sum + item.pending, 0),
        declined: items.reduce((sum, item) => sum + item.declined, 0),
      },
      items: attention,
    });
  } catch (error) {
    console.error('Error building planning overview:', error);
    return NextResponse.json({ error: 'Impossible de contrôler le planning' }, { status: 500 });
  }
}
