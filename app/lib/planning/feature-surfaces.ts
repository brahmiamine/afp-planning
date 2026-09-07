import type { PlanningFeatureFlags } from '@/lib/settings';

export interface PlanningFeatureSurface {
  /** Libellé affiché dans la configuration du club. */
  label: string;
  /** Pages ou sections d'interface masquées quand le flag est désactivé. */
  pages: string[];
  /** Routes API qui répondent 409 quand le flag est désactivé. */
  routes: string[];
}

/**
 * Périmètre exact de chaque fonctionnalité optionnelle : pages masquées et routes
 * gardées. Sert de source unique pour la navigation, la documentation
 * (`docs/feature-flags.md`) et les tests de cohérence.
 */
export const PLANNING_FEATURE_SURFACES: Record<keyof PlanningFeatureFlags, PlanningFeatureSurface> = {
  assignmentValidation: { label: 'Validation des affectations', pages: [], routes: [] },
  publicationReadiness: { label: 'Contrôles de publication', pages: [], routes: [] },
  autoAssignment: {
    label: 'Auto-affectation',
    pages: [],
    routes: ['app/api/planning/auto-assign/route.ts'],
  },
  automaticReminders: {
    label: 'Relances automatiques',
    pages: [],
    routes: ['app/api/planning/reminders/route.ts', 'app/api/cron/planning-reminders/route.ts'],
  },
  assignmentSwaps: {
    label: 'Échanges d’affectation',
    pages: ['/club/planning/echanges', '/mon-planning/mes-echanges'],
    routes: ['app/api/planning/assignment-swaps/route.ts', 'app/api/me/assignment-swaps/route.ts'],
  },
  attendanceTracking: {
    label: 'Suivi de présence',
    pages: [],
    routes: ['app/api/planning/attendance/route.ts'],
  },
  recurringEvents: {
    label: 'Événements récurrents',
    pages: ['/club/planning/recurrent'],
    routes: ['app/api/recurring-events/route.ts', 'app/api/recurring-events/[seriesId]/route.ts'],
  },
  publicSharing: {
    label: 'Partage public',
    pages: ['/club/planning/partage'],
    routes: ['app/api/planning/shares/route.ts', 'app/api/public/planning/[token]/route.ts'],
  },
  scraperSync: {
    label: 'Synchronisation du scraper',
    pages: [],
    routes: ['app/api/scraper/route.ts', 'app/api/cron/scraper/route.ts'],
  },
  eventChat: {
    label: 'Chat d’événement',
    pages: ['Espace événement · chat'],
    routes: ['app/api/chat/events/route.ts'],
  },
  travelAndWeather: {
    label: 'Déplacement et météo',
    pages: ['Espace événement · météo'],
    routes: ['app/api/planning/travel/route.ts', 'app/api/planning/weather/route.ts'],
  },
  calendarExport: {
    label: 'Export calendrier',
    pages: [],
    routes: ['app/api/ical/[token]/route.ts'],
  },
  collaboration: {
    label: 'Collaboration',
    pages: ['Espace événement · commentaires, tâches, documents, rapports'],
    routes: [
      'app/api/planning/events/[eventType]/[eventId]/collaboration/route.ts',
      'app/api/planning/events/[eventType]/[eventId]/reports/route.ts',
      'app/api/planning/events/[eventType]/[eventId]/attachments/route.ts',
      'app/api/planning/attachments/[id]/route.ts',
    ],
  },
  adminPublicationApproval: { label: 'Approbation administrateur', pages: [], routes: [] },
  requireArbitreForPublication: { label: 'Arbitre obligatoire', pages: [], routes: [] },
  requireEncadrantForPublication: { label: 'Encadrant obligatoire', pages: [], routes: [] },
  requireAccompagnateurForPublication: { label: 'Accompagnateur obligatoire', pages: [], routes: [] },
};
