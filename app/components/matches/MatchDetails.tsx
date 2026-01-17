'use client';

import { MapPin, ExternalLink, User, Phone } from 'lucide-react';
import { memo } from 'react';
import { Match } from '@/types/match';
import { MatchExtras } from '@/hooks/useMatchExtras';

interface MatchDetailsProps {
  match: Match;
  extras?: MatchExtras | null;
}

export const MatchDetails = memo(function MatchDetails({ match, extras }: MatchDetailsProps) {
  if (!match.details && !extras) return null;

  return (
    <div className="border-t pt-4 space-y-3">
      {match.details?.stadium && (
        <div className="flex items-start gap-3">
          <MapPin className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-foreground">{match.details.stadium}</p>
            {match.details.address && (
              <p className="text-sm text-muted-foreground mt-1">{match.details.address}</p>
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
      )}

      {match.details?.terrainType && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{match.details.terrainType}</span>
        </div>
      )}

      {/* Staff du match */}
      {match.staff?.referee && (
        <div className="border-t pt-3 mt-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Staff du match</p>
          <div className="text-sm text-foreground">
            {match.staff.referee && (
              <p>
                Arbitre: <span className="font-medium">{match.staff.referee}</span>
              </p>
            )}
            {match.staff.assistant2 && (
              <p className="mt-1">
                Assistant 2: <span className="font-medium">{match.staff.assistant2}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Informations supplémentaires (extras) */}
      {extras && (extras.arbitreTouche || extras.contactEncadrants?.nom || extras.contactAccompagnateur?.nom) && (
        <div className="border-t pt-3 mt-3 bg-muted rounded-lg p-3">
          <p className="text-xs font-semibold text-foreground mb-2">Informations supplémentaires</p>
          <div className="text-sm text-foreground space-y-1.5">
            {extras.arbitreTouche && (
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span>
                  Arbitre de touche: <span className="font-medium">{extras.arbitreTouche}</span>
                </span>
              </div>
            )}
            {extras.contactEncadrants?.nom && (
              <div className="flex items-start gap-2">
                <Phone className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span>
                  Encadrants: <span className="font-medium">{extras.contactEncadrants.nom}</span>
                  {extras.contactEncadrants.numero && (
                    <span className="text-muted-foreground"> - {extras.contactEncadrants.numero}</span>
                  )}
                </span>
              </div>
            )}
            {extras.contactAccompagnateur?.nom && (
              <div className="flex items-start gap-2">
                <Phone className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span>
                  Accompagnateur: <span className="font-medium">{extras.contactAccompagnateur.nom}</span>
                  {extras.contactAccompagnateur.numero && (
                    <span className="text-muted-foreground"> - {extras.contactAccompagnateur.numero}</span>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
