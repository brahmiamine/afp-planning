import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { logAuditEntry } from '@/lib/db/audit-log';
import { canManagePlanningEventWorkspace, canReadPlanningEventWorkspace } from '@/lib/planning/event-access';
import { getPlanningEventSnapshot, type PlanningEventType } from '@/lib/planning/event-store';
import { deletePlanningAttachment, getPlanningAttachment } from '@/lib/planning/records';
import { setCurrentClubId } from '@/lib/auth/club-context';

function validEventType(value: string): value is PlanningEventType {
  return value === 'officiel' || value === 'amical' || value === 'entrainement' || value === 'plateau';
}

async function load(request: NextRequest, params: Promise<{ id: string }> | { id: string }) {
  const auth = await requireAuth(request);
  if ('error' in auth) return { error: auth.error } as const;
  setCurrentClubId(auth.user.clubId);
  const { id } = params instanceof Promise ? await params : params;
  const db = await getDb();
  const attachment = await getPlanningAttachment(db, id);
  if (!attachment || !validEventType(attachment.eventType)) {
    return { error: NextResponse.json({ error: 'Document introuvable' }, { status: 404 }) } as const;
  }
  const snapshot = await getPlanningEventSnapshot(db, attachment.eventType, attachment.eventId);
  if (!snapshot) return { error: NextResponse.json({ error: 'Événement introuvable' }, { status: 404 }) } as const;
  if (!canReadPlanningEventWorkspace(auth.user, snapshot)) {
    return { error: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }) } as const;
  }
  return { auth, db, attachment, snapshot } as const;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const ctx = await load(request, params);
  if ('error' in ctx) return ctx.error;
  return new NextResponse(new Uint8Array(ctx.attachment.content), {
    headers: {
      'Content-Type': ctx.attachment.mimeType,
      'Content-Length': String(ctx.attachment.sizeBytes),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(ctx.attachment.fileName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const ctx = await load(request, params);
  if ('error' in ctx) return ctx.error;
  if (!canManagePlanningEventWorkspace(ctx.auth.user) && ctx.attachment.uploadedByUserId !== ctx.auth.user.id) {
    return NextResponse.json({ error: 'Suppression non autorisée' }, { status: 403 });
  }
  await deletePlanningAttachment(ctx.db, ctx.attachment.id);
  await logAuditEntry(ctx.db, {
    user: ctx.auth.user,
    entityType: 'PlanningCollaboration',
    entityId: ctx.attachment.id,
    action: 'delete',
    before: { fileName: ctx.attachment.fileName, eventType: ctx.attachment.eventType, eventId: ctx.attachment.eventId },
    after: null,
  });
  return NextResponse.json({ success: true });
}
