'use client';

import { useState, memo, useCallback } from 'react';
import { RefreshCw, Play } from 'lucide-react';
import { apiPost } from '@/lib/utils/api';

interface ScraperButtonProps {
  onScrapeComplete: () => void;
}

export const ScraperButton = memo(function ScraperButton({ onScrapeComplete }: ScraperButtonProps) {
  const [isScraping, setIsScraping] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleScrape = useCallback(async () => {
    setIsScraping(true);
    setMessage(null);

    try {
      await apiPost('/api/scraper');
      setMessage('✅ Scraping terminé avec succès !');
      setTimeout(() => {
        onScrapeComplete();
        setMessage(null);
      }, 2000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      setMessage(`❌ Erreur: ${errorMessage}`);
    } finally {
      setIsScraping(false);
    }
  }, [onScrapeComplete]);

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={handleScrape}
        disabled={isScraping}
        className={`
          flex items-center gap-3 px-6 py-3 rounded-lg font-semibold text-white
          transition-all duration-300 transform hover:scale-105
          ${isScraping
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg hover:shadow-xl'
          }
        `}
      >
        {isScraping ? (
          <>
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Scraping en cours...</span>
          </>
        ) : (
          <>
            <Play className="w-5 h-5" />
            <span>Lancer le scraping</span>
          </>
        )}
      </button>
      {message && (
        <p className={`text-sm font-medium ${message.startsWith('✅') ? 'text-green-600' : 'text-red-600'}`}>
          {message}
        </p>
      )}
    </div>
  );
});
