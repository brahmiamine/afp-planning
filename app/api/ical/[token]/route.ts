import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { planningFeatureGuard } from '@/lib/planning/feature-guard';
import { UserEntity } from '@/lib/db/schemas';
import { Match, Entrainement, Plateau, type PersonType } from '@/types/match';
import { MatchExtras } from '@/hooks/useMatchExtras';
import { generateIcal, type IcalIdentity } from '@/lib/utils/ical-export';
import { getOfficialMatchesMeta } from '@/lib/db/json-migrator';
import { normalizeRoles, readOnlyRolesOf } from '@/lib/auth/roles';
import { readAppSettings } from '@/lib/settings-store';
import { setCurrentClubId } from '@/lib/auth/club-context';
import { personTypeForRole } from '@/lib/planning/person-link';
import { listPublishedPlanningEventSnapshots } from '@/lib/planning/published-planning';
import { hydratePlanningAssignmentStates } from '@/lib/planning/assignment-state-overlay';

type Event = Match | Entrainement | Plateau;

const ROLE_FOR_PERSON_TYPE: Record<PersonType, IcalIdentity['role']> = {
  officiel: 'arbitre',
  encadrant: 'encadrant',
  accompagnateur: 'accompagnateur',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> | { token: string } }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const token = resolvedParams.token;

    const db = await getDb();
    const user = await db.getRepository<UserEntity>('User').findOneBy({ icalToken: token });
    const roles = normalizeRoles(user?.roles);
    if (!user || !user.active || roles.length === 0) {
      return NextResponse.json({ error: 'Lien de calendrier invalide' }, { status: 404 });
    }
    setCurrentClubId(user.clubId);
    const disabled = await planningFeatureGuard(db, 'calendarExport');
    if (disabled) return disabled;

    const clubId = user.clubId;
    const [publishedSnapshotsRaw, meta, settings] = await Promise.all([
      listPublishedPlanningEventSnapshots(db),
      getOfficialMatchesMeta(db, clubId),
      readAppSettings(db, clubId),
    ]);

    let events: Event[];
    const allExtras: Record<string, MatchExtras> = {};

    if (publishedSnapshotsRaw) {
      const publishedSnapshots = await hydratePlanningAssignmentStates(db, publishedSnapshotsRaw, clubId);
      events = publishedSnapshots.map((snapshot) => snapshot.event as Event);
      for (const snapshot of publishedSnapshots) {
        if (snapshot.extras?.id) allExtras[snapshot.extras.id] = snapshot.extras;
      }
    } else {
      const [officialRows, amicalRows, entrainementRows, plateauRows, extraRows] = await Promise.all([
        db.getRepository('MatchOfficial').findBy({ clubId }),
        db.getRepository('MatchAmical').findBy({ clubId }),
        db.getRepository('Entrainement').findBy({ clubId }),
        db.getRepository('Plateau').findBy({ clubId }),
        db.getRepository('MatchExtra').findBy({ clubId }),
      ]);
      events = [
        ...officialRows.map((row) => row.payload as unknown as Match).filter((item) => Boolean(item?.id)),
        ...amicalRows.map((row) => row.payload as unknown as Match).filter((item) => Boolean(item?.id)),
        ...entrainementRows.map((row) => row.payload as unknown as Entrainement).filter((item) => Boolean(item?.id)),
        ...plateauRows.map((row) => row.payload as unknown as Plateau).filter((item) => Boolean(item?.id)),
      ];
      for (const row of extraRows) {
        const payload = row.payload as unknown as MatchExtras;
        if (payload?.id) allExtras[payload.id] = payload;
      }
    }

    const identities: IcalIdentity[] = readOnlyRolesOf(roles).map((role) => {
      const personType = personTypeForRole(role) as PersonType;
      return {
        personNom: user.nom,
        personId: user.id,
        personType,
        role: ROLE_FOR_PERSON_TYPE[personType],
      };
    });

    const icsContent = generateIcal(
      events,
      allExtras,
      meta.club,
      { identities, timeZone: settings.timeZone },
      settings.clubAbbreviation,
    );

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="planning.ics"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Erreur GET ical feed:', error);
    return NextResponse.json({ error: 'Une erreur est survenue' }, { status: 500 });
  }
}
