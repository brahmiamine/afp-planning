'use client';

import { memo, useState, useCallback } from 'react';
import { Match, Entrainement, Plateau } from '@/types/match';
import { MatchListItem } from '../matches/MatchListItem';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, MapPin, User, Edit2 } from 'lucide-react';
import { EventEditor } from './EventEditor';

interface EventListItemProps {
  event: Match | Entrainement | Plateau;
  onEventUpdate?: () => void;
}

export const EventListItem = memo(function EventListItem({ event, onEventUpdate }: EventListItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const isMatch = 'localTeam' in event || 'competition' in event;
  const isMatchOfficiel = isMatch && (event as Match).type === 'officiel';

  // Si c'est un match officiel, utiliser le composant MatchListItem (sans modification)
  if (isMatchOfficiel) {
    return <MatchListItem match={event as Match} onMatchUpdate={onEventUpdate} />;
  }

  // Pour les matchs amicaux, afficher avec possibilité d'édition
  const isMatchAmical = isMatch && (event as Match).type === 'amical';
  const isEntrainement = !isMatch && event.type === 'entrainement';
  const isPlateau = !isMatch && event.type === 'plateau';

  // Permettre l'édition uniquement pour les matchs amicaux, entraînements et plateaux
  const canEdit = isMatchAmical || isEntrainement || isPlateau;

  const handleEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleSave = useCallback(() => {
    setIsEditing(false);
    onEventUpdate?.();
  }, [onEventUpdate]);

  const handleDelete = useCallback(() => {
    onEventUpdate?.();
  }, [onEventUpdate]);

  return (
    <>
      <div className="bg-card border border-border rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow relative">
        {canEdit && (
          <div className="absolute top-2 right-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleEdit}
              className="h-8 w-8 p-0"
              title="Modifier"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 pr-10">
          <div className="flex items-center gap-2 sm:gap-3">
            <Badge 
              variant={isMatchAmical ? 'default' : isEntrainement ? 'secondary' : 'outline'} 
              className="text-xs"
            >
              {isMatchAmical ? 'Match amical' : isEntrainement ? 'Entraînement' : 'Plateau'}
            </Badge>
            <div className="flex items-center gap-2 text-sm sm:text-base">
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
              <span className="font-medium">{event.time}</span>
            </div>
          </div>

          {isMatchAmical ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm">
              <span className="font-semibold">
                {(event as Match).localTeam} vs {(event as Match).awayTeam}
              </span>
              <span className="text-muted-foreground">
                {(event as Match).competition}
              </span>
            </div>
          ) : (
            'lieu' in event && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="break-words">{event.lieu}</span>
                </div>
                {'encadrant' in event && event.encadrant && (
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>
                      {event.encadrant?.prenom || ''} {event.encadrant?.nom || ''}
                    </span>
                  </div>
                )}
                {'encadrants' in event && event.encadrants && event.encadrants.length > 0 && (
                  <div className="flex flex-col gap-2 text-sm sm:text-base">
                    {event.encadrants.map((encadrant, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 sm:gap-2">
                        <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span>
                          {encadrant.nom}{encadrant.numero ? ` - ${encadrant.numero}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>

      {isEditing && canEdit && (
        <EventEditor
          event={event}
          onClose={handleClose}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </>
  );
});
