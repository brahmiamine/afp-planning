import html2canvas from 'html2canvas';
import { createRoot } from 'react-dom/client';
import React from 'react';
import { Match } from '@/types/match';
import { MatchExtras } from '@/hooks/useMatchExtras';
import { MatchShareImage } from '@/components/matches/MatchShareImage';
import { generateMatchShareImageSimple } from './share-match-image-simple';
import { generateMatchShareImageCanvas } from './share-match-image-canvas';

interface ShareImageOptions {
  match: Match;
  extras?: MatchExtras | null;
  localTeamLogo?: string;
  awayTeamLogo?: string;
}

/**
 * Génère une image haute résolution du match pour le partage sur les réseaux sociaux
 * Utilise la version simplifiée par défaut pour éviter les problèmes de rendu React
 */
export async function generateMatchShareImage({
  match,
  extras,
  localTeamLogo,
  awayTeamLogo,
}: ShareImageOptions): Promise<Blob> {
  // Utiliser la version Canvas directe qui évite complètement html2canvas
  try {
    return await generateMatchShareImageCanvas({
      match,
      localTeamLogo,
      awayTeamLogo,
      extras,
    });
  } catch (error) {
    console.error('Erreur avec la version Canvas, tentative avec iframe:', error);
    // Fallback vers la version iframe si Canvas échoue
    try {
      return await generateMatchShareImageSimple({
        match,
        localTeamLogo,
        awayTeamLogo,
        extras,
      });
    } catch (error2) {
      console.error('Erreur avec la version iframe, tentative avec React:', error2);
      // Dernier fallback vers React
      return generateMatchShareImageReact({
        match,
        localTeamLogo,
        awayTeamLogo,
      });
    }
  }
}

/**
 * Version avec React (fallback)
 */
async function generateMatchShareImageReact({
  match,
  localTeamLogo,
  awayTeamLogo,
}: Omit<ShareImageOptions, 'extras'>): Promise<Blob> {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  try {
    // Créer un conteneur temporaire pour l'image
    container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '1200px';
    container.style.height = '630px';
    container.style.zIndex = '9999';
    container.id = 'match-share-container';
    document.body.appendChild(container);

    // Créer une racine React et rendre le composant
    root = createRoot(container);
    root.render(
      React.createElement(MatchShareImage, {
        match,
        extras: undefined,
        localTeamLogo,
        awayTeamLogo,
      })
    );

    // Attendre que le composant soit rendu (augmenter le délai)
    await new Promise((resolve) => setTimeout(resolve, 300));

    const imageElement = document.getElementById('match-share-image');
    if (!imageElement) {
      // Attendre encore un peu et réessayer
      await new Promise((resolve) => setTimeout(resolve, 200));
      const retryElement = document.getElementById('match-share-image');
      if (!retryElement) {
        throw new Error('Le composant d\'image n\'a pas pu être rendu. Veuillez réessayer.');
      }
    }

    const finalElement = document.getElementById('match-share-image');
    if (!finalElement) {
      throw new Error('Impossible de trouver l\'élément d\'image à capturer');
    }

    // Attendre que les images se chargent
    const images = finalElement.querySelectorAll('img');
    if (images.length > 0) {
      await Promise.all(
        Array.from(images).map(
          (img) =>
            new Promise<void>((resolve) => {
              // Timeout après 5 secondes par image
              const timeout = setTimeout(() => {
                console.warn('Image loading timeout, continuing anyway');
                resolve();
              }, 5000);

              if (img.complete && img.naturalWidth > 0) {
                clearTimeout(timeout);
                resolve();
              } else {
                img.onload = () => {
                  clearTimeout(timeout);
                  resolve();
                };
                img.onerror = () => {
                  clearTimeout(timeout);
                  console.warn('Image failed to load, continuing anyway');
                  resolve(); // Continue même si l'image échoue
                };
              }
            })
        )
      );
    }

    // Attendre un peu plus pour s'assurer que tout est rendu
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Générer le canvas avec des options plus permissives
    const canvas = await html2canvas(finalElement as HTMLElement, {
      width: 1200,
      height: 630,
      scale: 2, // Haute résolution
      backgroundColor: '#1a1a1a', // Couleur de fond par défaut
      logging: false,
      useCORS: true,
      allowTaint: false, // Changer à false pour éviter les problèmes CORS
      imageTimeout: 10000,
      removeContainer: false,
      onclone: (clonedDoc) => {
        // S'assurer que les styles sont préservés dans le clone
        const clonedElement = clonedDoc.getElementById('match-share-image');
        if (clonedElement) {
          clonedElement.style.visibility = 'visible';
          clonedElement.style.opacity = '1';
        }
      },
    });

    if (!canvas) {
      throw new Error('html2canvas n\'a pas pu générer le canvas');
    }

    // Convertir en blob
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Échec de la conversion du canvas en image'));
          }
        },
        'image/png',
        1.0
      );
    });
  } catch (error) {
    console.error('Erreur détaillée lors de la génération:', error);
    throw error;
  } finally {
    // Nettoyer
    if (root) {
      try {
        root.unmount();
      } catch (e) {
        console.warn('Erreur lors du unmount:', e);
      }
    }
    if (container && document.body.contains(container)) {
      try {
        document.body.removeChild(container);
      } catch (e) {
        console.warn('Erreur lors de la suppression du conteneur:', e);
      }
    }
  }
}

/**
 * Télécharge l'image générée
 */
export function downloadMatchImage(blob: Blob, match: Match): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `match-${match.localTeam}-vs-${match.awayTeam}-${match.date.replace(/\s/g, '-')}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Partage l'image via l'API Web Share si disponible
 */
export async function shareMatchImage(blob: Blob, match: Match): Promise<void> {
  if (navigator.share && navigator.canShare) {
    const file = new File([blob], `match-${match.localTeam}-vs-${match.awayTeam}.png`, {
      type: 'image/png',
    });

    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: `Match: ${match.localTeam} vs ${match.awayTeam}`,
          text: `${match.localTeam} vs ${match.awayTeam} - ${match.date} à ${match.time}`,
          files: [file],
        });
        return;
      } catch (error) {
        // L'utilisateur a annulé ou une erreur s'est produite
        if ((error as Error).name !== 'AbortError') {
          console.error('Error sharing:', error);
        }
      }
    }
  }

  // Fallback: télécharger l'image
  downloadMatchImage(blob, match);
}
