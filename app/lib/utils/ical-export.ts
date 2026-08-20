import { Match, Entrainement, Plateau, ClubInfo, type AssignmentContact, type PersonType } from '@/types/match';
import { MatchExtras } from '@/hooks/useMatchExtras';
import { getEventDurationMinutes, type AssignmentRole } from './assignment-conflicts';

type Event = Match | Entrainement | Plateau;

function isMatchEvent(event: Event): event is Match {
  return 'localTeam' in event || 'competition' in event;
}

function parseEventDate(date: string, time?: string): Date | null {
  const dateMatch = date.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!dateMatch) return null;
  const day = Number.parseInt(dateMatch[1] ?? '', 10);
  const month = Number.parseInt(dateMatch[2] ?? '', 10);
  const year = Number.parseInt(dateMatch[3] ?? '', 10);
  let hours = 0;
  let minutes = 0;
  const timeMatch = time?.match(/(\d{1,2})[:hH](\d{2})/);
  if (timeMatch) {
    hours = Number.parseInt(timeMatch[1] ?? '0', 10);
    minutes = Number.parseInt(timeMatch[2] ?? '0', 10);
  }
  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIcalUtcTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcalText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = ' ' + rest.slice(75);
  }
  chunks.push(rest);
  return chunks.join('\r\n');
}

function getEventTitle(event: Event): string {
  if (isMatchEvent(event)) return `${event.localTeam} vs ${event.awayTeam}`;
  if (event.type === 'entrainement') return `Entraînement${event.categorie ? ` — ${event.categorie}` : ''}`;
  if (event.type === 'plateau') return `Plateau${event.categories?.length ? ` — ${event.categories.join(', ')}` : ''}`;
  return 'Événement';
}

function getEventLocation(event: Event): string {
  if (isMatchEvent(event)) return event.details?.stadium || '';
  return event.lieu || '';
}

function getEventDescription(event: Event, extras: MatchExtras | undefined): string {
  const lines: string[] = [];
  if (isMatchEvent(event)) {
    if (event.competition) lines.push(`Compétition: ${event.competition}`);
    if (event.details?.address) lines.push(`Adresse: ${event.details.address}`);
    if (extras?.arbitreTouche?.length) lines.push(`Arbitre AFP: ${extras.arbitreTouche.map((c) => c.nom).join(', ')}`);
    if (extras?.contactEncadrants?.length) lines.push(`Encadrants: ${extras.contactEncadrants.map((c) => c.nom).join(', ')}`);
    if (extras?.contactAccompagnateur?.length) lines.push(`Accompagnateurs: ${extras.contactAccompagnateur.map((c) => c.nom).join(', ')}`);
  } else if (event.encadrants?.length) {
    lines.push(`Encadrants: ${event.encadrants.map((c) => c.nom).join(', ')}`);
  }
  return lines.join('\\n');
}

export interface GenerateIcalOptions {
  personNom?: string;
  personId?: number;
  personType?: PersonType;
  role?: AssignmentRole | 'all';
}

function contactMatches(contact: AssignmentContact, options: GenerateIcalOptions): boolean {
  // A stable id+type is authoritative when present: names can collide or change,
  // so don't fall back to name matching once we have a real identity to compare.
  if (options.personId !== undefined && options.personType) {
    return contact.personId === options.personId && contact.personType === options.personType;
  }
  const name = options.personNom?.toLowerCase().trim();
  return !!name && contact.nom.toLowerCase().trim() === name;
}

function eventMatchesPerson(
  event: Event,
  allExtras: Record<string, MatchExtras>,
  options: GenerateIcalOptions,
): boolean {
  const role = options.role || 'all';
  if (isMatchEvent(event)) {
    const extras = event.id ? allExtras[event.id] : undefined;
    if (!extras) return false;
    const lists: Array<{ role: AssignmentRole; contacts?: AssignmentContact[] }> = [
      { role: 'arbitre', contacts: extras.arbitreTouche },
      { role: 'encadrant', contacts: extras.contactEncadrants },
      { role: 'accompagnateur', contacts: extras.contactAccompagnateur },
    ];
    return lists.some((list) => (role === 'all' || role === list.role) && (list.contacts || []).some((contact) => contactMatches(contact, options)));
  }
  if (role !== 'all' && role !== 'encadrant') return false;
  return (event.encadrants || []).some((contact) => contactMatches(contact, options));
}

export function generateIcal(
  events: Event[],
  allExtras: Record<string, MatchExtras>,
  club?: ClubInfo,
  options?: GenerateIcalOptions,
): string {
  const hasPersonFilter = options && (options.personId !== undefined || Boolean(options.personNom));
  const filteredEvents = hasPersonFilter && options
    ? events.filter((event) => eventMatchesPerson(event, allExtras, options))
    : events;

  const now = toIcalUtcTimestamp(new Date());
  const calendarName = club?.name || 'AFP Planning';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AFP Planning//FR',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcalText(calendarName)}`,
  ];

  for (const event of filteredEvents) {
    const start = parseEventDate(event.date, event.time);
    if (!start || !event.id) continue;
    const end = new Date(start.getTime() + getEventDurationMinutes(event) * 60 * 1000);
    const extras = isMatchEvent(event) ? allExtras[event.id] : undefined;

    lines.push('BEGIN:VEVENT');
    lines.push(foldLine(`UID:${event.id}@afp-planning`));
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${toIcalUtcTimestamp(start)}`);
    lines.push(`DTEND:${toIcalUtcTimestamp(end)}`);
    lines.push(foldLine(`SUMMARY:${escapeIcalText(getEventTitle(event))}`));
    const location = getEventLocation(event);
    if (location) lines.push(foldLine(`LOCATION:${escapeIcalText(location)}`));
    const description = getEventDescription(event, extras);
    if (description) lines.push(foldLine(`DESCRIPTION:${escapeIcalText(description)}`));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
