'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/lib/utils/api';
import { toast } from 'sonner';

type EventType = 'officiel' | 'amical' | 'entrainement' | 'plateau';
type PlanningRole = 'arbitre' | 'encadrant' | 'accompagnateur';

export interface AlertItem {
  eventId: string;
  eventType: EventType;
  title: string;
  date: string;
  time: string;
  planningStatus: 'draft' | 'published' | 'modified' | 'cancelled';
  missingRoles: PlanningRole[];
  replacementRoles: PlanningRole[];
  pending: number;
  declined: number;
  remindersDue: number;
  localTeam?: string;
  awayTeam?: string;
  localTeamLogo?: string;
  awayTeamLogo?: string;
}

interface AttendanceItem {
  eventId: string;
  eventType: EventType;
  title: string;
  date: string;
  time: string;
  role: PlanningRole;
  personId: number | null;
  personNom: string;
  assignmentStatus: string;
}

interface PreparationSection {
  hasPublishedPlanning: boolean;
  publication: { draft: number; published: number; modified: number; cancelled: number };
  unpublishedChanges: {
    current: number;
    published: number;
    added: number;
    modified: number;
    removed: number;
    unchanged: number;
    changed: number;
  };
  missingRoles: number;
  alerts: AlertItem[];
}

export interface DashboardData {
  generatedAt: string;
  totals: {
    events: number;
    upcoming: number;
    nextWeek: number;
    weekend: number;
    complete: number;
    attention: number;
    missingRoles: number;
    pending: number;
    declined: number;
    replacements: number;
    remindersDue: number;
    attendancePending: number;
    present: number;
    excused: number;
    absent: number;
    replaced: number;
    unreadNotifications: number;
    activeUsers: number;
  };
  publication: { draft: number; published: number; modified: number; cancelled: number };
  /** État du brouillon live vs publié (issue #39) — les `totals` reflètent le planning publié. */
  preparation?: PreparationSection;
  usersByRole: Record<string, number>;
  alerts: AlertItem[];
  attendance: AttendanceItem[];
  workload: Array<{ identity: string; nom: string; upcoming: number; last30Days: number; declined: number; absences: number }>;
  recentNotifications: Array<{ id: number; title: string; message: string; createdAt: string }>;
  analytics: {
    acceptanceRate: number;
    attendanceRate: number;
    averageResponseDelayMinutes: number | null;
    replacementRate: number;
    missingCoverageRate: number;
    fairnessCoefficient: number;
  };
  weekend: { total: number; ready: number; attention: number };
  weatherAlerts: Array<{
    eventId: string;
    eventType: EventType;
    title: string;
    date: string;
    time: string;
    weather: {
      available: true;
      severity: 'warning' | 'severe';
      alerts: string[];
      temperatureC: number | null;
    };
  }>;
}

/**
 * Charge les données du dashboard club (alertes, présences, météo, analytics...) et expose
 * les actions de pilotage du planning (publication, auto-affectation, relance, présence).
 */
export function useDashboardData(enabled: boolean) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      setData(await apiGet<DashboardData>('/api/dashboard/club'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger le dashboard');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const action = useCallback(async (key: string, fn: () => Promise<unknown>, success: string) => {
    setBusyKey(key);
    try {
      await fn();
      toast.success(success);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action impossible');
    } finally {
      setBusyKey(null);
    }
  }, [load]);

  return { data, loading, busyKey, action, reload: load };
}
