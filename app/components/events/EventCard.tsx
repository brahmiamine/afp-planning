'use client';

import { memo, useState, useCallback } from 'react';
import { Match, Entrainement, Plateau } from '@/types/match';
import { MatchCard } from '../matches/MatchCard';
import { useMatchExtras } from '@/hooks/useMatchExtras';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, MapPin, User, Edit2, CheckCircle2 } from 'lucide-react';
import { EventEditor } from './EventEditor';
import { MatchDetails } from '../matches/MatchDetails';

interface EventCardProps {
  event: Match | Entrainement | Plateau;
  onEventUpdate?: () => void;
}

export const EventCard = memo(function EventCard({ event, onEventUpdate }: EventCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const isMatch = 'localTeam' in event || 'competition' in event;
  const isMatchOfficiel = isMatch && (event as Match).type === 'officiel';

  // Si c'est un match officiel, utiliser le composant MatchCard (sans modification)
  if (isMatchOfficiel) {
    return <MatchCard match={event as Match} onMatchUpdate={onEventUpdate} />;
  }

  // Pour les matchs amicaux, afficher avec possibilité d'édition
  const isMatchAmical = isMatch && (event as Match).type === 'amical';
  const isEntrainement = !isMatch && event.type === 'entrainement';
  const isPlateau = !isMatch && event.type === 'plateau';

  // Permettre l'édition uniquement pour les matchs amicaux, entraînements et plateaux
  const canEdit = isMatchAmical || isEntrainement || isPlateau;

  // Charger les extras pour les matchs amicaux
  const { extras } = useMatchExtras(isMatchAmical ? event.id : undefined);

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
      <Card className="p-4 sm:p-6 relative">
        {canEdit && (
          <div className="absolute top-2 right-2 flex gap-1">
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

        <div className="flex items-start justify-between mb-3 pr-12">
          <Badge variant={isMatchAmical ? 'default' : isEntrainement ? 'secondary' : 'outline'} className="text-xs sm:text-sm">
            {isMatchAmical ? 'Match amical' : isEntrainement ? 'Entraînement' : 'Plateau'}
          </Badge>
          <div className="text-xs sm:text-sm text-muted-foreground">{event.date}</div>
        </div>

        {isMatchAmical ? (
          <>
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center gap-2 text-sm sm:text-base">
                <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium">{event.time}</span>
              </div>
              <div className="text-base sm:text-lg font-semibold">
                {(event as Match).localTeam} vs {(event as Match).awayTeam}
              </div>
              <div className="text-sm text-muted-foreground">
                {(event as Match).competition}
              </div>
              {event.details && (
                <div className="text-xs sm:text-sm text-muted-foreground space-y-1">
                  {event.details.stadium && <div>📍 {event.details.stadium}</div>}
                  {event.details.address && <div>📍 {event.details.address}</div>}
                </div>
              )}
              <MatchDetails match={event as Match} extras={extras} />
              {extras?.confirmed && (
                <div className="pt-3 border-t flex items-center justify-end">
                  <Badge variant="default">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Complété
                  </Badge>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center gap-2 text-sm sm:text-base">
              <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="font-medium">{event.time}</span>
            </div>

            {'lieu' in event && (
              <>
                <div className="flex items-start gap-2 text-sm sm:text-base">
                  <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <span className="break-words">{event.lieu}</span>
                </div>

                {'encadrant' in event && event.encadrant && (
                  <div className="flex items-center gap-2 text-sm sm:text-base">
                    <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span>
                      {event.encadrant?.prenom || ''} {event.encadrant?.nom || ''}
                    </span>
                  </div>
                )}
                {'encadrants' in event && event.encadrants && event.encadrants.length > 0 && (
                  <div className="flex flex-col gap-2 text-sm sm:text-base">
                    {event.encadrants.map((encadrant, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span>
                          {encadrant.nom}{encadrant.numero ? ` - ${encadrant.numero}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Card>

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
