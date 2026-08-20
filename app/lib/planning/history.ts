import type { DataSource } from 'typeorm';
import type { MatchAuditLogEntity } from '@/lib/db/schemas';

export interface PlanningHistoryItem {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  title: string;
  actor: string;
  createdAt: Date;
}

const ACTION_LABELS: Record<string, string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
  attendance: 'Présence enregistrée',
  'auto-assign': 'Affectation automatique',
  publish: 'Publication',
  draft: 'Passage en brouillon',
  cancel: 'Annulation',
  reopen: 'Réouverture',
  'manual-reminder': 'Relance manuelle',
};

const ENTITY_LABELS: Record<string, string> = {
  MatchOfficial: 'match officiel',
  MatchAmical: 'match amical',
  Entrainement: 'entraînement',
  Plateau: 'plateau',
  MatchExtra: 'affectations du match',
  PlanningAttendance: 'présence',
  PlanningAssignment: 'affectation',
  PlanningPublication: 'publication',
  PlanningReminder: 'relance',
  PlanningCollaboration: 'collaboration',
  PlanningResource: 'ressource',
  PlanningTransport: 'transport',
  PlanningReport: 'rapport',
};

export function humanizeAuditEntry(entry: MatchAuditLogEntity): PlanningHistoryItem {
  const action = ACTION_LABELS[entry.action] ?? entry.action;
  const entity = ENTITY_LABELS[entry.entityType] ?? entry.entityType;
  const actor = entry.userNom || entry.userEmail || 'Système';
  return {
    id: entry.id,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    title: `${action} · ${entity} ${entry.entityId}`,
    actor,
    createdAt: entry.createdAt,
  };
}

export async function buildReadableHistory(db: DataSource, limit = 100): Promise<PlanningHistoryItem[]> {
  const rows = await db.getRepository<MatchAuditLogEntity>('MatchAuditLog').find({
    order: { createdAt: 'DESC' },
    take: Math.max(1, Math.min(limit, 500)),
  });
  return rows.map(humanizeAuditEntry);
}
