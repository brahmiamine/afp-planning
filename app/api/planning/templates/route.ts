import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import { logAuditEntry } from '@/lib/db/audit-log';
import { getPlanningEventSnapshot } from '@/lib/planning/event-store';
import { stripUnsafeTemplateFields } from '@/lib/planning/productivity';
import { deletePlanningRecord, getPlanningRecord, listPlanningRecords, planningRecordId, savePlanningRecord } from '@/lib/planning/records';
import type { Entrainement, Match, Plateau } from '@/types/match';

interface TemplatePayload {
  name: string;
  eventType: 'amical' | 'entrainement' | 'plateau';
  defaults: Record<string, unknown>;
  createdByUserId: number;
}

function validManualType(value: unknown): value is TemplatePayload['eventType'] {
  return value === 'amical' || value === 'entrainement' || value === 'plateau';
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && (/^\d{2}\/\d{2}\/\d{4}$/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  const db = await getDb();
  return NextResponse.json({ templates: await listPlanningRecords<TemplatePayload>(db, { kind: 'template' }, 500) });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  try {
    const body = await request.json();
    const db = await getDb();

    if (body.action === 'instantiate') {
      const templateId = typeof body.templateId === 'string' ? body.templateId : '';
      const date = body.date;
      if (!templateId || !validDate(date)) return NextResponse.json({ error: 'Instanciation invalide' }, { status: 400 });
      const template = await getPlanningRecord<TemplatePayload>(db, templateId);
      if (!template || template.kind !== 'template' || !validManualType(template.payload.eventType)) {
        return NextResponse.json({ error: 'Modèle introuvable' }, { status: 404 });
      }
      const overrides = body.overrides && typeof body.overrides === 'object'
        ? stripUnsafeTemplateFields(body.overrides as Record<string, unknown>)
        : {};
      const defaults = { ...template.payload.defaults, ...overrides };
      const id = `${template.payload.eventType}-template-${randomUUID()}`;
      const time = typeof defaults.time === 'string' ? defaults.time : '';
      if (!time) return NextResponse.json({ error: 'Le modèle doit définir un horaire' }, { status: 409 });

      if (template.payload.eventType === 'amical') {
        if (typeof defaults.localTeam !== 'string' || typeof defaults.awayTeam !== 'string') {
          return NextResponse.json({ error: 'Le modèle de match doit définir les deux équipes' }, { status: 409 });
        }
        const event = { ...defaults, id, type: 'amical', date, time, durationMinutes: Number(defaults.durationMinutes) || 90 } as unknown as Match;
        await db.getRepository('MatchAmical').save({ id, clubId: auth.user.clubId, date, time, payload: event as unknown as Record<string, unknown> });
        await db.getRepository('MatchExtra').save({ matchId: id, clubId: auth.user.clubId, payload: { id, planningStatus: 'draft' } });
        await logAuditEntry(db, { user: auth.user, entityType: 'PlanningProductivity', entityId: id, action: 'create', before: { templateId }, after: { eventType: 'amical', date } });
        return NextResponse.json({ success: true, event });
      }

      if (typeof defaults.lieu !== 'string' || !defaults.lieu.trim()) return NextResponse.json({ error: 'Le modèle doit définir un lieu' }, { status: 409 });
      if (template.payload.eventType === 'entrainement') {
        const event = { ...defaults, id, type: 'entrainement', date, time, durationMinutes: Number(defaults.durationMinutes) || 90, planningStatus: 'draft', encadrants: [] } as unknown as Entrainement;
        await db.getRepository('Entrainement').save({ id, clubId: auth.user.clubId, date, time, payload: event as unknown as Record<string, unknown> });
        await logAuditEntry(db, { user: auth.user, entityType: 'PlanningProductivity', entityId: id, action: 'create', before: { templateId }, after: { eventType: 'entrainement', date } });
        return NextResponse.json({ success: true, event });
      }
      const event = { ...defaults, id, type: 'plateau', date, time, durationMinutes: Number(defaults.durationMinutes) || 120, planningStatus: 'draft', encadrants: [] } as unknown as Plateau;
      await db.getRepository('Plateau').save({ id, clubId: auth.user.clubId, date, time, payload: event as unknown as Record<string, unknown> });
      await logAuditEntry(db, { user: auth.user, entityType: 'PlanningProductivity', entityId: id, action: 'create', before: { templateId }, after: { eventType: 'plateau', date } });
      return NextResponse.json({ success: true, event });
    }

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 160) : '';
    const eventType = body.eventType;
    if (!name || !validManualType(eventType)) return NextResponse.json({ error: 'Modèle invalide' }, { status: 400 });
    let defaults: Record<string, unknown>;
    const sourceEventId = typeof body.sourceEventId === 'string' ? body.sourceEventId.trim() : '';
    if (sourceEventId) {
      const source = await getPlanningEventSnapshot(db, eventType, sourceEventId);
      if (!source) return NextResponse.json({ error: 'Événement source introuvable' }, { status: 404 });
      defaults = stripUnsafeTemplateFields(source.event as unknown as Record<string, unknown>);
    } else {
      defaults = stripUnsafeTemplateFields(body.defaults && typeof body.defaults === 'object' ? body.defaults as Record<string, unknown> : {});
    }
    const id = planningRecordId('template');
    const payload: TemplatePayload = { name, eventType, defaults, createdByUserId: auth.user.id };
    await savePlanningRecord(db, { id, kind: 'template', ownerUserId: auth.user.id, payload });
    await logAuditEntry(db, { user: auth.user, entityType: 'PlanningProductivity', entityId: id, action: 'create', before: null, after: payload as unknown as Record<string, unknown> });
    return NextResponse.json({ success: true, template: { id, payload } });
  } catch (error) {
    console.error('Planning template failed:', error);
    return NextResponse.json({ error: 'Impossible de gérer le modèle' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) return auth.error;
  const id = new URL(request.url).searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
  const db = await getDb();
  const record = await getPlanningRecord<TemplatePayload>(db, id);
  if (!record || record.kind !== 'template') return NextResponse.json({ error: 'Modèle introuvable' }, { status: 404 });
  await deletePlanningRecord(db, id);
  await logAuditEntry(db, { user: auth.user, entityType: 'PlanningProductivity', entityId: id, action: 'delete', before: record.payload as unknown as Record<string, unknown>, after: null });
  return NextResponse.json({ success: true });
}
