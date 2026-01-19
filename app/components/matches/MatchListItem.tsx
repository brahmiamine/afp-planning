'use client';

import { Calendar, MapPin, Clock, ExternalLink, CheckCircle2, Edit, User, Phone, Trophy } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { Match } from '@/types/match';
import { useMatchExtras } from '@/hooks/useMatchExtras';
import { MatchEditor } from './MatchEditor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getVenueClasses } from '@/lib/utils/match';
import { cn } from '@/lib/utils';
import { TeamLogo } from '@/components/ui/team-logo';

interface MatchListItemProps {
  match: Match;
  onMatchUpdate?: () => void;
}

export const MatchListItem = memo(function MatchListItem({ match, onMatchUpdate }: MatchListItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { extras, reload: reloadExtras } = useMatchExtras(match.id);
  const venueClasses = getVenueClasses(match.venue);

  // Helper pour vérifier si un contact est un objet avec nom (rétrocompatibilité)
  const hasContactData = (contact: any): boolean => {
    if (Array.isArray(contact)) return contact.length > 0;
    if (contact && typeof contact === 'object' && 'nom' in contact) return !!contact.nom;
    return false;
  };

  // Helper pour obtenir un contact comme objet (rétrocompatibilité)
  const getContactAsObject = (contact: any): { nom: string; numero?: string } | null => {
    if (!contact) return null;
    if (Array.isArray(contact)) return null;
    if (contact && typeof contact === 'object' && 'nom' in contact) {
      return contact as { nom: string; numero?: string };
    }
    return null;
  };

  const handleSave = useCallback(() => {
    setIsEditing(false);
    reloadExtras();
    onMatchUpdate?.();
  }, [reloadExtras, onMatchUpdate]);

  const handleEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsEditing(false);
  }, []);

  return (
    <>
      <div className="bg-card border border-border rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow">
        {/* En-tête avec date, heure, venue et compétition */}
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4 pb-2 sm:pb-3 border-b">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs sm:text-sm font-semibold text-foreground">{match.date}</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs sm:text-sm text-foreground">{match.time}</span>
            </div>
            <span className={cn('inline-block px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-xs font-semibold', venueClasses)}>
              {match.venue === 'domicile' ? '🏠' : '✈️'}
              <span className="hidden sm:inline ml-1">{match.venue === 'domicile' ? 'Domicile' : 'Extérieur'}</span>
            </span>
            {match.type && (
              <Badge variant="outline" className="text-xs capitalize">
                {match.type}
              </Badge>
            )}
            {extras?.confirmed && (
              <Badge variant="default" className="flex items-center gap-1 text-xs">
                <CheckCircle2 className="w-3 h-3" />
                <span className="hidden sm:inline">Complété</span>
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleEdit}
              className="h-7 w-7 sm:h-8 sm:w-8"
              title="Modifier le match"
            >
              <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Button>
          </div>
        </div>

        {/* Équipes */}
        <div className="mb-3 sm:mb-4">
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
              <TeamLogo
                logo={match.localTeamLogo}
                name={match.localTeam}
                size={32}
                className="w-6 h-6 sm:w-8 sm:h-8 shrink-0"
              />
              <p className="font-semibold text-foreground text-sm sm:text-base truncate">{match.localTeam}</p>
            </div>
            <span className="text-muted-foreground font-bold text-sm sm:text-base shrink-0">VS</span>
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <p className="font-semibold text-foreground text-sm sm:text-base truncate">{match.awayTeam}</p>
              <TeamLogo
                logo={match.awayTeamLogo}
                name={match.awayTeam}
                size={32}
                className="w-6 h-6 sm:w-8 sm:h-8 shrink-0"
              />
            </div>
          </div>
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
            <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            <span className="truncate">{match.competition}</span>
          </div>
          {match.horaireRendezVous && (
            <p className="text-xs text-muted-foreground text-center mt-1">
              RDV: {match.horaireRendezVous}
            </p>
          )}
        </div>

        {/* Détails du stade */}
        {match.details?.stadium && (
          <div className="mb-3 sm:mb-4 pb-2 sm:pb-3 border-b">
            <div className="flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-foreground">{match.details.stadium}</p>
                {match.details.address && (
                  <p className="text-xs text-muted-foreground mt-1 break-words">{match.details.address}</p>
                )}
                {match.details.terrainType && (
                  <p className="text-xs text-muted-foreground mt-1">Type: {match.details.terrainType}</p>
                )}
                {match.details.itineraryLink && (
                  <a
                    href={match.details.itineraryLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 text-xs mt-1 inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Voir l'itinéraire
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Staff du match */}
        {(match.staff?.referee || match.staff?.assistant1 || match.staff?.assistant2) && (
          <div className="mb-4 pb-3 border-b">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Staff du match</p>
            <div className="text-xs text-foreground space-y-1">
              {match.staff.referee && (
                <p>
                  Arbitre: <span className="font-medium">{match.staff.referee}</span>
                </p>
              )}
              {match.staff.assistant1 && (
                <p>
                  Assistant 1: <span className="font-medium">{match.staff.assistant1}</span>
                </p>
              )}
              {match.staff.assistant2 && (
                <p>
                  Assistant 2: <span className="font-medium">{match.staff.assistant2}</span>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Informations supplémentaires (extras) */}
        {extras && (
          hasContactData(extras.arbitreTouche) ||
          hasContactData(extras.contactEncadrants) ||
          hasContactData(extras.contactAccompagnateur)
        ) && (
          <div className="bg-muted rounded-lg p-3">
            <p className="text-xs font-semibold text-foreground mb-2">Informations supplémentaires</p>
            <div className="text-xs text-foreground space-y-1.5">
              {/* Arbitres AFP */}
              {Array.isArray(extras.arbitreTouche) && extras.arbitreTouche.length > 0 && extras.arbitreTouche.map((arbitre, index) => (
                <div key={index} className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <span>
                    Arbitre AFP {extras.arbitreTouche!.length > 1 ? `#${index + 1}` : ''}: <span className="font-medium">{arbitre.nom}</span>
                    {arbitre.numero && (
                      <span className="text-muted-foreground"> - {arbitre.numero}</span>
                    )}
                  </span>
                </div>
              ))}
              {(() => {
                const oldArbitre = getContactAsObject(extras.arbitreTouche);
                return oldArbitre && (
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <span>
                    Arbitre AFP: <span className="font-medium">{oldArbitre.nom}</span>
                      {oldArbitre.numero && (
                        <span className="text-muted-foreground"> - {oldArbitre.numero}</span>
                      )}
                    </span>
                  </div>
                );
              })()}
              
              {/* Encadrants */}
              {Array.isArray(extras.contactEncadrants) && extras.contactEncadrants.length > 0 && extras.contactEncadrants.map((encadrant, index) => (
                <div key={index} className="flex items-start gap-2">
                  <Phone className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                  <span>
                    Encadrant {extras.contactEncadrants!.length > 1 ? `#${index + 1}` : ''}: <span className="font-medium">{encadrant.nom}</span>
                    {encadrant.numero && (
                      <span className="text-muted-foreground"> - {encadrant.numero}</span>
                    )}
                  </span>
                </div>
              ))}
              {(() => {
                const oldEncadrant = getContactAsObject(extras.contactEncadrants);
                return oldEncadrant && (
                  <div className="flex items-start gap-2">
                    <Phone className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                    <span>
                      Encadrants: <span className="font-medium">{oldEncadrant.nom}</span>
                      {oldEncadrant.numero && (
                        <span className="text-muted-foreground"> - {oldEncadrant.numero}</span>
                      )}
                    </span>
                  </div>
                );
              })()}
              
              {/* Accompagnateurs */}
              {Array.isArray(extras.contactAccompagnateur) && extras.contactAccompagnateur.length > 0 && extras.contactAccompagnateur.map((accompagnateur, index) => (
                <div key={index} className="flex items-start gap-2">
                  <Phone className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                  <span>
                    Accompagnateur {extras.contactAccompagnateur!.length > 1 ? `#${index + 1}` : ''}: <span className="font-medium">{accompagnateur.nom}</span>
                    {accompagnateur.numero && (
                      <span className="text-muted-foreground"> - {accompagnateur.numero}</span>
                    )}
                  </span>
                </div>
              ))}
              {(() => {
                const oldAccompagnateur = getContactAsObject(extras.contactAccompagnateur);
                return oldAccompagnateur && (
                  <div className="flex items-start gap-2">
                    <Phone className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                    <span>
                      Accompagnateur: <span className="font-medium">{oldAccompagnateur.nom}</span>
                      {oldAccompagnateur.numero && (
                        <span className="text-muted-foreground"> - {oldAccompagnateur.numero}</span>
                      )}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {isEditing && (
        <MatchEditor
          match={match}
          onClose={handleClose}
          onSave={handleSave}
        />
      )}
    </>
  );
});
