import html2canvas from 'html2canvas';
import { Match } from '@/types/match';

import { MatchExtras } from '@/hooks/useMatchExtras';

interface ShareImageOptions {
  match: Match;
  localTeamLogo?: string;
  awayTeamLogo?: string;
  extras?: MatchExtras | null;
}

/**
 * Génère une image haute résolution du match pour le partage sur les réseaux sociaux
 * Version simplifiée sans React pour éviter les problèmes de rendu
 */
export async function generateMatchShareImageSimple({
  match,
  localTeamLogo,
  awayTeamLogo,
}: ShareImageOptions): Promise<Blob> {
  // Créer un iframe complètement isolé pour éviter tout héritage de styles
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '0';
  iframe.style.width = '1200px';
  iframe.style.height = '630px';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    throw new Error('Impossible d\'accéder au document de l\'iframe');
  }

  // Créer un conteneur dans l'iframe
  const container = iframeDoc.createElement('div');
  container.id = 'match-share-image';
  container.style.width = '1200px';
  container.style.height = '630px';
  container.style.padding = '0';
  container.style.margin = '0';
  container.style.background = 'linear-gradient(135deg, rgb(26, 26, 26) 0%, rgb(45, 45, 45) 50%, rgb(26, 26, 26) 100%)';
  container.style.borderRadius = '24px';
  container.style.overflow = 'hidden';
  container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  container.style.color = 'rgb(255, 255, 255)';
  container.style.boxSizing = 'border-box';
  
  // Ajouter au body de l'iframe
  iframeDoc.body.style.margin = '0';
  iframeDoc.body.style.padding = '0';
  iframeDoc.body.appendChild(container);

  // Gradient overlay
  const gradientOverlay = iframeDoc.createElement('div');
  gradientOverlay.style.position = 'absolute';
  gradientOverlay.style.top = '0';
  gradientOverlay.style.left = '0';
  gradientOverlay.style.right = '0';
  gradientOverlay.style.bottom = '0';
  gradientOverlay.style.background = 'radial-gradient(circle at 30% 50%, rgba(59, 130, 246, 0.1) 0%, rgba(0, 0, 0, 0) 50%)';
  gradientOverlay.style.pointerEvents = 'none';
  container.appendChild(gradientOverlay);

  // Contenu principal
  const content = iframeDoc.createElement('div');
  content.style.width = '100%';
  content.style.height = '100%';
  content.style.padding = '60px';
  content.style.display = 'flex';
  content.style.flexDirection = 'column';
  content.style.justifyContent = 'space-between';
  content.style.boxSizing = 'border-box';
  content.style.position = 'relative';
  content.style.zIndex = '1';
  container.appendChild(content);

  // Header
  const header = iframeDoc.createElement('div');
  header.style.display = 'flex';
  header.style.flexDirection = 'column';
  header.style.gap = '16px';

  const headerTop = iframeDoc.createElement('div');
  headerTop.style.display = 'flex';
  headerTop.style.alignItems = 'center';
  headerTop.style.justifyContent = 'space-between';
  headerTop.style.flexWrap = 'wrap';
  headerTop.style.gap = '16px';

  const dateSection = iframeDoc.createElement('div');
  dateSection.style.display = 'flex';
  dateSection.style.alignItems = 'center';
  dateSection.style.gap = '12px';

  const dateBar = iframeDoc.createElement('div');
  dateBar.style.width = '4px';
  dateBar.style.height = '40px';
  dateBar.style.background = 'linear-gradient(180deg, rgb(59, 130, 246) 0%, rgb(30, 64, 175) 100%)';
  dateBar.style.borderRadius = '2px';
  dateSection.appendChild(dateBar);

  const dateText = iframeDoc.createElement('div');
  const dateLabel = iframeDoc.createElement('div');
  dateLabel.textContent = 'DATE';
  dateLabel.style.fontSize = '14px';
  dateLabel.style.color = 'rgb(156, 163, 175)';
  dateLabel.style.fontWeight = '500';
  dateLabel.style.marginBottom = '4px';
  dateText.appendChild(dateLabel);

  const dateValue = iframeDoc.createElement('div');
  dateValue.textContent = match.date;
  dateValue.style.fontSize = '28px';
  dateValue.style.fontWeight = '700';
  dateValue.style.color = 'rgb(255, 255, 255)';
  dateText.appendChild(dateValue);
  dateSection.appendChild(dateText);
  headerTop.appendChild(dateSection);

  const venueBadge = iframeDoc.createElement('div');
  venueBadge.style.display = 'flex';
  venueBadge.style.alignItems = 'center';
  venueBadge.style.gap = '8px';
  venueBadge.style.padding = '8px 16px';
  venueBadge.style.background = 'rgba(255, 255, 255, 0.1)';
  venueBadge.style.borderRadius = '12px';
  venueBadge.style.backdropFilter = 'blur(10px)';
  const venueEmoji = iframeDoc.createElement('span');
  venueEmoji.textContent = match.venue === 'domicile' ? '🏠' : '✈️';
  venueEmoji.style.fontSize = '12px';
  venueEmoji.style.color = 'rgb(156, 163, 175)';
  venueBadge.appendChild(venueEmoji);
  const venueText = iframeDoc.createElement('span');
  venueText.textContent = match.venue === 'domicile' ? 'Domicile' : 'Extérieur';
  venueText.style.fontSize = '14px';
  venueText.style.fontWeight = '600';
  venueText.style.textTransform = 'capitalize';
  venueBadge.appendChild(venueText);
  headerTop.appendChild(venueBadge);
  header.appendChild(headerTop);

  const competitionRow = iframeDoc.createElement('div');
  competitionRow.style.display = 'flex';
  competitionRow.style.alignItems = 'center';
  competitionRow.style.gap = '8px';
  competitionRow.style.marginTop = '8px';
  const competitionText = iframeDoc.createElement('span');
  competitionText.textContent = match.competition;
  competitionText.style.fontSize = '18px';
  competitionText.style.fontWeight = '600';
  competitionText.style.color = 'rgb(255, 255, 255)';
  competitionRow.appendChild(competitionText);
  if (match.categorie) {
    const categorieBadge = iframeDoc.createElement('span');
    categorieBadge.textContent = match.categorie;
    categorieBadge.style.fontSize = '12px';
    categorieBadge.style.padding = '4px 12px';
    categorieBadge.style.background = 'rgba(59, 130, 246, 0.2)';
    categorieBadge.style.borderRadius = '8px';
    categorieBadge.style.color = 'rgb(96, 165, 250)';
    categorieBadge.style.fontWeight = '500';
    competitionRow.appendChild(categorieBadge);
  }
  header.appendChild(competitionRow);
  content.appendChild(header);

  // Teams section
  const teamsSection = iframeDoc.createElement('div');
  teamsSection.style.display = 'flex';
  teamsSection.style.alignItems = 'center';
  teamsSection.style.justifyContent = 'space-between';
  teamsSection.style.gap = '40px';
  teamsSection.style.flex = '1';
  teamsSection.style.margin = '40px 0';

  // Local team
  const localTeamDiv = iframeDoc.createElement('div');
  localTeamDiv.style.flex = '1';
  localTeamDiv.style.display = 'flex';
  localTeamDiv.style.flexDirection = 'column';
  localTeamDiv.style.alignItems = 'center';
  localTeamDiv.style.gap = '20px';

  const localLogoContainer = iframeDoc.createElement('div');
  localLogoContainer.style.width = '120px';
  localLogoContainer.style.height = '120px';
  localLogoContainer.style.borderRadius = '50%';
  localLogoContainer.style.background = 'rgba(255, 255, 255, 0.1)';
  localLogoContainer.style.display = 'flex';
  localLogoContainer.style.alignItems = 'center';
  localLogoContainer.style.justifyContent = 'center';
  localLogoContainer.style.padding = '12px';
  localLogoContainer.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3)';

  if (localTeamLogo) {
    const localImg = iframeDoc.createElement('img');
    localImg.src = localTeamLogo;
    localImg.alt = match.localTeam;
    localImg.style.width = '100%';
    localImg.style.height = '100%';
    localImg.style.objectFit = 'contain';
    localImg.crossOrigin = 'anonymous';
    localImg.onerror = () => {
      localImg.style.display = 'none';
      const fallback = iframeDoc.createElement('div');
      fallback.textContent = match.localTeam.charAt(0).toUpperCase();
      fallback.style.width = '100%';
      fallback.style.height = '100%';
      fallback.style.display = 'flex';
      fallback.style.alignItems = 'center';
      fallback.style.justifyContent = 'center';
      fallback.style.fontSize = '48px';
      fallback.style.fontWeight = '700';
      fallback.style.color = 'rgb(255, 255, 255)';
      localLogoContainer.appendChild(fallback);
    };
    localLogoContainer.appendChild(localImg);
  } else {
    const fallback = document.createElement('div');
    fallback.textContent = match.localTeam.charAt(0).toUpperCase();
    fallback.style.width = '100%';
    fallback.style.height = '100%';
    fallback.style.display = 'flex';
    fallback.style.alignItems = 'center';
    fallback.style.justifyContent = 'center';
    fallback.style.fontSize = '48px';
    fallback.style.fontWeight = '700';
    fallback.style.color = '#ffffff';
    localLogoContainer.appendChild(fallback);
  }
  localTeamDiv.appendChild(localLogoContainer);

  const localTeamName = iframeDoc.createElement('div');
  localTeamName.textContent = match.localTeam;
  localTeamName.style.fontSize = '32px';
  localTeamName.style.fontWeight = '700';
  localTeamName.style.color = 'rgb(255, 255, 255)';
  localTeamName.style.textAlign = 'center';
  localTeamName.style.lineHeight = '1.2';
  localTeamDiv.appendChild(localTeamName);
  teamsSection.appendChild(localTeamDiv);

  // VS
  const vsDiv = iframeDoc.createElement('div');
  vsDiv.style.display = 'flex';
  vsDiv.style.flexDirection = 'column';
  vsDiv.style.alignItems = 'center';
  vsDiv.style.gap = '12px';
  vsDiv.style.padding = '0 20px';

  const vsText = iframeDoc.createElement('div');
  vsText.textContent = 'VS';
  vsText.style.fontSize = '48px';
  vsText.style.fontWeight = '900';
  vsText.style.color = 'rgb(59, 130, 246)';
  vsText.style.textShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
  vsDiv.appendChild(vsText);

  const timeBox = iframeDoc.createElement('div');
  timeBox.style.display = 'flex';
  timeBox.style.flexDirection = 'column';
  timeBox.style.alignItems = 'center';
  timeBox.style.gap = '4px';
  timeBox.style.padding = '12px 20px';
  timeBox.style.background = 'rgba(255, 255, 255, 0.1)';
  timeBox.style.borderRadius = '12px';
  timeBox.style.backdropFilter = 'blur(10px)';

  const timeText = iframeDoc.createElement('div');
  timeText.textContent = match.time;
  timeText.style.fontSize = '24px';
  timeText.style.fontWeight = '700';
  timeText.style.color = 'rgb(255, 255, 255)';
  timeBox.appendChild(timeText);

  const rdvText = iframeDoc.createElement('div');
  rdvText.textContent = `RDV: ${match.horaireRendezVous}`;
  rdvText.style.fontSize = '12px';
  rdvText.style.color = 'rgb(156, 163, 175)';
  rdvText.style.marginTop = '4px';
  timeBox.appendChild(rdvText);
  vsDiv.appendChild(timeBox);
  teamsSection.appendChild(vsDiv);

  // Away team
  const awayTeamDiv = iframeDoc.createElement('div');
  awayTeamDiv.style.flex = '1';
  awayTeamDiv.style.display = 'flex';
  awayTeamDiv.style.flexDirection = 'column';
  awayTeamDiv.style.alignItems = 'center';
  awayTeamDiv.style.gap = '20px';

  const awayLogoContainer = iframeDoc.createElement('div');
  awayLogoContainer.style.width = '120px';
  awayLogoContainer.style.height = '120px';
  awayLogoContainer.style.borderRadius = '50%';
  awayLogoContainer.style.background = 'rgba(255, 255, 255, 0.1)';
  awayLogoContainer.style.display = 'flex';
  awayLogoContainer.style.alignItems = 'center';
  awayLogoContainer.style.justifyContent = 'center';
  awayLogoContainer.style.padding = '12px';
  awayLogoContainer.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3)';

  if (awayTeamLogo) {
    const awayImg = iframeDoc.createElement('img');
    awayImg.src = awayTeamLogo;
    awayImg.alt = match.awayTeam;
    awayImg.style.width = '100%';
    awayImg.style.height = '100%';
    awayImg.style.objectFit = 'contain';
    awayImg.crossOrigin = 'anonymous';
    awayImg.onerror = () => {
      awayImg.style.display = 'none';
      const fallback = iframeDoc.createElement('div');
      fallback.textContent = match.awayTeam.charAt(0).toUpperCase();
      fallback.style.width = '100%';
      fallback.style.height = '100%';
      fallback.style.display = 'flex';
      fallback.style.alignItems = 'center';
      fallback.style.justifyContent = 'center';
      fallback.style.fontSize = '48px';
      fallback.style.fontWeight = '700';
      fallback.style.color = 'rgb(255, 255, 255)';
      awayLogoContainer.appendChild(fallback);
    };
    awayLogoContainer.appendChild(awayImg);
  } else {
    const fallback = document.createElement('div');
    fallback.textContent = match.awayTeam.charAt(0).toUpperCase();
    fallback.style.width = '100%';
    fallback.style.height = '100%';
    fallback.style.display = 'flex';
    fallback.style.alignItems = 'center';
    fallback.style.justifyContent = 'center';
    fallback.style.fontSize = '48px';
    fallback.style.fontWeight = '700';
    fallback.style.color = '#ffffff';
    awayLogoContainer.appendChild(fallback);
  }
  awayTeamDiv.appendChild(awayLogoContainer);

  const awayTeamName = iframeDoc.createElement('div');
  awayTeamName.textContent = match.awayTeam;
  awayTeamName.style.fontSize = '32px';
  awayTeamName.style.fontWeight = '700';
  awayTeamName.style.color = 'rgb(255, 255, 255)';
  awayTeamName.style.textAlign = 'center';
  awayTeamName.style.lineHeight = '1.2';
  awayTeamDiv.appendChild(awayTeamName);
  teamsSection.appendChild(awayTeamDiv);
  content.appendChild(teamsSection);

  // Footer
  const footer = iframeDoc.createElement('div');
  footer.style.display = 'flex';
  footer.style.flexWrap = 'wrap';
  footer.style.gap = '24px';
  footer.style.paddingTop = '24px';
  footer.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';

  if (match.details?.stadium) {
    const stadiumDiv = iframeDoc.createElement('div');
    stadiumDiv.style.display = 'flex';
    stadiumDiv.style.flexDirection = 'column';
    stadiumDiv.style.gap = '4px';

    const stadiumLabel = iframeDoc.createElement('div');
    stadiumLabel.textContent = 'STADE';
    stadiumLabel.style.fontSize = '11px';
    stadiumLabel.style.color = 'rgb(156, 163, 175)';
    stadiumLabel.style.fontWeight = '500';
    stadiumDiv.appendChild(stadiumLabel);

    const stadiumValue = iframeDoc.createElement('div');
    stadiumValue.textContent = match.details.stadium;
    stadiumValue.style.fontSize = '16px';
    stadiumValue.style.fontWeight = '600';
    stadiumValue.style.color = 'rgb(255, 255, 255)';
    stadiumDiv.appendChild(stadiumValue);

    if (match.details.address) {
      const addressText = iframeDoc.createElement('div');
      addressText.textContent = match.details.address;
      addressText.style.fontSize = '12px';
      addressText.style.color = 'rgb(156, 163, 175)';
      addressText.style.marginTop = '2px';
      stadiumDiv.appendChild(addressText);
    }
    footer.appendChild(stadiumDiv);
  }

  if (match.staff?.referee) {
    const refereeDiv = iframeDoc.createElement('div');
    refereeDiv.style.display = 'flex';
    refereeDiv.style.flexDirection = 'column';
    refereeDiv.style.gap = '4px';

    const refereeLabel = iframeDoc.createElement('div');
    refereeLabel.textContent = 'ARBITRE';
    refereeLabel.style.fontSize = '11px';
    refereeLabel.style.color = 'rgb(156, 163, 175)';
    refereeLabel.style.fontWeight = '500';
    refereeDiv.appendChild(refereeLabel);

    const refereeValue = iframeDoc.createElement('div');
    refereeValue.textContent = match.staff.referee;
    refereeValue.style.fontSize = '16px';
    refereeValue.style.fontWeight = '600';
    refereeValue.style.color = 'rgb(255, 255, 255)';
    refereeDiv.appendChild(refereeValue);
    footer.appendChild(refereeDiv);
  }
  content.appendChild(footer);


  try {
    // Attendre que les images se chargent
    const images = container.querySelectorAll('img');
    if (images.length > 0) {
      await Promise.all(
        Array.from(images).map(
          (img) =>
            new Promise<void>((resolve) => {
              const timeout = setTimeout(() => {
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
                  resolve();
                };
              }
            })
        )
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 300));

    // Attendre que l'iframe soit prêt
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Forcer toutes les couleurs en RGB avant la capture
    const allElements = container.querySelectorAll('*');
    allElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.style) {
        // Convertir toutes les propriétés de couleur en RGB
        const style = htmlEl.style;
        if (style.color) {
          try {
            const computed = iframeDoc.defaultView?.getComputedStyle(htmlEl);
            if (computed) {
              const rgb = computed.color;
              if (rgb && !rgb.startsWith('rgb')) {
                // Forcer en RGB si ce n'est pas déjà le cas
                const temp = iframeDoc.createElement('div');
                temp.style.color = style.color;
                iframeDoc.body.appendChild(temp);
                const computedColor = iframeDoc.defaultView?.getComputedStyle(temp).color || 'rgb(255, 255, 255)';
                style.color = computedColor;
                iframeDoc.body.removeChild(temp);
              }
            }
          } catch (e) {
            // Ignorer les erreurs
          }
        }
        if (style.backgroundColor) {
          try {
            const computed = iframeDoc.defaultView?.getComputedStyle(htmlEl);
            if (computed) {
              const rgb = computed.backgroundColor;
              if (rgb && !rgb.startsWith('rgb') && rgb !== 'transparent') {
                const temp = iframeDoc.createElement('div');
                temp.style.backgroundColor = style.backgroundColor;
                iframeDoc.body.appendChild(temp);
                const computedBg = iframeDoc.defaultView?.getComputedStyle(temp).backgroundColor || 'rgb(26, 26, 26)';
                style.backgroundColor = computedBg;
                iframeDoc.body.removeChild(temp);
              }
            }
          } catch (e) {
            // Ignorer les erreurs
          }
        }
      }
    });

    const canvas = await html2canvas(container, {
      foreignObjectRendering: false,
      width: 1200,
      height: 630,
      scale: 2,
      backgroundColor: 'rgb(26, 26, 26)',
      logging: false,
      useCORS: true,
      allowTaint: false,
      imageTimeout: 10000,
      proxy: undefined, // Désactiver le proxy
      onclone: (clonedDoc) => {
        // Nettoyer tous les styles qui pourraient causer des problèmes
        const clonedContainer = clonedDoc.getElementById('match-share-image');
        if (clonedContainer) {
          const htmlEl = clonedContainer as HTMLElement;
          htmlEl.style.isolation = 'isolate';
          
          // Forcer toutes les couleurs en RGB dans le clone
          const allClonedElements = clonedContainer.querySelectorAll('*');
          allClonedElements.forEach((el) => {
            const clonedEl = el as HTMLElement;
            if (clonedEl.style) {
              // S'assurer que toutes les couleurs sont en RGB
              const computed = clonedDoc.defaultView?.getComputedStyle(clonedEl);
              if (computed) {
                if (computed.color && !computed.color.startsWith('rgb')) {
                  clonedEl.style.color = 'rgb(255, 255, 255)';
                }
                if (computed.backgroundColor && !computed.backgroundColor.startsWith('rgb') && computed.backgroundColor !== 'transparent') {
                  clonedEl.style.backgroundColor = 'rgb(26, 26, 26)';
                }
              }
            }
          });
        }
      },
    });

    if (!canvas) {
      throw new Error('html2canvas n\'a pas pu générer le canvas');
    }

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
  } finally {
    // Nettoyer l'iframe
    if (iframe && document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  }
}
