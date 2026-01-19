'use client';

import { useState, useMemo, memo } from 'react';
import { Match, Entrainement, Plateau } from '@/types/match';
import { ContactOfficiel } from '@/hooks/useMatchExtras';
import { Officiel } from '@/hooks/useOfficiels';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Loader2 } from 'lucide-react';
import { apiPut } from '@/lib/utils/api';
import { toast } from 'sonner';
import { formatDateWithDayName } from '@/lib/utils/date';

type Event = Match | Entrainement | Plateau;

interface OfficielAssignPopoverProps {
  officiel: Officiel;
  events: Record<string, Event[]>;
  onAssign: () => void;
  children: React.ReactNode;
}

export const OfficielAssignPopover = memo(function OfficielAssignPopover({
  officiel,
  events,
  onAssign,
  children,
}: OfficielAssignPopoverProps) {
  const [open, setOpen] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  // Flatten events into a single array with date info
  const allEventsList = useMemo(() => {
    const list: Array<{ event: Event; date: string }> = [];
    Object.entries(events).forEach(([date, eventList]) => {
      eventList.forEach((event) => {
        list.push({ event, date });
      });
    });
    return list.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      const timeA = 'time' in a.event ? a.event.time : '';
      const timeB = 'time' in b.event ? b.event.time : '';
      return timeA.localeCompare(timeB);
    });
  }, [events]);

  const handleAssign = async (
    event: Event,
    role: 'arbitre' | 'encadrant' | 'accompagnateur'
  ) => {
    const eventId = event.id;
    if (!eventId) {
      toast.error('ID d\'événement manquant');
      return;
    }

    setAssigning(`${eventId}-${role}`);
    const contact: ContactOfficiel = {
      nom: officiel.nom,
      numero: officiel.telephone || '',
    };

    try {
      const isMatch = 'localTeam' in event || 'competition' in event;
      const isMatchAmical = isMatch && (event as Match).type === 'amical';
      const isMatchOfficiel = isMatch && !isMatchAmical;
      const isEntrainement = !isMatch && event.type === 'entrainement';
      const isPlateau = !isMatch && event.type === 'plateau';

      if (isMatchAmical || isMatchOfficiel) {
        // Pour les matchs, utiliser l'API matches/[id]
        const currentExtras = await fetch(`/api/matches/${eventId}`)
          .then((res) => res.json())
          .catch(() => null);

        const updatedExtras = {
          id: eventId,
          confirmed: currentExtras?.confirmed || false,
          arbitreTouche: Array.isArray(currentExtras?.arbitreTouche)
            ? currentExtras.arbitreTouche
            : currentExtras?.arbitreTouche
            ? [currentExtras.arbitreTouche]
            : [],
          contactEncadrants: Array.isArray(currentExtras?.contactEncadrants)
            ? currentExtras.contactEncadrants
            : currentExtras?.contactEncadrants
            ? [currentExtras.contactEncadrants]
            : [],
          contactAccompagnateur: Array.isArray(currentExtras?.contactAccompagnateur)
            ? currentExtras.contactAccompagnateur
            : currentExtras?.contactAccompagnateur
            ? [currentExtras.contactAccompagnateur]
            : [],
        };

        if (role === 'arbitre') {
          const existing = updatedExtras.arbitreTouche || [];
          if (!existing.some((c: ContactOfficiel) => c.nom.toLowerCase() === contact.nom.toLowerCase())) {
            updatedExtras.arbitreTouche = [...existing, contact];
          } else {
            toast.info('Cet officiel est déjà affecté comme arbitre');
            setAssigning(null);
            return;
          }
        } else if (role === 'encadrant') {
          const existing = updatedExtras.contactEncadrants || [];
          if (!existing.some((c: ContactOfficiel) => c.nom.toLowerCase() === contact.nom.toLowerCase())) {
            updatedExtras.contactEncadrants = [...existing, contact];
          } else {
            toast.info('Cet officiel est déjà affecté comme encadrant');
            setAssigning(null);
            return;
          }
        } else if (role === 'accompagnateur') {
          const existing = updatedExtras.contactAccompagnateur || [];
          if (!existing.some((c: ContactOfficiel) => c.nom.toLowerCase() === contact.nom.toLowerCase())) {
            updatedExtras.contactAccompagnateur = [...existing, contact];
          } else {
            toast.info('Cet officiel est déjà affecté comme accompagnateur');
            setAssigning(null);
            return;
          }
        }

        await apiPut(`/api/matches/${eventId}`, updatedExtras);
      } else if (isEntrainement || isPlateau) {
        // Pour les entraînements et plateaux
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
        } else {
          toast.info('Cet officiel est déjà affecté comme encadrant');
          setAssigning(null);
          return;
        }
      }

      toast.success('Officiel affecté avec succès');
      onAssign();
    } catch (error) {
      console.error('Error assigning officiel:', error);
      toast.error('Erreur lors de l\'affectation de l\'officiel');
    } finally {
      setAssigning(null);
    }
  };

  const getEventTitle = (event: Event) => {
    if ('localTeam' in event) {
      const match = event as Match;
      return `${match.localTeam} vs ${match.awayTeam}`;
    } else if (event.type === 'entrainement') {
      return 'Entraînement';
    } else if (event.type === 'plateau') {
      return 'Plateau';
    }
    return 'Événement';
  };

  const getEventRoles = (event: Event): Array<'arbitre' | 'encadrant' | 'accompagnateur'> => {
    const isMatch = 'localTeam' in event || 'competition' in event;
    if (isMatch) {
      return ['arbitre', 'encadrant', 'accompagnateur'];
    }
    return ['encadrant'];
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-sm">Affecter {officiel.nom}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Sélectionnez un événement et un rôle
          </p>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          <div className="p-2 space-y-2">
            {allEventsList.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Aucun événement disponible
              </div>
            ) : (
              allEventsList.map(({ event, date }) => {
                const eventId = event.id || '';
                const roles = getEventRoles(event);
                const isMatch = 'localTeam' in event || 'competition' in event;
                const isMatchAmical = isMatch && (event as Match).type === 'amical';

                return (
                  <div
                    key={eventId}
                    className="p-3 border rounded-lg space-y-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <p className="font-medium text-xs truncate">
                            {getEventTitle(event)}
                          </p>
                          {isMatchAmical && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                              Amical
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDateWithDayName(date)} à {event.time}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {roles.map((role) => {
                        const key = `${eventId}-${role}`;
                        const isAssigning = assigning === key;
                        return (
                          <Button
                            key={role}
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] px-2"
                            onClick={() => handleAssign(event, role)}
                            disabled={isAssigning}
                          >
                            {isAssigning ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <UserPlus className="h-3 w-3 mr-1" />
                            )}
                            {role === 'arbitre'
                              ? 'Arbitre'
                              : role === 'encadrant'
                              ? 'Encadrant'
                              : 'Accompagnateur'}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
});
