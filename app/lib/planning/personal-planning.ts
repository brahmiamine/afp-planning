import type { DataSource } from 'typeorm';
import type { SessionUser } from '@/lib/auth/session';
import type {
  EntrainementEntity,
  MatchAmicalEntity,
  MatchExtraEntity,
  MatchOfficialEntity,
  PlateauEntity,
} from '@/lib/db/schemas';
import type {
  AssignmentContact,
  AssignmentStatus,
  AttendanceStatus,
  Entrainement,
  Match,
  Plateau,
} from '@/types/match';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import { personIdentityMatches } from './person-link';
import { extractMinutes, normalizeDateValue } from '@/lib/utils/officiel-availability';
import { readOnlyRolesOf } from '@/lib/auth/roles';
import {
  assignmentStatus,
  attendanceStatus,
  eventEndTimestamp,
  isAttendancePending,
  isVisiblePublicationStatus,
  normalizePlanningStatus,
} from './p0-rules';

export type PersonalEventType = 'officiel' | 'amical' | 'entrainement' | 'plateau';
export type PersonalAssignmentRole = 'arbitre' | 'encadrant' | 'accompagnateur';

export interface PersonalAssignment {
  assignmentId: string;
  eventId: string;
  eventType: PersonalEventType;
  role: PersonalAssignmentRole;
  status: AssignmentStatus;
  attendanceStatus: AttendanceStatus;
  respondedAt: string | null;
  date: string;
  time: string;
  durationMinutes: number;
  title: string;
  categorie: string | null;
  lieu: string | null;
  adresse: string | null;
  itineraryLink: string | null;
  rendezVous: string | null;
  seriesId: string | null;
  confirmed: boolean | null;
}

export interface PersonalPlanningStats {
  total: number;
  upcoming: number;
  past: number;
  pending: number;
  accepted: number;
  declined: number;
  officiel: number;
  amical: number;
  entrainement: number;
  plateau: number;
  present: number;
  excused: number;
  absent: number;
  replaced: number;
  attendancePending: number;
}

function matchContact(user: SessionUser, contact: AssignmentContact): boolean {
  return personIdentityMatches(contact, user);
}

function dateTimeValue(date: string, time: string): number {
  const normalized = normalizeDateValue(date);
  if (!normalized) return 0;
  const [dayRaw, monthRaw, yearRaw] = normalized.split('/');
  const day = Number.parseInt(dayRaw ?? '', 10);
  const month = Number.parseInt(monthRaw ?? '', 10);
  const year = Number.parseInt(yearRaw ?? '', 10);
  const minutes = extractMinutes(time) ?? 0;
  if (!day || !month || !year) return 0;
  return Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
}

const CONTACTS_BY_ROLE: Record<
  PersonalAssignmentRole,
  keyof Pick<MatchExtras, 'arbitreTouche' | 'contactEncadrants' | 'contactAccompagnateur'>
> = {
  arbitre: 'arbitreTouche',
  encadrant: 'contactEncadrants',
  accompagnateur: 'contactAccompagnateur',
};

function buildMatchAssignments(
  user: SessionUser,
  eventType: 'officiel' | 'amical',
  match: Match,
  extras: MatchExtras | undefined,
): PersonalAssignment[] {
  if (!match.id || !extras) return [];
  if (!isVisiblePublicationStatus(normalizePlanningStatus(extras.planningStatus))) return [];

  const assignments: PersonalAssignment[] = [];
  for (const role of readOnlyRolesOf(user.roles) as PersonalAssignmentRole[]) {
    const field = CONTACTS_BY_ROLE[role];
    const contacts = extras[field];
    const contact = contacts?.find((item) => matchContact(user, item));
    if (!contact) continue;

    assignments.push({
      assignmentId: `${eventType}:${match.id}:${role}`,
      eventId: match.id,
      eventType,
      role,
      status: assignmentStatus(contact),
      attendanceStatus: attendanceStatus(contact),
      respondedAt: contact.respondedAt ?? null,
      date: match.date,
      time: match.time,
      durationMinutes: match.durationMinutes ?? 90,
      title: `${match.localTeam} – ${match.awayTeam}`,
      categorie: match.categorie ?? match.competition ?? null,
      lieu: match.details?.stadium ?? null,
      adresse: match.details?.address ?? null,
      itineraryLink: match.details?.itineraryLink ?? null,
      rendezVous: match.horaireRendezVous || null,
      seriesId: match.seriesId ?? null,
      confirmed: extras.confirmed ?? null,
    });
  }
  return assignments;
}

function buildSimpleAssignment(
  user: SessionUser,
  eventType: 'entrainement' | 'plateau',
  event: Entrainement | Plateau,
): PersonalAssignment | null {
  if (!readOnlyRolesOf(user.roles).includes('encadrant')) return null;
  if (!isVisiblePublicationStatus(normalizePlanningStatus(event.planningStatus))) return null;
  const contact = event.encadrants?.find((item) => matchContact(user, item));
  if (!contact) return null;

  const categorie = event.type === 'entrainement'
    ? event.categorie ?? null
    : event.categories?.join(', ') ?? null;

  return {
    assignmentId: `${eventType}:${event.id}:encadrant`,
    eventId: event.id,
    eventType,
    role: 'encadrant',
    status: assignmentStatus(contact),
    attendanceStatus: attendanceStatus(contact),
    respondedAt: contact.respondedAt ?? null,
    date: event.date,
    time: event.time,
    durationMinutes: event.durationMinutes ?? 90,
    title: event.type === 'entrainement' ? 'Entraînement' : 'Plateau',
    categorie,
    lieu: event.lieu || null,
    adresse: null,
    itineraryLink: null,
    rendezVous: null,
    seriesId: event.seriesId ?? null,
    confirmed: null,
  };
}

export async function listPersonalAssignments(
  db: DataSource,
  user: SessionUser,
): Promise<PersonalAssignment[]> {
  const [officialRows, amicalRows, trainingRows, plateauRows, extraRows] = await Promise.all([
    db.getRepository<MatchOfficialEntity>('MatchOfficial').find(),
    db.getRepository<MatchAmicalEntity>('MatchAmical').find(),
    db.getRepository<EntrainementEntity>('Entrainement').find(),
    db.getRepository<PlateauEntity>('Plateau').find(),
    db.getRepository<MatchExtraEntity>('MatchExtra').find(),
  ]);

  const extras = new Map<string, MatchExtras>();
  for (const row of extraRows) {
    const payload = row.payload as unknown as MatchExtras;
    extras.set(row.matchId, payload);
  }

  const assignments: PersonalAssignment[] = [];
  for (const row of officialRows) {
    const match = row.payload as unknown as Match;
    assignments.push(...buildMatchAssignments(user, 'officiel', match, match.id ? extras.get(match.id) : undefined));
  }
  for (const row of amicalRows) {
    const match = row.payload as unknown as Match;
    assignments.push(...buildMatchAssignments(user, 'amical', match, match.id ? extras.get(match.id) : undefined));
  }
  for (const row of trainingRows) {
    const item = buildSimpleAssignment(user, 'entrainement', row.payload as unknown as Entrainement);
    if (item) assignments.push(item);
  }
  for (const row of plateauRows) {
    const item = buildSimpleAssignment(user, 'plateau', row.payload as unknown as Plateau);
    if (item) assignments.push(item);
  }

  return assignments.sort((a, b) => dateTimeValue(a.date, a.time) - dateTimeValue(b.date, b.time));
}

export function buildPersonalPlanningStats(assignments: PersonalAssignment[]): PersonalPlanningStats {
  const now = Date.now();
  return assignments.reduce<PersonalPlanningStats>((stats, assignment) => {
    stats.total += 1;
    const end = eventEndTimestamp(assignment.date, assignment.time, assignment.durationMinutes);
    if (end !== null && end < now) stats.past += 1;
    else stats.upcoming += 1;
    stats[assignment.status] += 1;
    stats[assignment.eventType] += 1;

    if (assignment.attendanceStatus === 'present') stats.present += 1;
    if (assignment.attendanceStatus === 'excused') stats.excused += 1;
    if (assignment.attendanceStatus === 'absent') stats.absent += 1;
    if (assignment.attendanceStatus === 'replaced') stats.replaced += 1;

    const syntheticContact: AssignmentContact = {
      nom: '',
      numero: '',
      status: assignment.status,
      attendanceStatus: assignment.attendanceStatus,
    };
    if (isAttendancePending(syntheticContact, end, now)) stats.attendancePending += 1;
    return stats;
  }, {
    total: 0,
    upcoming: 0,
    past: 0,
    pending: 0,
    accepted: 0,
    declined: 0,
    officiel: 0,
    amical: 0,
    entrainement: 0,
    plateau: 0,
    present: 0,
    excused: 0,
    absent: 0,
    replaced: 0,
    attendancePending: 0,
  });
}
