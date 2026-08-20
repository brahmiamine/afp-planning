import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import { logAuditEntry } from '@/lib/db/audit-log';
import { notifyContact } from '@/lib/notifications/service';
import {
  getPlanningEventSnapshot,
  savePlanningPublication,
  type PlanningEventType,
} from '@/lib/planning/event-store';
import { activeContacts } from '@/lib/planning/p0-rules';

function validEventType(value: unknown): value is PlanningEventType {
  return value === 'officiel' || value === 'amical' || value === 'entrainement' || value === 'plateau';
}

function uniqueContacts(snapshot: Awaited<ReturnType<typeof getPlanningEventSnapshot>>) {
  if (!snapshot) return [];
  const byKey = new Map<string, (typeof snapshot.assignments.encadrant)[number]>();
  for (const contacts of Object.values(snapshot.assignments)) {
    for (const contact of activeContacts(contacts)) {
      const key = contact.personType && contact.personId !== undefined
        ? `${contact.personType}:${contact.personId}`
        : `name:${contact.nom.trim().toLowerCase()}`;
      byKey.set(key, contact);
    }
  }
  return Array.from(byKey.values());
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
    const eventType = body.eventType;
    const action = body.action;
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

    if (!eventId || !validEventType(eventType) || !['draft', 'publish', 'cancel', 'reopen'].includes(action)) {
      return NextResponse.json({ error: 'Action de publication invalide' }, { status: 400 });
    }

    const db = await getDb();
    const snapshot = await getPlanningEventSnapshot(db, eventType, eventId);
    if (!snapshot) return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 });

    const now = new Date().toISOString();
    const beforeStatus = snapshot.planningStatus;
    let patch: Record<string, unknown>;
    let notification: { type: string; title: string; message: string } | null = null;

    if (action === 'publish') {
      patch = {
        planningStatus: 'published',
        publishedAt: now,
        publishedByUserId: auth.user.id,
        modifiedAfterPublishAt: null,
        cancelledAt: null,
        cancelledByUserId: null,
        cancellationReason: null,
      };
      notification = {
        type: 'planning-published',
        title: 'Planning publié',
        message: `${snapshot.title} · ${snapshot.date} à ${snapshot.time}`,
      };
    } else if (action === 'cancel') {
      patch = {
        planningStatus: 'cancelled',
        cancelledAt: now,
        cancelledByUserId: auth.user.id,
        cancellationReason: reason || 'Annulé par le responsable du planning',
      };
      notification = {
        type: 'event-cancelled',
        title: 'Événement annulé',
        message: `${snapshot.title} · ${snapshot.date} à ${snapshot.time}${reason ? ` — ${reason}` : ''}`,
      };
    } else {
      patch = {
        planningStatus: 'draft',
        ...(action === 'reopen' ? {
          cancelledAt: null,
          cancelledByUserId: null,
          cancellationReason: null,
        } : {}),
      };
      if (beforeStatus === 'published' || beforeStatus === 'modified') {
        notification = {
          type: 'planning-draft',
          title: 'Planning en cours de modification',
          message: `${snapshot.title} a été temporairement repassé en brouillon.`,
        };
      }
    }

    await savePlanningPublication(db, snapshot, patch);
    await logAuditEntry(db, {
      user: auth.user,
      entityType: 'PlanningPublication',
      entityId: `${eventType}:${eventId}`,
      action,
      before: { planningStatus: beforeStatus },
      after: patch,
    });

    if (notification) {
      await Promise.all(uniqueContacts(snapshot).map((contact) => notifyContact(db, contact, {
        ...notification,
        eventType,
        eventId,
      })));
    }

    return NextResponse.json({
      success: true,
      eventId,
      eventType,
      planningStatus: String(patch.planningStatus),
    });
  } catch (error) {
    console.error('Planning publication failed:', error);
    return NextResponse.json({ error: 'Impossible de modifier la publication du planning' }, { status: 500 });
  }
}
