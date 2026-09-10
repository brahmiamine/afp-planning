'use client';

import Link from 'next/link';
import { Send } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import {
  DataCell,
  DataList,
  DataRow,
  SectionCard,
  StatusPill,
  type StatusTone,
} from '@/app/components/layout/page-primitives';
import { TeamMatchup } from '@/app/components/matches/TeamMatchup';
import type { AlertItem } from '@/hooks/useDashboardData';
import { eventWorkspaceHref } from '@/lib/planning/event-links';

const ROLE_LABELS: Record<string, string> = {
  arbitre: 'Arbitre',
  encadrant: 'Encadrant',
  accompagnateur: 'Accompagnateur',
};

const CONTROL_COLUMNS = 'minmax(0,1.5fr) minmax(0,0.85fr) minmax(0,1fr) minmax(0,0.75fr) auto';

function planningStatusTone(status: AlertItem['planningStatus']): StatusTone {
  if (status === 'published') return 'success';
  if (status === 'modified') return 'warning';
  if (status === 'cancelled') return 'danger';
  return 'neutral';
}

function planningStatusLabel(status: AlertItem['planningStatus']): string {
  if (status === 'published') return 'Publié';
  if (status === 'modified') return 'Modifié';
  if (status === 'cancelled') return 'Annulé';
  return 'Brouillon';
}

interface PlanningControlListProps {
  alerts: AlertItem[];
  onRemind?: (item: AlertItem) => void;
  actionBusy?: boolean;
}

export function PlanningControlList({ alerts, onRemind, actionBusy }: PlanningControlListProps) {
  if (alerts.length === 0) {
    return (
      <SectionCard title="Contrôle du planning" description="Aucun événement ne nécessite votre attention.">
        <p className="text-sm text-muted-foreground">Tous les postes sont pourvus et les réponses sont à jour.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Contrôle du planning"
      description={`${alerts.length} événement(s) à traiter avant publication.`}
      flush
    >
      <DataList
        columns={CONTROL_COLUMNS}
        header={(
          <>
            <span>Événement</span>
            <span>Date</span>
            <span>Rôles / signaux</span>
            <span>Statut</span>
            <span>Actions</span>
          </>
        )}
      >
        {alerts.map((item) => {
          const href = eventWorkspaceHref(item.eventType, item.eventId, 'planning');
          const roleSignals = [
            ...item.missingRoles.map((role) => `Manque ${ROLE_LABELS[role] ?? role}`),
            ...item.replacementRoles.map((role) => `Remplacer ${ROLE_LABELS[role] ?? role}`),
            ...(item.pending > 0 ? [`${item.pending} en attente`] : []),
            ...(item.declined > 0 ? [`${item.declined} refus`] : []),
            ...(item.remindersDue > 0 ? [`${item.remindersDue} relance(s)`] : []),
          ];

          return (
            <DataRow key={`${item.eventType}:${item.eventId}`} columns={CONTROL_COLUMNS}>
              <DataCell label="Événement">
                {item.localTeam || item.awayTeam ? (
                  <TeamMatchup
                    localTeam={item.localTeam}
                    awayTeam={item.awayTeam}
                    localTeamLogo={item.localTeamLogo}
                    awayTeamLogo={item.awayTeamLogo}
                    separator="–"
                    logoSize={18}
                    fallbackTitle={item.title}
                    className="min-w-0"
                    nameClassName="break-words"
                  />
                ) : (
                  <span className="break-words font-medium">{item.title}</span>
                )}
              </DataCell>
              <DataCell label="Date">
                <span className="whitespace-normal">{item.date}</span>
                <span className="block text-xs text-muted-foreground">{item.time}</span>
              </DataCell>
              <DataCell label="Rôles / signaux">
                {roleSignals.length > 0 ? (
                  <ul className="space-y-0.5 text-xs text-destructive">
                    {roleSignals.map((signal) => (
                      <li key={signal} className="break-words">{signal}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-xs text-muted-foreground">À vérifier</span>
                )}
              </DataCell>
              <DataCell label="Statut">
                <StatusPill tone={planningStatusTone(item.planningStatus)}>
                  {planningStatusLabel(item.planningStatus)}
                </StatusPill>
              </DataCell>
              <DataCell label="Actions" align="end">
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Button size="sm" variant="outline" asChild className="shrink-0">
                    <Link href={href}>Ouvrir</Link>
                  </Button>
                  {onRemind && item.pending > 0 && item.planningStatus === 'published' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="shrink-0 gap-1"
                      disabled={actionBusy}
                      onClick={() => onRemind(item)}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Relancer
                    </Button>
                  )}
                </div>
              </DataCell>
            </DataRow>
          );
        })}
      </DataList>
    </SectionCard>
  );
}
