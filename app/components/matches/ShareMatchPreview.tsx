'use client';

import { Download, Share2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Match } from '@/types/match';
import { downloadMatchImage, shareMatchImage } from '@/lib/utils/share-match-image';

interface ShareMatchPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageBlob: Blob | null;
  match: Match;
  isGenerating: boolean;
}

export function ShareMatchPreview({
  open,
  onOpenChange,
  imageBlob,
  match,
  isGenerating,
}: ShareMatchPreviewProps) {
  const handleDownload = () => {
    if (imageBlob) {
      downloadMatchImage(imageBlob, match);
    }
  };

  const handleShare = async () => {
    if (imageBlob) {
      await shareMatchImage(imageBlob, match);
    }
  };

  const imageUrl = useMemo(() => {
    if (imageBlob) {
      return URL.createObjectURL(imageBlob);
    }
    return null;
  }, [imageBlob]);

  // Nettoyer l'URL quand le composant se démonte ou que l'image change
  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Partager le match</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isGenerating ? (
            <div className="flex items-center justify-center h-[400px]">
              <div className="text-center space-y-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-sm text-muted-foreground">Génération de l'image...</p>
              </div>
            </div>
          ) : imageUrl ? (
            <>
              <div className="relative w-full bg-muted rounded-lg overflow-hidden">
                <img
                  src={imageUrl}
                  alt={`Match ${match.localTeam} vs ${match.awayTeam}`}
                  className="w-full h-auto"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={handleDownload}
                  className="flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Enregistrer
                </Button>
                <Button
                  onClick={handleShare}
                  className="flex items-center gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  Partager
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[400px]">
              <p className="text-sm text-muted-foreground">Aucune image disponible</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
