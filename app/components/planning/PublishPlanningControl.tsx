'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { canEdit } from '@/lib/auth/roles';
import { apiGet, apiPost, ApiRequestError } from '@/lib/utils/api';
import { eventWorkspaceHref } from '@/lib/planning/event-links';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type EventType = 'officiel' | 'amical' | 'entrainement' | 'plateau';

interface PublicationDiffEvent {
  eventType: EventType;
  eventId: string;
  title: string;
  date: string;
  time: string;
}

export interface PublicationBlocker {
  code: string;
  message: string;
  /** Présents pour les blocages liés à un événement (affichage sur sa carte). */
  eventType?: EventType;
  eventId?: string;
  detail?: string;
}

interface GlobalPublicationPreview {
  lastPublishedAt: string | null;
  diff: {
    current: number;
    published: number;
    added: number;
    modified: number;
    removed: number;
    unchanged: number;
    changed: number;
    removedEvents: PublicationDiffEvent[];
  };
  /** Points bloquants actuels, renvoyés par l'aperçu avant toute tentative. */
  blockers?: PublicationBlocker[];
}

function isEventType(value: string | undefined): value is EventType {
  return value === 'officiel' || value === 'amical' || value === 'entrainement' || value === 'plateau';
}

/** Les blockers de publication ont un code `eventType:eventId:...` : on en extrait un lien direct vers l'événement concerné. */
function blockerEventHref(blocker: PublicationBlocker, origin: 'dashboard' | 'planning'): string | null {
  const [eventType, eventId] = blocker.code.split(':');
  return isEventType(eventType) && eventId ? eventWorkspaceHref(eventType, eventId, origin) : null;
}

export interface PublishPlanningControlProps {
  /** Appelé après une publication réussie, pour que la page hôte recharge ses propres données. */
  onPublished?: () => void | Promise<void>;
  className?: string;
  /** Adapte le libellé et le retour des blockers au contexte sans dupliquer la publication. */
  context?: 'dashboard' | 'planning';
  /**
   * Remonte les points bloquants courants (aperçu ou dernière tentative) pour que la page
   * hôte les affiche sur les cartes d'événement concernées plutôt qu'en liste ici.
   */
  onBlockersChange?: (blockers: PublicationBlocker[]) => void;
  /**
   * Incrémenté par la page hôte à chaque modification du planning ou des rôles : force
   * un nouvel appel de l'aperçu pour que les blockers (ex. « Manque Encadrant ») soient
   * recalculés immédiatement après un retrait d'officiel, sans attendre une publication.
   */
  refreshSignal?: number;
}

/**
 * Bouton unique « Publier le planning », son aperçu de diff et ses blockers : seule
 * implémentation de la publication globale (issue #95), utilisable aussi bien depuis le
 * tableau de bord (/club) que depuis l'espace de préparation (/club/planning), pour éviter
 * l'aller-retour entre les deux. Un seul endpoint (`/api/planning/publication-all`), une
 * seule logique — jamais de publication par événement.
 */
export function PublishPlanningControl({ onPublished, className, context = 'planning', onBlockersChange, refreshSignal }: PublishPlanningControlProps) {
  const { user } = useCurrentUser();
  const editable = canEdit(user?.accessRole);
  const [publicationPreview, setPublicationPreview] = useState<GlobalPublicationPreview | null>(null);
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const [publicationBlockers, setPublicationBlockers] = useState<PublicationBlocker[] | null>(null);
  const [publishing, setPublishing] = useState(false);

  const loadPublicationPreview = useCallback(async () => {
    if (!editable) return;
    try {
      setPublicationPreview(await apiGet<GlobalPublicationPreview>('/api/planning/publication-all'));
    } catch {
      setPublicationPreview(null);
    }
  }, [editable]);

  useEffect(() => { void loadPublicationPreview(); }, [loadPublicationPreview]);

  // Re-synchronise l'aperçu quand la page hôte signale une modification (retrait
  // d'encadrant, changement de rôle…) : sinon un blocker déjà corrigé reste affiché.
  useEffect(() => {
    if (refreshSignal === undefined) return;
    void loadPublicationPreview();
  }, [refreshSignal, loadPublicationPreview]);

  const publishAll = async () => {
    setPublicationBlockers(null);
    setPublishing(true);
    try {
      await apiPost('/api/planning/publication-all', {});
      toast.success('Planning publié');
    } catch (error) {
      if (error instanceof ApiRequestError && Array.isArray(error.details)) {
        setPublicationBlockers(error.details as PublicationBlocker[]);
      }
      toast.error(error instanceof Error ? error.message : 'Publication impossible');
    } finally {
      setPublishing(false);
      // Rechargée que la publication ait réussi ou échoué, comme l'ancien flux
      // (une tentative peut avoir changé l'état même en cas de blocage partiel).
      await loadPublicationPreview();
      await onPublished?.();
    }
  };

  // Blockers courants : ceux d'une tentative de publication ratée si elle a eu lieu,
  // sinon ceux calculés proactivement par l'aperçu (« afficher le contrôle »).
  const shownBlockers = publicationBlockers ?? publicationPreview?.blockers ?? [];

  // Détails poussés sur les cartes d'événement ; ne restent ici que les blocages
  // sans événement rattaché (ex. approbation admin requise).
  const orphanBlockers = shownBlockers.filter((blocker) => !blocker.eventId);

  useEffect(() => {
    onBlockersChange?.(shownBlockers);
    // shownBlockers est recalculé à chaque rendu : on se base sur ses deux sources.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicationBlockers, publicationPreview]);

  if (!editable) return null;

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:items-end">
        <Button
          size="lg"
          className="h-auto min-h-11 w-full gap-2 whitespace-normal px-4 py-2.5 text-left sm:w-auto sm:text-center"
          onClick={() => setConfirmingPublish(true)}
          disabled={!publicationPreview || publicationPreview.diff.changed === 0 || publishing}
        >
          <UploadCloud className="h-4 w-4" />
          {publishing
            ? 'Publication...'
            : publicationPreview?.diff.changed
              ? `Publier ${publicationPreview.diff.changed} changement(s)`
              : 'Publier le planning'}
        </Button>
        {publicationPreview && (
          <p className="text-pretty text-xs text-muted-foreground sm:text-right">
            {publicationPreview.diff.changed === 0
              ? 'Planning publié à jour'
              : `${publicationPreview.diff.added} ajout(s) · ${publicationPreview.diff.modified} modifié(s) · ${publicationPreview.diff.removed} supprimé(s)`}
            {publicationPreview.lastPublishedAt
              ? ` · dernière publication ${new Date(publicationPreview.lastPublishedAt).toLocaleString('fr-FR')}`
              : ' · aucune publication globale'}
          </p>
        )}
      </div>

      <AlertDialog open={confirmingPublish} onOpenChange={setConfirmingPublish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publier le planning ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                <p>
                  Cette action met à jour immédiatement ce que voient tous les comptes personnels
                  (/mon-planning, calendrier, échanges) : {publicationPreview?.diff.added ?? 0} ajout(s),{' '}
                  {publicationPreview?.diff.modified ?? 0} modification(s), {publicationPreview?.diff.removed ?? 0} suppression(s).
                </p>
                {!!publicationPreview?.diff.removedEvents.length && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                    <p className="mb-2 text-sm font-medium text-destructive">
                      Événements supprimés du planning publié :
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {publicationPreview.diff.removedEvents.map((event) => (
                        <li key={`${event.eventType}:${event.eventId}`}>
                          {event.title} — {event.date} {event.time}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Les échanges d&apos;affectation validés restent visibles immédiatement pour les personnes
                  concernées, sans attendre cette publication globale.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmingPublish(false);
                void publishAll();
              }}
            >
              Confirmer la publication
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!!shownBlockers.length && (
        <div className="mt-2 space-y-2">
          <p className="text-xs font-medium text-destructive lg:text-right">
            {shownBlockers.length} événement(s) bloquant(s) pour la publication — détails sur les cartes concernées
          </p>
          {orphanBlockers.length > 0 && (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-base text-destructive">À corriger avant publication</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {orphanBlockers.map((blocker) => {
                  const href = blockerEventHref(blocker, context);
                  return (
                    <div key={blocker.code} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
                      <span>{blocker.message}</span>
                      {href && <Button size="sm" variant="outline" asChild><Link href={href}>Ouvrir l’événement</Link></Button>}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
