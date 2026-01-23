'use client';

import { Share2, Loader2 } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { Match } from '@/types/match';
import { MatchExtras } from '@/hooks/useMatchExtras';
import { Button } from '@/components/ui/button';
import { generateMatchShareImage } from '@/lib/utils/share-match-image';
import { useClubs } from '@/hooks/useClubs';
import { toast } from 'sonner';
import { ShareMatchPreview } from './ShareMatchPreview';

interface ShareMatchButtonProps {
  match: Match;
  extras?: MatchExtras | null;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function ShareMatchButton({
  match,
  extras,
  variant = 'ghost',
  size = 'icon',
  className,
}: ShareMatchButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const { clubs } = useClubs();

  // Récupérer les logos depuis la liste des clubs si non définis dans le match
  const localTeamLogo = match.localTeamLogo || clubs.find(c => c.nom === match.localTeam)?.logo;
  const awayTeamLogo = match.awayTeamLogo || clubs.find(c => c.nom === match.awayTeam)?.logo;

  // Nettoyer l'URL de l'image quand le composant se démonte ou que l'image change
  useEffect(() => {
    return () => {
      if (imageBlob) {
        // L'URL sera révoquée automatiquement quand le blob change
      }
    };
  }, [imageBlob]);

  const handleShare = useCallback(async () => {
    setIsGenerating(true);
    setIsPreviewOpen(true);
    setImageBlob(null);
    
    try {
      const blob = await generateMatchShareImage({
        match,
        extras,
        localTeamLogo,
        awayTeamLogo,
      });

      setImageBlob(blob);
      toast.success('Image générée avec succès !');
    } catch (error) {
      console.error('Error generating share image:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toast.error(`Erreur lors de la génération de l'image: ${errorMessage}`);
      setIsPreviewOpen(false);
    } finally {
      setIsGenerating(false);
    }
  }, [match, extras, localTeamLogo, awayTeamLogo]);

  return (
    <>
      <Button
        onClick={handleShare}
        variant={variant}
        size={size}
        className={className}
        disabled={isGenerating}
        title="Partager le match"
        aria-label="Partager le match"
      >
        {isGenerating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Share2 className="w-4 h-4" />
        )}
      </Button>
      <ShareMatchPreview
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        imageBlob={imageBlob}
        match={match}
        isGenerating={isGenerating}
      />
    </>
  );
}
