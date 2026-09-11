'use client';

import { useState, memo, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { apiPost } from '@/lib/utils/api';
import { Button } from '@/components/ui/button';
import { TOOLBAR_ACTION_BUTTON_CLASS, TOOLBAR_ACTION_BUTTON_STYLE, TOOLBAR_ACTION_WRAP_CLASS } from '@/app/components/ui/toolbar-action-button-styles';

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
    <div className={TOOLBAR_ACTION_WRAP_CLASS}>
      <Button
        onClick={handleScrape}
        disabled={isScraping}
        variant="outline"
        size="sm"
        className={TOOLBAR_ACTION_BUTTON_CLASS}
        style={TOOLBAR_ACTION_BUTTON_STYLE}
      >
        <RefreshCw className={`h-4 w-4 shrink-0 ${isScraping ? 'animate-spin' : ''}`} />
        <span>{isScraping ? 'Actualisation...' : 'Actualiser'}</span>
      </Button>
    </div>
  );
});
