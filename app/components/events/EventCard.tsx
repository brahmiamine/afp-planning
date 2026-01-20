'use client';

import { memo, useState, useCallback } from 'react';
import { Match, Entrainement, Plateau } from '@/types/match';
import { MatchCard } from '../matches/MatchCard';
import { useMatchExtras } from '@/hooks/useMatchExtras';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, MapPin, User, Edit2, CheckCircle2, Trash2 } from 'lucide-react';
import { EventEditor } from './EventEditor';
import { MatchDetails } from '../matches/MatchDetails';
import { MatchTeams } from '../matches/MatchTeams';
import { apiDelete } from '@/lib/utils/api';
import { toast } from 'sonner';

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

  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
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
        const response = await apiDelete<{ success?: boolean; error?: string }>(endpoint);
        console.log('Delete response:', response);
        
        // Vérifier si la suppression a réussi (success: true ou pas d'erreur)
        if (response?.success === true || (!response?.error && response?.success !== false)) {
          toast.success('Événement supprimé avec succès');
          // Attendre un court instant puis forcer le rechargement
          // Utiliser await pour s'assurer que le rechargement se fait
          if (onEventUpdate) {
            // Attendre que la suppression soit bien écrite sur le disque
            await new Promise(resolve => setTimeout(resolve, 300));
            onEventUpdate();
          }
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
  }, [event, isMatchAmical, isEntrainement, isPlateau, onEventUpdate]);

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
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              title="Supprimer"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="flex items-start justify-between mb-3 pr-20">
          <Badge variant={isMatchAmical ? 'default' : isEntrainement ? 'secondary' : 'outline'} className="text-xs sm:text-sm">
            {isMatchAmical ? 'Match amical' : isEntrainement ? 'Entraînement' : 'Plateau'}
          </Badge>
          <div className="text-xs sm:text-sm text-muted-foreground">{event.date}</div>
        </div>

        {isMatchAmical ? (
          <>
            <div className="space-y-3 sm:space-y-4">
              <div className="text-sm text-muted-foreground">
                {(event as Match).competition}
                {(event as Match).categorie && (
                  <span className="ml-2 text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                    {(event as Match).categorie}
                  </span>
                )}
              </div>
              <MatchTeams match={event as Match} />
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
                {isEntrainement && (event as Entrainement).categorie && (
                  <div className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded inline-block mb-2">
                    {(event as Entrainement).categorie}
                  </div>
                )}
                {isPlateau && (event as Plateau).categories && (event as Plateau).categories!.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {(event as Plateau).categories!.map((cat, idx) => (
                      <span key={idx} className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
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
