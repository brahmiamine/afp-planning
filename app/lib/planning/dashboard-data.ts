import { IsNull, type DataSource } from 'typeorm';
import type { MatchAuditLogEntity, NotificationEntity, UserEntity } from '@/lib/db/schemas';
import type { AssignmentContact } from '@/types/match';
import {
  listPlanningEventSnapshots,
  type PlanningEventSnapshot,
  type PlanningRole,
} from './event-store';
import {
  assignmentStatus,
  attendanceStatus,
  eventEndTimestamp,
  eventStartTimestamp,
  hasCoveredRole,
  isAttendancePending,
  isVisiblePublicationStatus,
  needsReplacement,
  nextReminderStage,
} from './p0-rules';

export interface DashboardAlertItem {
  eventId: string;
  eventType: PlanningEventSnapshot['eventType'];
  title: string;
  date: string;
  time: string;
  planningStatus: PlanningEventSnapshot['planningStatus'];
  missingRoles: PlanningRole[];
  replacementRoles: PlanningRole[];
  pending: number;
  declined: number;
  remindersDue: number;
}

export interface DashboardAttendanceItem {
  eventId: string;
  eventType: PlanningEventSnapshot['eventType'];
  title: string;
  date: string;
  time: string;
  role: PlanningRole;
  personId: number | null;
  personNom: string;
  assignmentStatus: string;
}

export interface DashboardWorkloadItem {
  identity: string;
  personId: number | null;
  personType: string | null;
  nom: string;
  upcoming: number;
  last30Days: number;
  accepted: number;
  declined: number;
  absences: number;
}

function rolesFor(snapshot: PlanningEventSnapshot): PlanningRole[] {
  return snapshot.eventType === 'officiel' || snapshot.eventType === 'amical'
    ? ['arbitre', 'encadrant', 'accompagnateur']
    : ['encadrant'];
}

function identity(contact: AssignmentContact): string {
  if (contact.personType && contact.personId !== undefined) return `${contact.personType}:${contact.personId}`;
  return `name:${contact.nom.trim().toLowerCase()}`;
}

function isWeekendTimestamp(timestamp: number): boolean {
  const day = new Date(timestamp).getUTCDay();
  return day === 0 || day === 6;
}

export async function buildClubDashboardData(
  db: DataSource,
  userId: number,
  now = Date.now(),
) {
  const [snapshots, users, unreadNotifications, recentNotifications, recentAudit] = await Promise.all([
    listPlanningEventSnapshots(db),
    db.getRepository<UserEntity>('User').find(),
    db.getRepository<NotificationEntity>('Notification').count({ where: { userId, readAt: IsNull() } }),
    db.getRepository<NotificationEntity>('Notification').find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 8,
    }),
    db.getRepository<MatchAuditLogEntity>('MatchAuditLog').find({
      order: { createdAt: 'DESC' },
      take: 10,
    }),
  ]);

  const next14Days = now + 14 * 24 * 60 * 60_000;
  const next7Days = now + 7 * 24 * 60 * 60_000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60_000;
  const fourteenDaysAgo = now - 14 * 24 * 60 * 60_000;

  let upcoming = 0;
  let nextWeek = 0;
  let weekend = 0;
  let complete = 0;
  let attention = 0;
  let missingRoles = 0;
  let pending = 0;
  let declined = 0;
  let replacements = 0;
  let remindersDue = 0;
  let attendancePending = 0;
  let present = 0;
  let excused = 0;
  let absent = 0;
  let replaced = 0;

  const publication = { draft: 0, published: 0, modified: 0, cancelled: 0 };
  const alerts: DashboardAlertItem[] = [];
  const attendanceItems: DashboardAttendanceItem[] = [];
  const workload = new Map<string, DashboardWorkloadItem>();

  for (const snapshot of snapshots) {
    publication[snapshot.planningStatus] += 1;
    const start = eventStartTimestamp(snapshot.date, snapshot.time);
    const end = eventEndTimestamp(snapshot.date, snapshot.time, snapshot.durationMinutes);
    const visible = isVisiblePublicationStatus(snapshot.planningStatus);
    const operational = visible && start !== null && start >= now;
    const eventRoles = rolesFor(snapshot);
    const missing: PlanningRole[] = [];
    const replacement: PlanningRole[] = [];
    let eventPending = 0;
    let eventDeclined = 0;
    let eventReminders = 0;

    if (operational && start !== null) {
      upcoming += 1;
      if (start <= next7Days) nextWeek += 1;
      if (start <= next7Days && isWeekendTimestamp(start)) weekend += 1;
    }

    for (const role of eventRoles) {
      const contacts = snapshot.assignments[role];
      if (!contacts.length) missing.push(role);
      else if (needsReplacement(contacts)) replacement.push(role);

      for (const contact of contacts) {
        const status = assignmentStatus(contact);
        if (status === 'pending') eventPending += 1;
        if (status === 'declined') eventDeclined += 1;
        if (visible && nextReminderStage(contact, start, now)) eventReminders += 1;

        const attendance = attendanceStatus(contact);
        if (visible && attendance === 'present') present += 1;
        if (visible && attendance === 'excused') excused += 1;
        if (visible && attendance === 'absent') absent += 1;
        if (visible && attendance === 'replaced') replaced += 1;

        if (visible && isAttendancePending(contact, end, now) && end !== null && end >= fourteenDaysAgo) {
          attendancePending += 1;
          attendanceItems.push({
            eventId: snapshot.eventId,
            eventType: snapshot.eventType,
            title: snapshot.title,
            date: snapshot.date,
            time: snapshot.time,
            role,
            personId: contact.personId ?? null,
            personNom: contact.nom,
            assignmentStatus: status,
          });
        }

        const key = identity(contact);
        const current = workload.get(key) ?? {
          identity: key,
          personId: contact.personId ?? null,
          personType: contact.personType ?? null,
          nom: contact.nom,
          upcoming: 0,
          last30Days: 0,
          accepted: 0,
          declined: 0,
          absences: 0,
        };
        if (visible && start !== null && status !== 'declined') {
          if (start >= now) current.upcoming += 1;
          if (start >= thirtyDaysAgo && start < now) current.last30Days += 1;
        }
        if (visible && status === 'accepted') current.accepted += 1;
        if (visible && status === 'declined') current.declined += 1;
        if (visible && attendance === 'absent') current.absences += 1;
        workload.set(key, current);
      }
    }

    if (operational) {
      missingRoles += missing.length;
      replacements += replacement.length;
      pending += eventPending;
      declined += eventDeclined;
      remindersDue += eventReminders;
    }

    const eventComplete = operational
      && missing.length === 0
      && replacement.length === 0
      && eventPending === 0
      && eventDeclined === 0
      && eventRoles.every((role) => hasCoveredRole(snapshot.assignments[role]));
    if (eventComplete) complete += 1;

    const needsAttention = operational
      && (missing.length > 0 || replacement.length > 0 || eventPending > 0 || eventDeclined > 0 || eventReminders > 0);
    if (needsAttention) attention += 1;

    if (
      start !== null
      && start >= now
      && start <= next14Days
      && (
        needsAttention
        || snapshot.planningStatus === 'draft'
        || snapshot.planningStatus === 'modified'
        || snapshot.planningStatus === 'cancelled'
      )
    ) {
      alerts.push({
        eventId: snapshot.eventId,
        eventType: snapshot.eventType,
        title: snapshot.title,
        date: snapshot.date,
        time: snapshot.time,
        planningStatus: snapshot.planningStatus,
        missingRoles: missing,
        replacementRoles: replacement,
        pending: eventPending,
        declined: eventDeclined,
        remindersDue: eventReminders,
      });
    }
  }

  alerts.sort((a, b) => (eventStartTimestamp(a.date, a.time) ?? 0) - (eventStartTimestamp(b.date, b.time) ?? 0));
  attendanceItems.sort((a, b) => (eventStartTimestamp(b.date, b.time) ?? 0) - (eventStartTimestamp(a.date, a.time) ?? 0));

  const activeUsers = users.filter((user) => user.active);
  const userRoles = activeUsers.reduce<Record<string, number>>((acc, user) => {
    for (const role of user.roles ?? []) {
      acc[role] = (acc[role] ?? 0) + 1;
    }
    return acc;
  }, {});

  return {
    generatedAt: new Date(now).toISOString(),
    totals: {
      events: snapshots.length,
      upcoming,
      nextWeek,
      weekend,
      complete,
      attention,
      missingRoles,
      pending,
      declined,
      replacements,
      remindersDue,
      attendancePending,
      present,
      excused,
      absent,
      replaced,
      unreadNotifications,
      activeUsers: activeUsers.length,
    },
    publication,
    usersByRole: userRoles,
    alerts: alerts.slice(0, 30),
    attendance: attendanceItems.slice(0, 40),
    workload: Array.from(workload.values())
      .sort((a, b) => b.upcoming - a.upcoming || b.last30Days - a.last30Days || a.nom.localeCompare(b.nom, 'fr'))
      .slice(0, 30),
    recentNotifications: recentNotifications.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      message: item.message,
      eventType: item.eventType,
      eventId: item.eventId,
      readAt: item.readAt,
      createdAt: item.createdAt,
    })),
    recentAudit: recentAudit.map((item) => ({
      id: item.id,
      entityType: item.entityType,
      entityId: item.entityId,
      action: item.action,
      userNom: item.userNom,
      userEmail: item.userEmail,
      createdAt: item.createdAt,
    })),
  };
}
