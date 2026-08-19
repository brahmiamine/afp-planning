import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/server';
import { resolvePerson } from '@/lib/auth/users';
import { getDb } from '@/lib/db';
import { APP_SETTINGS_META_KEY, DEFAULT_APP_SETTINGS, normalizeAppSettings } from '@/lib/settings';
import { isPersonRole, type PersonalPlanningEvent } from '@/types/auth';
import type { Match, Entrainement, Plateau } from '@/types/match';

type MatchExtras = {
  confirmed?: boolean;
  arbitreTouche?: unknown;
  contactEncadrants?: unknown;
  contactAccompagnateur?: unknown;
};

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase('fr');
}

function hasAssignedContact(value: unknown, names: Set<string>): boolean {
  const contacts = Array.isArray(value) ? value : value ? [value] : [];

  return contacts.some((contact) => {
    if (!contact || typeof contact !== 'object' || !('nom' in contact)) {
      return false;
    }

    return names.has(normalizeName(String(contact.nom)));
  });
}

function eventSortValue(event: PersonalPlanningEvent): string {
  const match = event.date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return `${event.date}-${event.time}`;
  }

  const [, day = '', month = '', year = ''] = match;
  return `${year}-${month}-${day}T${event.time || '00:00'}`;
}

function locationForMatch(match: Match): string | undefined {
  const stadium = match.details?.stadium?.trim();
  const address = match.details?.address?.trim();

  if (stadium && address) {
    return `${stadium} — ${address}`;
  }

  return stadium || address || (match.venue === 'domicile' ? 'Domicile' : 'Extérieur');
}

function matchToEvent(
  match: Match,
  id: string,
  type: 'match-officiel' | 'match-amical',
  roleLabel: string,
  extra: MatchExtras | undefined,
): PersonalPlanningEvent {
  return {
    id,
    type,
    date: match.date,
    time: match.time,
    title: `${match.localTeam} - ${match.awayTeam}`,
    subtitle: match.competition || match.categorie,
    location: locationForMatch(match),
    roleLabel,
    ...(typeof extra?.confirmed === 'boolean' ? { confirmed: extra.confirmed } : {}),
  };
}

export async function GET() {
  const session = await getCurrentSession();

  if (!session || session.role === 'SUPER_ADMIN' || !isPersonRole(session.role) || typeof session.personId !== 'number') {
    return NextResponse.json({ error: 'Accès personnel requis' }, { status: 403 });
  }

  const person = await resolvePerson(session.role, session.personId);

  if (!person) {
    return NextResponse.json({ error: 'Personne liée au compte introuvable' }, { status: 403 });
  }

  const knownNames = new Set<string>([
    normalizeName(person.nom),
    ...(session.personName ? [normalizeName(session.personName)] : []),
  ]);

  const db = await getDb();
  const [officialRows, friendlyRows, trainingRows, plateauRows, extraRows, settingsRow] = await Promise.all([
    db.getRepository('MatchOfficial').find(),
    db.getRepository('MatchAmical').find(),
    db.getRepository('Entrainement').find(),
    db.getRepository('Plateau').find(),
    db.getRepository('MatchExtra').find(),
    db.getRepository('AppMeta').findOneBy({ key: APP_SETTINGS_META_KEY }),
  ]);

  const extras = new Map<string, MatchExtras>();
  for (const row of extraRows) {
    extras.set(String(row.matchId), row.payload as MatchExtras);
  }

  const events: PersonalPlanningEvent[] = [];
  const roleLabel =
    session.role === 'ARBITRE'
      ? 'Arbitre'
      : session.role === 'ENCADRANT'
        ? 'Encadrant'
        : 'Accompagnateur';

  const isAssignedToMatch = (extra: MatchExtras | undefined): boolean =>
    session.role === 'ARBITRE'
      ? hasAssignedContact(extra?.arbitreTouche, knownNames)
      : session.role === 'ENCADRANT'
        ? hasAssignedContact(extra?.contactEncadrants, knownNames)
        : hasAssignedContact(extra?.contactAccompagnateur, knownNames);

  for (const row of officialRows) {
    const match = row.payload as Match;
    const id = String(row.id);
    const extra = extras.get(id);

    if (isAssignedToMatch(extra)) {
      events.push(matchToEvent(match, id, 'match-officiel', roleLabel, extra));
    }
  }

  for (const row of friendlyRows) {
    const match = row.payload as Match;
    const id = String(row.id);
    const extra = extras.get(id);

    if (isAssignedToMatch(extra)) {
      events.push(matchToEvent(match, id, 'match-amical', roleLabel, extra));
    }
  }

  if (session.role === 'ENCADRANT') {
    for (const row of trainingRows) {
      const training = row.payload as Entrainement;
      if (!hasAssignedContact(training.encadrants, knownNames)) {
        continue;
      }

      events.push({
        id: String(row.id),
        type: 'entrainement',
        date: training.date,
        time: training.time,
        title: training.categorie ? `Entraînement ${training.categorie}` : 'Entraînement',
        subtitle: 'Séance',
        location: training.lieu,
        roleLabel,
      });
    }

    for (const row of plateauRows) {
      const plateau = row.payload as Plateau;
      if (!hasAssignedContact(plateau.encadrants, knownNames)) {
        continue;
      }

      events.push({
        id: String(row.id),
        type: 'plateau',
        date: plateau.date,
        time: plateau.time,
        title: plateau.categories?.length ? `Plateau ${plateau.categories.join(', ')}` : 'Plateau',
        subtitle: 'Plateau',
        location: plateau.lieu,
        roleLabel,
      });
    }
  }

  events.sort((a, b) => eventSortValue(a).localeCompare(eventSortValue(b)));

  let settings = DEFAULT_APP_SETTINGS;
  if (settingsRow?.value) {
    try {
      settings = normalizeAppSettings(JSON.parse(String(settingsRow.value)));
    } catch {
      settings = DEFAULT_APP_SETTINGS;
    }
  }

  return NextResponse.json({
    user: {
      id: session.sub,
      email: session.email,
      role: session.role,
      displayName: person.nom,
    },
    club: {
      name: settings.clubName,
      description: settings.clubDescription,
      logo: settings.clubLogo,
    },
    events,
  });
}
