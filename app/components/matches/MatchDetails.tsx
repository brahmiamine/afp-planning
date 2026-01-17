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
  // Toujours afficher les détails s'il y a des informations à montrer
  const hasDetails = match.details || match.staff || extras || match.type;
  if (!hasDetails) return null;

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

  return (
    <div className="border-t pt-3 sm:pt-4 space-y-2 sm:space-y-3">
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
      {(match.staff?.referee || match.staff?.assistant1 || match.staff?.assistant2) && (
        <div className="border-t pt-3 mt-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Staff du match</p>
          <div className="text-sm text-foreground space-y-1">
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
        <div className="border-t pt-3 mt-3 bg-muted rounded-lg p-3">
          <p className="text-xs font-semibold text-foreground mb-2">Informations supplémentaires</p>
          <div className="text-sm text-foreground space-y-1.5">
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
      
      {/* Type de match */}
      {match.type && (
        <div className="border-t pt-3 mt-3">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Type de match</p>
          <p className="text-sm text-foreground capitalize">{match.type}</p>
        </div>
      )}
    </div>
  );
});
