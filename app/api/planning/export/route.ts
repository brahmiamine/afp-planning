import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import { listPlanningEventSnapshots, type PlanningEventType } from '@/lib/planning/event-store';
import { assignmentStatus, isVisiblePublicationStatus } from '@/lib/planning/p0-rules';
import { eventCategory } from '@/lib/planning/public-share';
import { csvCell } from '@/lib/planning/export';
import { setCurrentClubId } from '@/lib/auth/club-context';

const EVENT_TYPES: PlanningEventType[] = ['officiel', 'amical', 'entrainement', 'plateau'];

function html(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isoDate(date: string): string | null {
  const [day, month, year] = date.split('/').map((part) => Number.parseInt(part, 10));
  return day && month && year ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);

  const params = new URL(request.url).searchParams;
  const format = params.get('format') === 'html' ? 'html' : 'csv';
  const requestedTypes = (params.get('eventTypes') ?? '').split(',').filter(Boolean);
  const types = requestedTypes.filter((type): type is PlanningEventType => EVENT_TYPES.includes(type as PlanningEventType));
  const fromDate = params.get('fromDate');
  const toDate = params.get('toDate');
  const includeDrafts = params.get('includeDrafts') === '1';

  try {
    const snapshots = (await listPlanningEventSnapshots(await getDb()))
      .filter((snapshot) => includeDrafts ? snapshot.planningStatus !== 'cancelled' : isVisiblePublicationStatus(snapshot.planningStatus))
      .filter((snapshot) => !types.length || types.includes(snapshot.eventType))
      .filter((snapshot) => {
        const date = isoDate(snapshot.date);
        if (!date) return false;
        if (fromDate && date < fromDate) return false;
        if (toDate && date > toDate) return false;
        return true;
      });

    const rows = snapshots.map((snapshot) => ({
      type: snapshot.eventType,
      title: snapshot.title,
      date: snapshot.date,
      time: snapshot.time,
      duration: snapshot.durationMinutes,
      location: snapshot.location ?? '',
      category: eventCategory(snapshot) ?? '',
      status: snapshot.planningStatus,
      arbitres: snapshot.assignments.arbitre.filter((contact) => assignmentStatus(contact) !== 'declined').map((contact) => contact.nom).join(' / '),
      encadrants: snapshot.assignments.encadrant.filter((contact) => assignmentStatus(contact) !== 'declined').map((contact) => contact.nom).join(' / '),
      accompagnateurs: snapshot.assignments.accompagnateur.filter((contact) => assignmentStatus(contact) !== 'declined').map((contact) => contact.nom).join(' / '),
    }));

    if (format === 'csv') {
      const headers = ['Type', 'Événement', 'Date', 'Heure', 'Durée', 'Lieu', 'Catégorie', 'Publication', 'Arbitres', 'Encadrants', 'Accompagnateurs'];
      const body = [
        headers.map(csvCell).join(','),
        ...rows.map((row) => [row.type, row.title, row.date, row.time, row.duration, row.location, row.category, row.status, row.arbitres, row.encadrants, row.accompagnateurs].map(csvCell).join(',')),
      ].join('\r\n');
      return new NextResponse(`\uFEFF${body}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="planning.csv"',
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const tableRows = rows.map((row) => `<tr><td>${html(row.type)}</td><td>${html(row.title)}</td><td>${html(row.date)}</td><td>${html(row.time)}</td><td>${html(row.location)}</td><td>${html(row.category)}</td><td>${html(row.arbitres)}</td><td>${html(row.encadrants)}</td><td>${html(row.accompagnateurs)}</td></tr>`).join('');
    const document = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Planning AFP</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#111}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #bbb;padding:6px;text-align:left}th{background:#eee}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Imprimer</button><h1>Planning AFP</h1><table><thead><tr><th>Type</th><th>Événement</th><th>Date</th><th>Heure</th><th>Lieu</th><th>Catégorie</th><th>Arbitres</th><th>Encadrants</th><th>Accompagnateurs</th></tr></thead><tbody>${tableRows}</tbody></table></body></html>`;
    return new NextResponse(document, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('Planning export failed:', error);
    return NextResponse.json({ error: 'Impossible d’exporter le planning' }, { status: 500 });
  }
}
