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
          <MapPin className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-gray-700">{match.details.stadium}</p>
            {match.details.address && (
              <p className="text-sm text-gray-600 mt-1">{match.details.address}</p>
            )}
            {match.details.itineraryLink && (
              <a
                href={match.details.itineraryLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 text-xs mt-1 inline-flex items-center gap-1"
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
          <span className="text-sm text-gray-600">{match.details.terrainType}</span>
        </div>
      )}

      {/* Staff du match */}
      {match.staff?.referee && (
        <div className="border-t pt-3 mt-3">
          <p className="text-xs font-semibold text-gray-500 mb-2">Staff du match</p>
          <div className="text-sm text-gray-600">
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
        <div className="border-t pt-3 mt-3 bg-blue-50 rounded-lg p-3">
          <p className="text-xs font-semibold text-blue-700 mb-2">Informations supplémentaires</p>
          <div className="text-sm text-gray-700 space-y-1.5">
            {extras.arbitreTouche && (
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                <span>
                  Arbitre de touche: <span className="font-medium">{extras.arbitreTouche}</span>
                </span>
              </div>
            )}
            {extras.contactEncadrants?.nom && (
              <div className="flex items-start gap-2">
                <Phone className="w-3.5 h-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
                <span>
                  Encadrants: <span className="font-medium">{extras.contactEncadrants.nom}</span>
                  {extras.contactEncadrants.numero && (
                    <span className="text-gray-600"> - {extras.contactEncadrants.numero}</span>
                  )}
                </span>
              </div>
            )}
            {extras.contactAccompagnateur?.nom && (
              <div className="flex items-start gap-2">
                <Phone className="w-3.5 h-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
                <span>
                  Accompagnateur: <span className="font-medium">{extras.contactAccompagnateur.nom}</span>
                  {extras.contactAccompagnateur.numero && (
                    <span className="text-gray-600"> - {extras.contactAccompagnateur.numero}</span>
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
