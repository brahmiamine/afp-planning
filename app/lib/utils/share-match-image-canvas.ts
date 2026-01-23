import { Match } from '@/types/match';
import { MatchExtras } from '@/hooks/useMatchExtras';

interface ShareImageOptions {
  match: Match;
  localTeamLogo?: string;
  awayTeamLogo?: string;
  extras?: MatchExtras | null;
}

/**
 * Génère une image haute résolution du match en utilisant Canvas API directement
 * pour éviter les problèmes avec html2canvas et les fonctions CSS modernes
 */
export async function generateMatchShareImageCanvas({
  match,
  localTeamLogo,
  awayTeamLogo,
  extras,
}: ShareImageOptions): Promise<Blob> {
  // Augmenter la hauteur pour afficher toutes les informations
  const width = 1200;
  const baseHeight = 630;
  // Calculer la hauteur nécessaire en fonction des informations disponibles
  let additionalHeight = 0;
  if (match.details?.address) additionalHeight += 30;
  if (match.details?.terrainType) additionalHeight += 30;
  if (match.staff?.assistant1 || match.staff?.assistant2) additionalHeight += 60;
  if (extras) {
    const hasArbitreTouche = Array.isArray(extras.arbitreTouche) ? extras.arbitreTouche.length > 0 : !!extras.arbitreTouche;
    const hasEncadrants = Array.isArray(extras.contactEncadrants) ? extras.contactEncadrants.length > 0 : !!extras.contactEncadrants;
    const hasAccompagnateur = Array.isArray(extras.contactAccompagnateur) ? extras.contactAccompagnateur.length > 0 : !!extras.contactAccompagnateur;
    if (hasArbitreTouche) additionalHeight += 40;
    if (hasEncadrants) additionalHeight += 40;
    if (hasAccompagnateur) additionalHeight += 40;
  }
  // Ajouter une marge supplémentaire en bas après les dernières informations
  const marginBottomPx = 40; // Marge en bas après accompagnateur et type de terrain (en pixels)
  const height = baseHeight + additionalHeight + marginBottomPx;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Impossible de créer le contexte canvas');
  }

  // Activer l'anti-aliasing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Fond avec gradient
  const gradient = ctx.createLinearGradient(0, 0, width * scale, height * scale);
  gradient.addColorStop(0, 'rgb(26, 26, 26)');
  gradient.addColorStop(0.5, 'rgb(45, 45, 45)');
  gradient.addColorStop(1, 'rgb(26, 26, 26)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width * scale, height * scale);

  // Gradient overlay radial
  const radialGradient = ctx.createRadialGradient(
    (width * scale * 0.3),
    (height * scale * 0.5),
    0,
    (width * scale * 0.3),
    (height * scale * 0.5),
    width * scale
  );
  radialGradient.addColorStop(0, 'rgba(59, 130, 246, 0.1)');
  radialGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = radialGradient;
  ctx.fillRect(0, 0, width * scale, height * scale);

  const padding = 50 * scale;
  const paddingBottom = 60 * scale; // Augmenté pour plus d'espace en bas
  const fontSize = (size: number) => size * scale;
  
  // Fonction pour tronquer le texte si trop long
  const truncateText = (text: string, maxWidth: number, fontSize: number): string => {
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
    const metrics = ctx.measureText(text);
    if (metrics.width <= maxWidth) {
      return text;
    }
    let truncated = text;
    while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + '...';
  };

  // Fonction pour charger une image
  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  };

  // Charger les logos
  let localLogoImg: HTMLImageElement | null = null;
  let awayLogoImg: HTMLImageElement | null = null;

  try {
    if (localTeamLogo) {
      localLogoImg = await loadImage(localTeamLogo);
    }
  } catch (e) {
    console.warn('Failed to load local team logo:', e);
  }

  try {
    if (awayTeamLogo) {
      awayLogoImg = await loadImage(awayTeamLogo);
    }
  } catch (e) {
    console.warn('Failed to load away team logo:', e);
  }

  // Fonction pour dessiner un rectangle arrondi
  const roundRect = (x: number, y: number, width: number, height: number, radius: number) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  // Fonction pour dessiner du texte avec ombre
  const drawText = (
    text: string,
    x: number,
    y: number,
    fontSize: number,
    color: string = 'rgb(255, 255, 255)',
    align: CanvasTextAlign = 'left',
    bold: boolean = false
  ) => {
    ctx.save();
    ctx.font = `${bold ? 'bold ' : ''}${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  // Header - Date
  const headerY = padding;
  drawText('DATE', padding, headerY, fontSize(12), 'rgb(156, 163, 175)', 'left', false);
  drawText(match.date, padding, headerY + fontSize(14), fontSize(24), 'rgb(255, 255, 255)', 'left', true);

  // Barre bleue à côté de la date
  ctx.fillStyle = 'rgb(59, 130, 246)';
  ctx.fillRect(padding - fontSize(10), headerY, fontSize(4), fontSize(35));

  // Type de match
  if (match.type) {
    const typeX = padding + fontSize(200);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    const typeText = match.type.toUpperCase();
    ctx.font = `bold ${fontSize(11)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
    const typeWidth = ctx.measureText(typeText).width + fontSize(16);
    roundRect(typeX, headerY + fontSize(2), typeWidth, fontSize(28), fontSize(8));
    ctx.fill();
    drawText(typeText, typeX + fontSize(8), headerY + fontSize(8), fontSize(11), 'rgb(255, 255, 255)', 'left', true);
  }

  // Badge venue - mieux affiché
  const venueEmoji = match.venue === 'domicile' ? '🏠' : '✈️';
  const venueText = match.venue === 'domicile' ? 'Domicile' : 'Extérieur';
  const venueX = width * scale - padding;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  const venueTextWidth = ctx.measureText(venueText).width;
  const venueWidth = venueTextWidth + fontSize(50); // Espace pour emoji + padding
  roundRect(venueX - venueWidth, headerY + fontSize(2), venueWidth, fontSize(28), fontSize(8));
  ctx.fill();
  // Emoji
  drawText(venueEmoji, venueX - venueWidth + fontSize(8), headerY + fontSize(6), fontSize(16), 'rgb(255, 255, 255)', 'left', false);
  // Texte
  drawText(venueText, venueX - fontSize(8), headerY + fontSize(8), fontSize(12), 'rgb(255, 255, 255)', 'right', true);

  // Compétition
  const competitionY = headerY + fontSize(45);
  ctx.font = `bold ${fontSize(16)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'left';
  const competitionWidth = ctx.measureText(match.competition).width;
  drawText(match.competition, padding, competitionY, fontSize(16), 'rgb(255, 255, 255)', 'left', true);
  if (match.categorie) {
    ctx.font = `${fontSize(11)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
    const categorieTextWidth = ctx.measureText(match.categorie).width;
    const categorieWidth = categorieTextWidth + fontSize(20);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
    roundRect(padding + competitionWidth + fontSize(12), competitionY, categorieWidth, fontSize(20), fontSize(6));
    ctx.fill();
    drawText(match.categorie, padding + competitionWidth + fontSize(22), competitionY + fontSize(2), fontSize(11), 'rgb(96, 165, 250)', 'left', false);
  }

  // Équipes - Réduire l'espace vertical
  const teamsY = height * scale * 0.48; // Plus proche du centre
  const logoSize = fontSize(110); // Légèrement plus petit pour réduire l'espace
  const logoRadius = logoSize / 2;

  // Équipe locale - Logo plus grand et complet (sans clipping circulaire)
  const localTeamX = padding;
  const localLogoY = teamsY - logoSize - fontSize(12); // Réduire l'espace
  if (localLogoImg) {
    // Dessiner le logo dans un carré arrondi au lieu d'un cercle pour qu'il soit complet
    ctx.save();
    // Fond carré arrondi
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    roundRect(localTeamX, localLogoY, logoSize, logoSize, fontSize(14));
    ctx.fill();
    // Dessiner le logo avec padding pour qu'il soit visible en entier
    const logoPadding = fontSize(8);
    ctx.save();
    roundRect(localTeamX + logoPadding, localLogoY + logoPadding, logoSize - logoPadding * 2, logoSize - logoPadding * 2, fontSize(6));
    ctx.clip();
    ctx.drawImage(
      localLogoImg,
      localTeamX + logoPadding,
      localLogoY + logoPadding,
      logoSize - logoPadding * 2,
      logoSize - logoPadding * 2
    );
    ctx.restore();
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.arc(localTeamX + logoRadius, localLogoY + logoRadius, logoRadius, 0, Math.PI * 2);
    ctx.fill();
    drawText(
      match.localTeam.charAt(0).toUpperCase(),
      localTeamX + logoRadius,
      localLogoY + logoRadius / 2,
      fontSize(44),
      'rgb(255, 255, 255)',
      'center',
      true
    );
  }
  // Nom du club - responsive avec troncature si nécessaire
  const localTeamNameY = teamsY + fontSize(12); // Réduire l'espace
  const maxLocalTeamWidth = (width * scale / 2 - padding - fontSize(20));
  const localTeamName = truncateText(match.localTeam, maxLocalTeamWidth, fontSize(28));
  drawText(localTeamName, localTeamX, localTeamNameY, fontSize(28), 'rgb(255, 255, 255)', 'left', true);

  // VS
  const vsX = width * scale / 2;
  drawText('VS', vsX, teamsY - fontSize(50), fontSize(42), 'rgb(59, 130, 246)', 'center', true);
  
  // Time box
  const timeBoxY = teamsY + fontSize(12);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  const timeBoxWidth = fontSize(110);
  roundRect(vsX - timeBoxWidth / 2, timeBoxY, timeBoxWidth, fontSize(50), fontSize(10));
  ctx.fill();
  drawText(match.time, vsX, timeBoxY + fontSize(6), fontSize(20), 'rgb(255, 255, 255)', 'center', true);
  drawText(`RDV: ${match.horaireRendezVous}`, vsX, timeBoxY + fontSize(30), fontSize(11), 'rgb(156, 163, 175)', 'center', false);

  // Équipe adverse - Logo plus grand et complet (sans clipping circulaire)
  const awayTeamX = width * scale - padding;
  const awayLogoY = teamsY - logoSize - fontSize(12); // Réduire l'espace
  if (awayLogoImg) {
    // Dessiner le logo dans un carré arrondi au lieu d'un cercle pour qu'il soit complet
    ctx.save();
    // Fond carré arrondi
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    roundRect(awayTeamX - logoSize, awayLogoY, logoSize, logoSize, fontSize(14));
    ctx.fill();
    // Dessiner le logo avec padding pour qu'il soit visible en entier
    const logoPadding = fontSize(8);
    ctx.save();
    roundRect(awayTeamX - logoSize + logoPadding, awayLogoY + logoPadding, logoSize - logoPadding * 2, logoSize - logoPadding * 2, fontSize(6));
    ctx.clip();
    ctx.drawImage(
      awayLogoImg,
      awayTeamX - logoSize + logoPadding,
      awayLogoY + logoPadding,
      logoSize - logoPadding * 2,
      logoSize - logoPadding * 2
    );
    ctx.restore();
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.arc(awayTeamX - logoRadius, awayLogoY + logoRadius, logoRadius, 0, Math.PI * 2);
    ctx.fill();
    drawText(
      match.awayTeam.charAt(0).toUpperCase(),
      awayTeamX - logoRadius,
      awayLogoY + logoRadius / 2,
      fontSize(44),
      'rgb(255, 255, 255)',
      'center',
      true
    );
  }
  // Nom du club - responsive avec troncature si nécessaire
  const awayTeamNameY = teamsY + fontSize(12); // Réduire l'espace
  const maxAwayTeamWidth = (width * scale / 2 - padding - fontSize(20));
  const awayTeamName = truncateText(match.awayTeam, maxAwayTeamWidth, fontSize(28));
  ctx.font = `bold ${fontSize(28)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'right';
  drawText(awayTeamName, awayTeamX, awayTeamNameY, fontSize(28), 'rgb(255, 255, 255)', 'right', true);

  // Footer - Toutes les informations avec padding bottom et marge supplémentaire
  const footerY = height * scale - paddingBottom - fontSize(50) - (marginBottomPx * scale);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, footerY);
  ctx.lineTo(width * scale - padding, footerY);
  ctx.stroke();

  let currentY = footerY + fontSize(12);
  const columnWidth = (width * scale - padding * 2) / 3;
  let column = 0;

  // Colonne 1: Stade et détails
  if (match.details?.stadium) {
    drawText('STADE', padding + column * columnWidth, currentY, fontSize(10), 'rgb(156, 163, 175)', 'left', false);
    drawText(match.details.stadium, padding + column * columnWidth, currentY + fontSize(14), fontSize(14), 'rgb(255, 255, 255)', 'left', true);
    currentY += fontSize(32);
    if (match.details.address) {
      const maxAddressWidth = columnWidth - fontSize(10);
      const address = truncateText(match.details.address, maxAddressWidth, fontSize(11));
      drawText(address, padding + column * columnWidth, currentY, fontSize(11), 'rgb(156, 163, 175)', 'left', false);
      currentY += fontSize(24);
    }
    if (match.details.terrainType) {
      drawText(`Type: ${match.details.terrainType}`, padding + column * columnWidth, currentY, fontSize(11), 'rgb(156, 163, 175)', 'left', false);
      currentY += fontSize(24);
    }
  }

  // Colonne 2: Staff du match
  column = 1;
  currentY = footerY + fontSize(12);
  if (match.staff?.referee) {
    drawText('ARBITRE', padding + column * columnWidth, currentY, fontSize(10), 'rgb(156, 163, 175)', 'left', false);
    drawText(match.staff.referee, padding + column * columnWidth, currentY + fontSize(14), fontSize(14), 'rgb(255, 255, 255)', 'left', true);
    currentY += fontSize(32);
  }
  if (match.staff?.assistant1) {
    drawText('ASSISTANT 1', padding + column * columnWidth, currentY, fontSize(10), 'rgb(156, 163, 175)', 'left', false);
    drawText(match.staff.assistant1, padding + column * columnWidth, currentY + fontSize(14), fontSize(12), 'rgb(255, 255, 255)', 'left', true);
    currentY += fontSize(28);
  }
  if (match.staff?.assistant2) {
    drawText('ASSISTANT 2', padding + column * columnWidth, currentY, fontSize(10), 'rgb(156, 163, 175)', 'left', false);
    drawText(match.staff.assistant2, padding + column * columnWidth, currentY + fontSize(14), fontSize(12), 'rgb(255, 255, 255)', 'left', true);
    currentY += fontSize(28);
  }

  // Colonne 3: Informations supplémentaires (extras)
  if (extras) {
    column = 2;
    currentY = footerY + fontSize(12);
    
    // Helper pour vérifier si un contact est un objet avec nom
    const hasContactData = (contact: any): boolean => {
      if (Array.isArray(contact)) return contact.length > 0;
      if (contact && typeof contact === 'object' && 'nom' in contact) return !!contact.nom;
      return false;
    };

    // Helper pour obtenir un contact comme objet
    const getContactAsObject = (contact: any): { nom: string; numero?: string } | null => {
      if (!contact) return null;
      if (Array.isArray(contact)) return null;
      if (contact && typeof contact === 'object' && 'nom' in contact) {
        return contact as { nom: string; numero?: string };
      }
      return null;
    };

    // Arbitres AFP
    if (hasContactData(extras.arbitreTouche)) {
      if (Array.isArray(extras.arbitreTouche)) {
        extras.arbitreTouche.forEach((arbitre, index) => {
          drawText(
            `ARBITRE AFP${extras.arbitreTouche!.length > 1 ? ` #${index + 1}` : ''}`,
            padding + column * columnWidth,
            currentY,
            fontSize(10),
            'rgb(156, 163, 175)',
            'left',
            false
          );
          const text = arbitre.numero ? `${arbitre.nom} - ${arbitre.numero}` : arbitre.nom;
          const maxTextWidth = columnWidth - fontSize(10);
          const truncatedText = truncateText(text, maxTextWidth, fontSize(12));
          drawText(
            truncatedText,
            padding + column * columnWidth,
            currentY + fontSize(14),
            fontSize(12),
            'rgb(255, 255, 255)',
            'left',
            true
          );
          currentY += fontSize(28);
        });
      } else {
        const oldArbitre = getContactAsObject(extras.arbitreTouche);
        if (oldArbitre) {
          drawText('ARBITRE AFP', padding + column * columnWidth, currentY, fontSize(10), 'rgb(156, 163, 175)', 'left', false);
          const text = oldArbitre.numero ? `${oldArbitre.nom} - ${oldArbitre.numero}` : oldArbitre.nom;
          const maxTextWidth = columnWidth - fontSize(10);
          const truncatedText = truncateText(text, maxTextWidth, fontSize(12));
          drawText(truncatedText, padding + column * columnWidth, currentY + fontSize(14), fontSize(12), 'rgb(255, 255, 255)', 'left', true);
          currentY += fontSize(28);
        }
      }
    }

    // Encadrants
    if (hasContactData(extras.contactEncadrants)) {
      if (Array.isArray(extras.contactEncadrants)) {
        extras.contactEncadrants.forEach((encadrant, index) => {
          drawText(
            `ENCADRANT${extras.contactEncadrants!.length > 1 ? ` #${index + 1}` : ''}`,
            padding + column * columnWidth,
            currentY,
            fontSize(10),
            'rgb(156, 163, 175)',
            'left',
            false
          );
          const text = encadrant.numero ? `${encadrant.nom} - ${encadrant.numero}` : encadrant.nom;
          const maxTextWidth = columnWidth - fontSize(10);
          const truncatedText = truncateText(text, maxTextWidth, fontSize(12));
          drawText(
            truncatedText,
            padding + column * columnWidth,
            currentY + fontSize(14),
            fontSize(12),
            'rgb(255, 255, 255)',
            'left',
            true
          );
          currentY += fontSize(28);
        });
      } else {
        const oldEncadrant = getContactAsObject(extras.contactEncadrants);
        if (oldEncadrant) {
          drawText('ENCADRANTS', padding + column * columnWidth, currentY, fontSize(10), 'rgb(156, 163, 175)', 'left', false);
          const text = oldEncadrant.numero ? `${oldEncadrant.nom} - ${oldEncadrant.numero}` : oldEncadrant.nom;
          const maxTextWidth = columnWidth - fontSize(10);
          const truncatedText = truncateText(text, maxTextWidth, fontSize(12));
          drawText(truncatedText, padding + column * columnWidth, currentY + fontSize(14), fontSize(12), 'rgb(255, 255, 255)', 'left', true);
          currentY += fontSize(28);
        }
      }
    }

    // Accompagnateurs
    if (hasContactData(extras.contactAccompagnateur)) {
      if (Array.isArray(extras.contactAccompagnateur)) {
        extras.contactAccompagnateur.forEach((accompagnateur, index) => {
          drawText(
            `ACCOMPAGNATEUR${extras.contactAccompagnateur!.length > 1 ? ` #${index + 1}` : ''}`,
            padding + column * columnWidth,
            currentY,
            fontSize(10),
            'rgb(156, 163, 175)',
            'left',
            false
          );
          const text = accompagnateur.numero ? `${accompagnateur.nom} - ${accompagnateur.numero}` : accompagnateur.nom;
          const maxTextWidth = columnWidth - fontSize(10);
          const truncatedText = truncateText(text, maxTextWidth, fontSize(12));
          drawText(
            truncatedText,
            padding + column * columnWidth,
            currentY + fontSize(14),
            fontSize(12),
            'rgb(255, 255, 255)',
            'left',
            true
          );
          currentY += fontSize(28);
        });
      } else {
        const oldAccompagnateur = getContactAsObject(extras.contactAccompagnateur);
        if (oldAccompagnateur) {
          drawText('ACCOMPAGNATEUR', padding + column * columnWidth, currentY, fontSize(10), 'rgb(156, 163, 175)', 'left', false);
          const text = oldAccompagnateur.numero ? `${oldAccompagnateur.nom} - ${oldAccompagnateur.numero}` : oldAccompagnateur.nom;
          const maxTextWidth = columnWidth - fontSize(10);
          const truncatedText = truncateText(text, maxTextWidth, fontSize(12));
          drawText(truncatedText, padding + column * columnWidth, currentY + fontSize(14), fontSize(12), 'rgb(255, 255, 255)', 'left', true);
          currentY += fontSize(28);
        }
      }
    }
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
}
