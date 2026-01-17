'use client';

import { useState, useEffect } from 'react';
import MatchList from './components/MatchList';
import ScraperButton from './components/ScraperButton';
import { MatchesData } from '@/types/match';
import { Calendar, Loader2 } from 'lucide-react';
import Image from 'next/image';

export default function Home() {
  const [matchesData, setMatchesData] = useState<MatchesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMatches();
  }, []);

  const loadMatches = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/matches');
      
      if (response.ok) {
        const data = await response.json();
        setMatchesData(data);
      } else {
        setError('Impossible de charger les matchs');
      }
    } catch (err) {
      setError('Erreur lors du chargement des matchs');
      console.error('Error loading matches:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-lg border-b border-gray-200">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              {matchesData?.club.logo && (
                <Image 
                  src={matchesData.club.logo} 
                  alt={matchesData.club.name}
                  width={64}
                  height={64}
                  className="w-16 h-16 rounded-full object-cover border-2 border-indigo-200"
                  unoptimized
                />
              )}
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  {matchesData?.club.name || 'Academie Football Paris 18'}
                </h1>
                <p className="text-gray-600 mt-1">
                  {matchesData?.club.description || 'Club de Football à Paris 18'}
                </p>
              </div>
            </div>
            <ScraperButton onScrapeComplete={loadMatches} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
            <p className="text-gray-600 text-lg">Chargement des matchs...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-600 text-lg font-medium">{error}</p>
            <button
              onClick={loadMatches}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Réessayer
            </button>
          </div>
        ) : matchesData && matchesData.matches ? (
          <>
            {/* Stats */}
            <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
                <div className="flex items-center gap-3">
                  <Calendar className="w-8 h-8 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {Object.keys(matchesData.matches).length}
                    </p>
                    <p className="text-sm text-gray-600">Dates</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
                <div className="flex items-center gap-3">
                  <div className="text-2xl font-bold text-gray-900">
                    {Object.values(matchesData.matches).reduce((acc, matches) => acc + matches.length, 0)}
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Matchs au total</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-purple-500">
                <div className="flex items-center gap-3">
                  <div className="text-2xl font-bold text-gray-900">
                    {matchesData.matches[Object.keys(matchesData.matches)[0]]?.length || 0}
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Prochain match</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Matches List */}
            <MatchList matches={matchesData.matches} />

            {/* Footer info */}
            {matchesData.scrapedAt && (
              <div className="mt-8 text-center text-sm text-gray-500">
                Dernière mise à jour: {new Date(matchesData.scrapedAt).toLocaleString('fr-FR')}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20">
            <p className="text-gray-600 text-lg mb-4">Aucun match disponible</p>
            <p className="text-gray-500 text-sm">Lancez le scraping pour extraire les matchs</p>
          </div>
        )}
      </main>
    </div>
  );
}
