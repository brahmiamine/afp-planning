import { DataSource } from 'typeorm';
import { MatchAuditLogEntity } from './schemas';
import type { SessionUser } from '@/lib/auth/session';

export type AuditEntityType =
  | 'MatchOfficial'
  | 'MatchAmical'
  | 'Entrainement'
  | 'Plateau'
  | 'MatchExtra'
  | 'PlanningAttendance'
  | 'PlanningAssignment'
  | 'PlanningPublication'
  | 'PlanningReminder'
  | 'PlanningPreference'
  | 'PlanningAvailability'
  | 'PlanningCollaboration'
  | 'PlanningResource'
  | 'PlanningProductivity'
  | 'PlanningShare';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'attendance'
  | 'auto-assign'
  | 'publish'
  | 'draft'
  | 'cancel'
  | 'reopen'
  | 'manual-reminder'
  | 'respond'
  | 'complete'
  | 'promote'
  | 'bulk'
  | 'share'
  | 'report';

export interface LogAuditEntryInput {
  user: SessionUser | null;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export async function logAuditEntry(db: DataSource, entry: LogAuditEntryInput): Promise<void> {
  const repo = db.getRepository<MatchAuditLogEntity>('MatchAuditLog');
  await repo.save({
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    userId: entry.user?.id ?? null,
    userEmail: entry.user?.email ?? null,
    userNom: entry.user?.nom ?? null,
    before: entry.before,
    after: entry.after,
  });
}
