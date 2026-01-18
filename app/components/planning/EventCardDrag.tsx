'use client';

import { useDroppable } from '@dnd-kit/core';
import { memo, useState, useCallback, useMemo, useEffect } from 'react';
import { Match, Entrainement, Plateau } from '@/types/match';
import { useMatchExtras, ContactOfficiel } from '@/hooks/useMatchExtras';
import { useOfficiels } from '@/hooks/useOfficiels';
import { OfficielCombobox } from '@/components/ui/officiel-combobox';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Edit2, Trash2, X, Users } from 'lucide-react';
import { EventEditor } from '@/components/events/EventEditor';
import { MatchEditor } from '@/components/matches/MatchEditor';
import { apiPut, apiDelete } from '@/lib/utils/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDateWithDayName } from '@/lib/utils/date';

type Event = Match | Entrainement | Plateau;

interface EventCardDragProps {
  event: Event;
  onEventUpdate: () => void;
  onDelete?: () => void;
}

type DropZoneType = 'arbitre' | 'encadrant' | 'accompagnateur';

export const EventCardDrag = memo(function EventCardDrag({
  event,
  onEventUpdate,
  onDelete,
}: EventCardDragProps) {
  const isMatch = 'localTeam' in event || 'competition' in event;
  const isMatchAmical = isMatch && (event as Match).type === 'amical';
  const isEntrainement = !isMatch && event.type === 'entrainement';
  const isPlateau = !isMatch && event.type === 'plateau';
  const isMatchOfficiel = isMatch && !isMatchAmical;

  const { extras, save: saveExtras } = useMatchExtras(
    isMatchAmical || isMatchOfficiel ? event.id : undefined
  );
  const { officiels } = useOfficiels();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [accordionValue, setAccordionValue] = useState<string>('');

  // Récupérer les officiels affectés selon le type d'événement
  const affectedOfficiels = useMemo(() => {
    if (isMatchAmical || isMatchOfficiel) {
      const match = event as Match;
      return {
        arbitres: Array.isArray(extras?.arbitreTouche)
          ? extras.arbitreTouche
          : extras?.arbitreTouche
          ? [extras.arbitreTouche]
          : [],
        encadrants: Array.isArray(extras?.contactEncadrants)
          ? extras.contactEncadrants
          : extras?.contactEncadrants
          ? [extras.contactEncadrants]
          : [],
        accompagnateurs: Array.isArray(extras?.contactAccompagnateur)
          ? extras.contactAccompagnateur
          : extras?.contactAccompagnateur
          ? [extras.contactAccompagnateur]
          : [],
      };
    } else if (isEntrainement) {
      const entrainement = event as Entrainement;
      return {
        encadrants: entrainement.encadrants || [],
      };
    } else if (isPlateau) {
      const plateau = event as Plateau;
      return {
        encadrants: plateau.encadrants || [],
      };
    }
    return { encadrants: [] };
  }, [event, extras, isMatchAmical, isMatchOfficiel, isEntrainement, isPlateau]);

  // Zone de drop pour toute la carte (détection du survol pour ouvrir l'accordion)
  const cardDropZone = useDroppable({
    id: `drop-card-${event.id}`,
    data: {
      eventId: event.id,
      eventType: isMatch ? 'match' : isEntrainement ? 'entrainement' : 'plateau',
      role: 'card',
    },
  });

  // Zones de drop spécifiques pour l'affectation
  const arbitreDropZone = useDroppable({
    id: `drop-arbitre-${event.id}`,
    data: {
      eventId: event.id,
      eventType: isMatch ? 'match' : isEntrainement ? 'entrainement' : 'plateau',
      role: 'arbitre',
    },
  });

  const encadrantDropZone = useDroppable({
    id: `drop-encadrant-${event.id}`,
    data: {
      eventId: event.id,
      eventType: isMatch ? 'match' : isEntrainement ? 'entrainement' : 'plateau',
      role: 'encadrant',
    },
  });

  const accompagnateurDropZone = useDroppable({
    id: `drop-accompagnateur-${event.id}`,
    data: {
      eventId: event.id,
      eventType: isMatch ? 'match' : isEntrainement ? 'entrainement' : 'plateau',
      role: 'accompagnateur',
    },
  });

  // Détecter le drag over sur la carte pour ouvrir l'accordion automatiquement
  useEffect(() => {
    const isCardOver = cardDropZone.isOver;
    const isAnyZoneOver =
      arbitreDropZone.isOver ||
      encadrantDropZone.isOver ||
      accompagnateurDropZone.isOver;

    if ((isCardOver || isAnyZoneOver) && accordionValue !== 'details') {
      setAccordionValue('details');
    }

    // Fermer l'accordion après le drop (quand on n'est plus en train de drag)
    if (!isCardOver && !isAnyZoneOver && accordionValue === 'details') {
      const timer = setTimeout(() => {
        setAccordionValue('');
      }, 2000); // Fermer après 2 secondes
      return () => clearTimeout(timer);
    }
  }, [
    cardDropZone.isOver,
    arbitreDropZone.isOver,
    encadrantDropZone.isOver,
    accompagnateurDropZone.isOver,
    accordionValue,
  ]);

  const handleAddOfficiel = useCallback(
    async (role: DropZoneType, officielNom: string) => {
      if (!officielNom.trim()) return;

      const officiel = officiels.find(
        (o) => o.nom.toLowerCase().trim() === officielNom.toLowerCase().trim()
      );

      if (!officiel) {
        toast.error('Officiel non trouvé');
        return;
      }

      const contact: ContactOfficiel = {
        nom: officiel.nom,
        numero: officiel.telephone || '',
      };

      try {
        if (isMatchAmical || isMatchOfficiel) {
          const currentExtras = extras || {
            id: event.id || '',
            confirmed: false,
            arbitreTouche: [],
            contactEncadrants: [],
            contactAccompagnateur: [],
          };

          const updatedExtras = { ...currentExtras };

          if (role === 'arbitre') {
            const existing = Array.isArray(updatedExtras.arbitreTouche)
              ? updatedExtras.arbitreTouche
              : updatedExtras.arbitreTouche
              ? [updatedExtras.arbitreTouche]
              : [];
            if (!existing.some((c) => c.nom.toLowerCase() === contact.nom.toLowerCase())) {
              updatedExtras.arbitreTouche = [...existing, contact];
            }
          } else if (role === 'encadrant') {
            const existing = Array.isArray(updatedExtras.contactEncadrants)
              ? updatedExtras.contactEncadrants
              : updatedExtras.contactEncadrants
              ? [updatedExtras.contactEncadrants]
              : [];
            if (!existing.some((c) => c.nom.toLowerCase() === contact.nom.toLowerCase())) {
              updatedExtras.contactEncadrants = [...existing, contact];
            }
          } else if (role === 'accompagnateur') {
            const existing = Array.isArray(updatedExtras.contactAccompagnateur)
              ? updatedExtras.contactAccompagnateur
              : updatedExtras.contactAccompagnateur
              ? [updatedExtras.contactAccompagnateur]
              : [];
            if (!existing.some((c) => c.nom.toLowerCase() === contact.nom.toLowerCase())) {
              updatedExtras.contactAccompagnateur = [...existing, contact];
            }
          }

          await saveExtras(updatedExtras);
        } else if (isEntrainement || isPlateau) {
          const currentEncadrants = (event as Entrainement | Plateau).encadrants || [];
          if (!currentEncadrants.some((c) => c.nom.toLowerCase() === contact.nom.toLowerCase())) {
            const updatedEvent = {
              ...event,
              encadrants: [...currentEncadrants, contact],
            };
            await apiPut(
              isEntrainement ? '/api/entrainements' : '/api/plateaux',
              updatedEvent
            );
          }
        }

        toast.success('Officiel affecté avec succès');
        setAccordionValue(''); // Fermer l'accordion après affectation
        onEventUpdate();
      } catch (error) {
        console.error('Error adding officiel:', error);
        toast.error('Erreur lors de l\'affectation de l\'officiel');
      }
    },
    [event, extras, officiels, isMatchAmical, isMatchOfficiel, isEntrainement, isPlateau, saveExtras, onEventUpdate]
  );

  const handleRemoveOfficiel = useCallback(
    async (role: DropZoneType, officielNom: string) => {
      try {
        if (isMatchAmical || isMatchOfficiel) {
          const currentExtras = extras || {
            id: event.id || '',
            confirmed: false,
            arbitreTouche: [],
            contactEncadrants: [],
            contactAccompagnateur: [],
          };

          const updatedExtras = { ...currentExtras };

          if (role === 'arbitre') {
            const existing = Array.isArray(updatedExtras.arbitreTouche)
              ? updatedExtras.arbitreTouche
              : updatedExtras.arbitreTouche
              ? [updatedExtras.arbitreTouche]
              : [];
            updatedExtras.arbitreTouche = existing.filter(
              (c) => c.nom.toLowerCase() !== officielNom.toLowerCase()
            );
          } else if (role === 'encadrant') {
            const existing = Array.isArray(updatedExtras.contactEncadrants)
              ? updatedExtras.contactEncadrants
              : updatedExtras.contactEncadrants
              ? [updatedExtras.contactEncadrants]
              : [];
            updatedExtras.contactEncadrants = existing.filter(
              (c) => c.nom.toLowerCase() !== officielNom.toLowerCase()
            );
          } else if (role === 'accompagnateur') {
            const existing = Array.isArray(updatedExtras.contactAccompagnateur)
              ? updatedExtras.contactAccompagnateur
              : updatedExtras.contactAccompagnateur
              ? [updatedExtras.contactAccompagnateur]
              : [];
            updatedExtras.contactAccompagnateur = existing.filter(
              (c) => c.nom.toLowerCase() !== officielNom.toLowerCase()
            );
          }

          await saveExtras(updatedExtras);
        } else if (isEntrainement || isPlateau) {
          const currentEncadrants = (event as Entrainement | Plateau).encadrants || [];
          const updatedEncadrants = currentEncadrants.filter(
            (c) => c.nom.toLowerCase() !== officielNom.toLowerCase()
          );
          const updatedEvent = {
            ...event,
            encadrants: updatedEncadrants,
          };
          await apiPut(isEntrainement ? '/api/entrainements' : '/api/plateaux', updatedEvent);
        }

        toast.success('Officiel retiré avec succès');
        setAccordionValue(''); // Fermer l'accordion après retrait
        onEventUpdate();
      } catch (error) {
        console.error('Error removing officiel:', error);
        toast.error('Erreur lors du retrait de l\'officiel');
      }
    },
    [event, extras, isMatchAmical, isMatchOfficiel, isEntrainement, isPlateau, saveExtras, onEventUpdate]
  );

  const handleToggleConfirmed = useCallback(async () => {
    if (!isMatchAmical && !isMatchOfficiel) return;

    try {
      const currentExtras = extras || {
        id: event.id || '',
        confirmed: false,
        arbitreTouche: [],
        contactEncadrants: [],
        contactAccompagnateur: [],
      };

      const updatedExtras = {
        ...currentExtras,
        confirmed: !currentExtras.confirmed,
      };

      await saveExtras(updatedExtras);
      toast.success(
        updatedExtras.confirmed
          ? 'Match marqué comme complété'
          : 'Match marqué comme non complété'
      );
      onEventUpdate();
    } catch (error) {
      console.error('Error toggling confirmed:', error);
      toast.error('Erreur lors de la mise à jour du statut');
    }
  }, [extras, isMatchAmical, isMatchOfficiel, event.id, saveExtras, onEventUpdate]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet événement ?')) {
      return;
    }

    setIsDeleting(true);
    try {
      let endpoint = '';
      if (isMatchAmical) {
        endpoint = `/api/matches-amicaux?id=${encodeURIComponent(event.id || '')}`;
      } else if (isEntrainement) {
        endpoint = `/api/entrainements?id=${encodeURIComponent(event.id || '')}`;
      } else if (isPlateau) {
        endpoint = `/api/plateaux?id=${encodeURIComponent(event.id || '')}`;
      }

      if (endpoint && event.id) {
        const response = await apiDelete<{ success: boolean; error?: string }>(endpoint);
        if (response?.success !== false && !response?.error) {
          toast.success('Événement supprimé avec succès');
          // Attendre un court instant puis forcer le rechargement
          setTimeout(() => {
            onDelete?.();
            onEventUpdate();
          }, 200);
        } else {
          toast.error(response?.error || 'Erreur lors de la suppression de l\'événement');
        }
      }
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error('Erreur lors de la suppression de l\'événement');
    } finally {
      setIsDeleting(false);
    }
  }, [event, isMatchAmical, isEntrainement, isPlateau, onDelete]);

  const getEventTitle = () => {
    if (isMatch) {
      const match = event as Match;
      return `${match.localTeam} vs ${match.awayTeam}`;
    } else if (isEntrainement) {
      return 'Entraînement';
    } else if (isPlateau) {
      return 'Plateau';
    }
    return 'Événement';
  };

  // Compter le total d'officiels affectés
  const totalOfficiels = useMemo(() => {
    if (isMatchAmical || isMatchOfficiel) {
      return (
        (affectedOfficiels.arbitres?.length || 0) +
        (affectedOfficiels.encadrants?.length || 0) +
        (affectedOfficiels.accompagnateurs?.length || 0)
      );
    }
    return affectedOfficiels.encadrants?.length || 0;
  }, [affectedOfficiels, isMatchAmical, isMatchOfficiel]);

  const DropZone = ({
    dropZone,
    role,
    label,
    officiels: zoneOfficiels,
  }: {
    dropZone: ReturnType<typeof useDroppable>;
    role: DropZoneType;
    label: string;
    officiels: ContactOfficiel[];
  }) => (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold">{label}</Label>
      <div
        ref={dropZone.setNodeRef}
        className={cn(
          'min-h-[50px] p-1.5 rounded-md border-2 border-dashed transition-all duration-200',
          dropZone.isOver
            ? 'border-primary bg-primary/10 scale-[1.02] shadow-md'
            : 'border-muted-foreground/30 bg-muted/30 hover:border-muted-foreground/50'
        )}
      >
        {zoneOfficiels.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {zoneOfficiels.map((contact, idx) => (
              <Badge key={idx} variant="secondary" className="flex items-center gap-0.5 text-[10px] px-1.5 py-0 h-5">
                <span className="truncate max-w-[100px]">{contact.nom}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-3.5 w-3.5 p-0"
                  onClick={() => handleRemoveOfficiel(role, contact.nom)}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className={cn(
            'text-[10px] text-center py-1.5 transition-colors',
            dropZone.isOver
              ? 'text-primary font-medium'
              : 'text-muted-foreground'
          )}>
            {dropZone.isOver
              ? 'Relâchez pour affecter l\'officiel'
              : 'Glissez un officiel ici ou utilisez le dropdown'}
          </p>
        )}
        <div className="mt-1.5">
          <OfficielCombobox
            officiels={officiels}
            value=""
            onValueChange={(value) => handleAddOfficiel(role, value)}
            placeholder={`Sélectionner un ${label.toLowerCase()}`}
            className="h-7 text-[11px]"
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Card
        ref={cardDropZone.setNodeRef}
        className={cn(
          'p-2 transition-colors',
          cardDropZone.isOver && 'ring-2 ring-primary ring-offset-2'
        )}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <h3 className="font-semibold text-sm truncate">{getEventTitle()}</h3>
              {isMatchOfficiel && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                  Officiel
                </Badge>
              )}
              {isMatchAmical && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                  Amical
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="truncate">
                {formatDateWithDayName(event.date)} à {event.time}
              </span>
              {totalOfficiels > 0 && (
                <span className="flex items-center gap-1 shrink-0">
                  <Users className="h-3 w-3" />
                  {totalOfficiels}
                </span>
              )}
            </div>
            {isMatch && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {(event as Match).competition}
              </p>
            )}
            {!isMatch && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {(event as Entrainement | Plateau).lieu}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Switch pour marquer comme complété (uniquement pour les matchs) */}
            {(isMatchAmical || isMatchOfficiel) && (
              <div className="flex items-center gap-1.5">
                <Switch
                  checked={extras?.confirmed || false}
                  onCheckedChange={handleToggleConfirmed}
                  className="h-4 w-7"
                />
                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                  Complété
                </span>
              </div>
            )}
            {/* Bouton Edit (pour tous les événements éditables) */}
            {(isMatchAmical || isMatchOfficiel || isEntrainement || isPlateau) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsEditing(true)}
                title="Éditer"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {/* Bouton Delete (uniquement pour les événements créés manuellement) */}
            {(isMatchAmical || isEntrainement || isPlateau) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={handleDelete}
                disabled={isDeleting}
                title="Supprimer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <Accordion
          type="single"
          collapsible
          value={accordionValue}
          onValueChange={setAccordionValue}
          className="w-full"
        >
          <AccordionItem value="details" className="border-0">
            <AccordionTrigger className="py-1 text-[11px] hover:no-underline">
              <span className="text-muted-foreground">
                {accordionValue === 'details' ? 'Masquer' : 'Afficher'} les détails et affectations
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              {(isMatchAmical || isMatchOfficiel) && (
                <div className="space-y-2">
                  <DropZone
                    dropZone={arbitreDropZone}
                    role="arbitre"
                    label="Arbitres AFP"
                    officiels={affectedOfficiels.arbitres || []}
                  />
                  <DropZone
                    dropZone={encadrantDropZone}
                    role="encadrant"
                    label="Encadrants"
                    officiels={affectedOfficiels.encadrants || []}
                  />
                  <DropZone
                    dropZone={accompagnateurDropZone}
                    role="accompagnateur"
                    label="Accompagnateurs"
                    officiels={affectedOfficiels.accompagnateurs || []}
                  />
                </div>
              )}

              {(isEntrainement || isPlateau) && (
                <div className="space-y-2">
                  <DropZone
                    dropZone={encadrantDropZone}
                    role="encadrant"
                    label="Encadrants"
                    officiels={affectedOfficiels.encadrants || []}
                  />
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>

      {isEditing && isMatchOfficiel && (
        <MatchEditor
          match={event as Match}
          onClose={() => setIsEditing(false)}
          onSave={() => {
            setIsEditing(false);
            onEventUpdate();
          }}
        />
      )}
      {isEditing && (isMatchAmical || isEntrainement || isPlateau) && (
        <EventEditor
          event={event}
          onClose={() => setIsEditing(false)}
          onSave={() => {
            setIsEditing(false);
            onEventUpdate();
          }}
          onDelete={onDelete}
        />
      )}
    </>
  );
});
