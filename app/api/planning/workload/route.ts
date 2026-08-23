import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { parseDateString } from '@/lib/utils/date';
import type { AssignmentContact, Entrainement, Match, Plateau, PersonType } from '@/types/match';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import type {
  EntrainementEntity,
  MatchAmicalEntity,
  MatchExtraEntity,
  MatchOfficialEntity,
  PlateauEntity,
} from '@/lib/db/schemas';
import { setCurrentClubId } from '@/lib/auth/club-context';

interface WorkloadEntry {
  nom: string;
  personType: PersonType;
  total: number;
  upcoming: number;
  declined: number;
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const entries = new Map<string, WorkloadEntry>();
    const tally = (contacts: AssignmentContact[] | undefined, personType: PersonType, date: string) => {
      (contacts ?? []).forEach((contact) => {
        const nom = contact.nom?.trim();
        if (!nom) return;
        const key = `${personType}::${nom.toLowerCase()}`;
        const entry = entries.get(key) ?? { nom, personType, total: 0, upcoming: 0, declined: 0 };
        entry.total += 1;
        const parsed = parseDateString(date);
        if (!Number.isNaN(parsed.getTime()) && parsed.getTime() >= today.getTime()) entry.upcoming += 1;
        if (contact.status === 'declined') entry.declined += 1;
        entries.set(key, entry);
      });
    };

    const tallyMatch = (match: Match) => {
      if (!match.id) return;
      const extra = extras.get(match.id);
      tally(extra?.arbitreTouche, 'officiel', match.date);
      tally(extra?.contactEncadrants, 'encadrant', match.date);
      tally(extra?.contactAccompagnateur, 'accompagnateur', match.date);
    };

    officialRows.forEach((row) => tallyMatch(row.payload as unknown as Match));
    friendlyRows.forEach((row) => tallyMatch(row.payload as unknown as Match));
    trainingRows.forEach((row) => {
      const event = row.payload as unknown as Entrainement;
      tally(event.encadrants, 'encadrant', event.date);
    });
    plateauRows.forEach((row) => {
      const event = row.payload as unknown as Plateau;
      tally(event.encadrants, 'encadrant', event.date);
    });

    const sorted = Array.from(entries.values()).sort((a, b) => b.total - a.total);
    return NextResponse.json({ entries: sorted });
  } catch (error) {
    console.error('Error building planning workload:', error);
    return NextResponse.json({ error: 'Impossible de calculer la charge des officiels' }, { status: 500 });
  }
}
