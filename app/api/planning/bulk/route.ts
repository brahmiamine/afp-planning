import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import { logAuditEntry } from '@/lib/db/audit-log';
import { getPlanningEventSnapshot } from '@/lib/planning/event-store';
import { normalizeBulkItems } from '@/lib/planning/productivity';
import { applyPlanningPublicationAction, type PlanningPublicationAction } from '@/lib/planning/publication-service';
import { sendManualAssignmentReminder } from '@/lib/planning/reminders';
import { setCurrentClubId } from '@/lib/auth/club-context';

function publicationAction(value: unknown): PlanningPublicationAction | null {
  return value === 'publish' || value === 'draft' || value === 'cancel' || value === 'reopen' ? value : null;
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  try {
    const body = await request.json();
    const items = normalizeBulkItems(body.items);
    const action = body.action;
    const pubAction = publicationAction(action);
    if (!items || (!pubAction && action !== 'remind')) {
      return NextResponse.json({ error: 'Action en masse invalide (maximum 100 événements)' }, { status: 400 });
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
    const db = await getDb();
    const results: Array<{ eventType: string; eventId: string; success: boolean; message: string }> = [];

    for (const item of items) {
      try {
        const snapshot = await getPlanningEventSnapshot(db, item.eventType, item.eventId);
        if (!snapshot) {
          results.push({ ...item, success: false, message: 'Événement introuvable' });
          continue;
        }
        if (action === 'remind') {
          let sent = 0;
          for (const role of ['arbitre', 'encadrant', 'accompagnateur'] as const) {
            sent += await sendManualAssignmentReminder(db, snapshot, role);
          }
          results.push({ ...item, success: true, message: `${sent} relance(s) envoyée(s)` });
        } else if (pubAction) {
          const status = await applyPlanningPublicationAction(db, auth.user, snapshot, pubAction, reason);
          results.push({ ...item, success: true, message: `Statut : ${status}` });
        }
      } catch (error) {
        results.push({ ...item, success: false, message: error instanceof Error ? error.message : 'Erreur inconnue' });
      }
    }

    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'PlanningProductivity',
      entityId: `bulk:${Date.now()}`,
      action: 'bulk',
      before: null,
      after: { action, count: items.length, successCount: results.filter((item) => item.success).length },
    });
    return NextResponse.json({ success: results.every((item) => item.success), partial: results.some((item) => item.success) && results.some((item) => !item.success), results });
  } catch (error) {
    console.error('Bulk planning action failed:', error);
    return NextResponse.json({ error: 'Impossible d’exécuter l’action en masse' }, { status: 500 });
  }
}
