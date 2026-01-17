'use client';

import { useState, memo, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { apiPost } from '@/lib/utils/api';
import { Button } from '@/components/ui/button';

interface ScraperButtonProps {
  onScrapeComplete: () => void;
}

export const ScraperButton = memo(function ScraperButton({ onScrapeComplete }: ScraperButtonProps) {
  const [isScraping, setIsScraping] = useState(false);

  const handleScrape = useCallback(async () => {
    setIsScraping(true);

    try {
      await apiPost('/api/scraper');
      toast.success('Actualisation réussie', {
        description: 'Les matchs ont été mis à jour avec succès.',
      });
      setTimeout(() => {
        onScrapeComplete();
      }, 1000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toast.error('Erreur lors de l\'actualisation', {
        description: errorMessage,
      });
    } finally {
      setIsScraping(false);
    }
  }, [onScrapeComplete]);

  return (
    <Button
      onClick={handleScrape}
      disabled={isScraping}
      size="sm"
      className="transition-all duration-300 transform hover:scale-105 w-full sm:w-auto text-xs sm:text-sm h-9 sm:h-10 px-3 sm:px-6"
    >
      {isScraping ? (
        <>
          <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
          <span className="hidden sm:inline">Actualisation en cours...</span>
          <span className="sm:hidden">Actualisation...</span>
        </>
      ) : (
        <>
          <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>Actualiser</span>
        </>
      )}
    </Button>
  );
});
