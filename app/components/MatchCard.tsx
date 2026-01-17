'use client';

import { Match } from '@/types/match';
import { MapPin, Clock, Users, Trophy, Calendar, ExternalLink, Edit, User, Phone } from 'lucide-react';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import MatchEditor from './MatchEditor';

interface MatchExtras {
  id: string;
  arbitreTouche?: string;
  contactEncadrants?: {
    nom: string;
    numero: string;
  };
  contactAccompagnateur?: {
    nom: string;
    numero: string;
  };
}

interface MatchCardProps {
  match: Match;
  onMatchUpdate?: () => void;
}

export default function MatchCard({ match, onMatchUpdate }: MatchCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [extras, setExtras] = useState<MatchExtras | null>(null);
  const [loadingExtras, setLoadingExtras] = useState(false);

  // Charger les informations supplémentaires
  useEffect(() => {
    const loadExtras = async () => {
      if (!match.id) return;
      
      try {
        setLoadingExtras(true);
        const response = await fetch(`/api/matches/${match.id}`);
        if (response.ok) {
          const data = await response.json();
          if (data) {
            setExtras(data);
          }
        }
      } catch (error) {
        console.error('Erreur lors du chargement des extras:', error);
      } finally {
        setLoadingExtras(false);
      }
    };

    loadExtras();
  }, [match.id]);

  // Recharger les extras après mise à jour
  const handleSave = () => {
    setIsEditing(false);
    // Recharger les extras
    if (match.id) {
      fetch(`/api/matches/${match.id}`)
        .then(res => res.json())
        .then(data => data && setExtras(data))
        .catch(err => console.error('Erreur:', err));
    }
    if (onMatchUpdate) {
      onMatchUpdate();
    }
  };
  
  const venueColor = match.venue === 'domicile' 
    ? 'bg-green-100 text-green-800 border-green-300' 
    : 'bg-orange-100 text-orange-800 border-orange-300';

  return (
    <>
      <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden border border-gray-200 relative">
        {/* Header avec date et compétition */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 relative">
          {/* Bouton d'édition dans le header */}
          <button
            onClick={() => setIsEditing(true)}
            className="absolute top-2 right-2 p-1.5 bg-white/20 hover:bg-white/30 rounded-full transition-colors z-10 backdrop-blur-sm"
            title="Modifier le match"
          >
            <Edit className="w-4 h-4 text-white" />
          </button>
          
          <div className="flex items-center justify-between mb-2 pr-10">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              <span className="font-semibold">{match.date}</span>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${venueColor}`}>
              {match.venue === 'domicile' ? '🏠 Domicile' : '✈️ Extérieur'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            <span className="text-sm opacity-90">{match.competition}</span>
          </div>
        </div>

      {/* Corps de la carte */}
      <div className="p-6">
        {/* Équipes */}
        <div className="flex items-center justify-between mb-6">
          {/* Équipe locale */}
          <div className="flex-1 text-center">
            <div className="flex justify-center mb-3">
              {match.localTeamLogo ? (
                <Image 
                  src={match.localTeamLogo} 
                  alt={match.localTeam}
                  width={64}
                  height={64}
                  className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                  unoptimized
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                  <Users className="w-8 h-8 text-gray-400" />
                </div>
              )}
            </div>
            <p className="font-semibold text-gray-800 text-sm">{match.localTeam}</p>
          </div>

          {/* VS */}
          <div className="px-4">
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-gray-400">VS</span>
              <div className="mt-2 text-center">
                <div className="flex items-center gap-2 text-blue-600">
                  <Clock className="w-4 h-4" />
                  <span className="font-bold text-lg">{match.time}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  RDV: {match.horaireRendezVous}
                </div>
              </div>
            </div>
          </div>

          {/* Équipe adverse */}
          <div className="flex-1 text-center">
            <div className="flex justify-center mb-3">
              {match.awayTeamLogo ? (
                <Image 
                  src={match.awayTeamLogo} 
                  alt={match.awayTeam}
                  width={64}
                  height={64}
                  className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                  unoptimized
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                  <Users className="w-8 h-8 text-gray-400" />
                </div>
              )}
            </div>
            <p className="font-semibold text-gray-800 text-sm">{match.awayTeam}</p>
          </div>
        </div>

        {/* Détails du match */}
        {match.details && (
          <div className="border-t pt-4 space-y-3">
            {match.details.stadium && (
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
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

            {match.details.terrainType && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">{match.details.terrainType}</span>
              </div>
            )}

            {/* Staff du match */}
            {match.staff && match.staff.referee && (
              <div className="border-t pt-3 mt-3">
                <p className="text-xs font-semibold text-gray-500 mb-2">Staff du match</p>
                <div className="text-sm text-gray-600">
                  {match.staff.referee && (
                    <p>Arbitre: <span className="font-medium">{match.staff.referee}</span></p>
                  )}
                  {match.staff.assistant2 && (
                    <p className="mt-1">Assistant 2: <span className="font-medium">{match.staff.assistant2}</span></p>
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
                      <User className="w-3.5 h-3.5 text-blue-600" />
                      <span>Arbitre de touche: <span className="font-medium">{extras.arbitreTouche}</span></span>
                    </div>
                  )}
                  {extras.contactEncadrants?.nom && (
                    <div className="flex items-start gap-2">
                      <Phone className="w-3.5 h-3.5 text-blue-600 mt-0.5" />
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
                      <Phone className="w-3.5 h-3.5 text-blue-600 mt-0.5" />
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
        )}

        {/* Lien vers le match */}
        {match.url && (
          <div className="mt-4 pt-4 border-t">
            <a 
              href={match.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 text-sm inline-flex items-center gap-1"
            >
              <ExternalLink className="w-4 h-4" />
              Voir les détails complets
            </a>
          </div>
        )}
      </div>
    </div>
    
    {/* Éditeur de match */}
    {isEditing && (
      <MatchEditor
        match={match}
        onClose={() => setIsEditing(false)}
        onSave={handleSave}
      />
    )}
    </>
  );
}
