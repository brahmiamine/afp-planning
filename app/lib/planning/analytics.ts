import type { DataSource } from 'typeorm';
import type { AssignmentContact } from '@/types/match';
import { getCurrentClubId } from '@/lib/auth/club-context';
import { readAppSettings } from '@/lib/settings-store';
import { listPlanningEventSnapshots, type PlanningEventSnapshot } from './event-store';
import { assignmentStatus, attendanceStatus, isVisiblePublicationStatus } from './p0-rules';
import {
  listPublishedPlanningEventSnapshots,
} from './published-planning';
import { hydratePlanningAssignmentStates } from './assignment-state-overlay';
import {
  DEFAULT_PUBLICATION_ROLE_REQUIREMENTS,
  requiredRolesForEvent,
  type PublicationRoleRequirements,
} from './validation';

export interface PlanningWorkloadMetric {
  identity: string;
  nom: string;
  assignments: number;
  accepted: number;
  declined: number;
  present: number;
  absent: number;
}

export interface PlanningAnalytics {
  events: number;
  requiredRoles: number;
  missingRoles: number;
  assignments: number;
  respondedAssignments: number;
  acceptanceRate: number;
  attendanceRate: number;
  averageResponseDelayMinutes: number | null;
  replacementRate: number;
  missingCoverageRate: number;
  fairnessCoefficient: number;
  workload: PlanningWorkloadMetric[];
}

function identity(contact: AssignmentContact): string {
  if (contact.personType && contact.personId !== undefined) return `${contact.personType}:${contact.personId}`;
  return `name:${contact.nom.trim().toLowerCase()}`;
}

function percent(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : 0;
}

export function fairnessCoefficient(loads: number[]): number {
  if (!loads.length) return 1;
  const normalized = loads.map((value) => Math.max(0, value));
  const total = normalized.reduce((sum, value) => sum + value, 0);
  if (total === 0) return 1;
  const n = normalized.length;
  let pairwise = 0;
  for (const a of normalized) {
    for (const b of normalized) pairwise += Math.abs(a - b);
  }
  const gini = pairwise / (2 * n * total);
  return Math.round((1 - gini) * 10_000) / 10_000;
}

export function computePlanningAnalytics(
  snapshots: PlanningEventSnapshot[],
  requirements: PublicationRoleRequirements = DEFAULT_PUBLICATION_ROLE_REQUIREMENTS,
): PlanningAnalytics {
  const visible = snapshots.filter((snapshot) => isVisiblePublicationStatus(snapshot.planningStatus));
  let requiredRoleCount = 0;
  let missingRoles = 0;
  let assignments = 0;
  let accepted = 0;
  let declined = 0;
  let present = 0;
  let knownAttendance = 0;
  let responseDelayTotal = 0;
  let responseDelayCount = 0;
  const workload = new Map<string, PlanningWorkloadMetric>();

  for (const snapshot of visible) {
    for (const role of requiredRolesForEvent(snapshot, requirements)) {
      requiredRoleCount += 1;
      if (!(snapshot.assignments[role] ?? []).some((contact) => assignmentStatus(contact) !== 'declined')) {
        missingRoles += 1;
      }
    }

    for (const contacts of Object.values(snapshot.assignments)) {
      for (const contact of contacts) {
        assignments += 1;
        const status = assignmentStatus(contact);
        if (status === 'accepted') accepted += 1;
        if (status === 'declined') declined += 1;

        if (contact.assignedAt && contact.respondedAt) {
          const assignedAt = Date.parse(contact.assignedAt);
          const respondedAt = Date.parse(contact.respondedAt);
          if (Number.isFinite(assignedAt) && Number.isFinite(respondedAt) && respondedAt >= assignedAt) {
            responseDelayTotal += (respondedAt - assignedAt) / 60_000;
            responseDelayCount += 1;
          }
        }

        const attendance = attendanceStatus(contact);
        if (attendance !== 'unknown' && attendance !== 'replaced') knownAttendance += 1;
        if (attendance === 'present') present += 1;

        const key = identity(contact);
        const current = workload.get(key) ?? {
          identity: key,
          nom: contact.nom,
          assignments: 0,
          accepted: 0,
          declined: 0,
          present: 0,
          absent: 0,
        };
        current.assignments += 1;
        if (status === 'accepted') current.accepted += 1;
        if (status === 'declined') current.declined += 1;
        if (attendance === 'present') current.present += 1;
        if (attendance === 'absent') current.absent += 1;
        workload.set(key, current);
      }
    }
  }

  const respondedAssignments = accepted + declined;
  const workloadList = Array.from(workload.values())
    .sort((a, b) => b.assignments - a.assignments || a.nom.localeCompare(b.nom, 'fr'));

  return {
    events: visible.length,
    requiredRoles: requiredRoleCount,
    missingRoles,
    assignments,
    respondedAssignments,
    acceptanceRate: percent(accepted, respondedAssignments),
    attendanceRate: percent(present, knownAttendance),
    averageResponseDelayMinutes: responseDelayCount
      ? Math.round((responseDelayTotal / responseDelayCount) * 100) / 100
      : null,
    replacementRate: percent(declined, respondedAssignments),
    missingCoverageRate: percent(missingRoles, requiredRoleCount),
    fairnessCoefficient: fairnessCoefficient(workloadList.map((item) => item.assignments)),
    workload: workloadList,
  };
}

export async function buildPlanningAnalytics(db: DataSource): Promise<PlanningAnalytics> {
  const clubId = getCurrentClubId();
  const [settings, snapshots, publishedSnapshots] = await Promise.all([
    readAppSettings(db, clubId),
    listPlanningEventSnapshots(db),
    listPublishedPlanningEventSnapshots(db, clubId),
  ]);
  const requirements: PublicationRoleRequirements = {
    arbitre: settings.features.requireArbitreForPublication,
    encadrant: settings.features.requireEncadrantForPublication,
    accompagnateur: settings.features.requireAccompagnateurForPublication,
  };
  // Issue #72 (suite de #39) : les analytics du dashboard doivent refléter la même réalité
  // que « Mon planning » — le snapshot publié hydraté depuis le store opérationnel — et non
  // le brouillon de travail. Repli sur le live tant que le club n'a jamais publié.
  const source = publishedSnapshots
    ? await hydratePlanningAssignmentStates(db, publishedSnapshots, clubId)
    : snapshots;
  return computePlanningAnalytics(source, requirements);
}
