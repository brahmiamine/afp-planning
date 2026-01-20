import jsPDF from 'jspdf';
import { Match, Entrainement, Plateau, ClubInfo } from '@/types/match';
import { MatchExtras } from '@/hooks/useMatchExtras';
import { formatDateWithDayName } from './date';

type Event = Match | Entrainement | Plateau;

interface FieldConfig {
  label: string;
  key: string;
  enabled: boolean;
}

// Fonction pour charger une image et la convertir en base64
async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    if (url.startsWith('data:')) {
      return url;
    }

    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
    });

    if (!response.ok) {
      console.warn('Impossible de charger l\'image:', url);
      return null;
    }

    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64);
      };
      reader.onerror = () => {
        console.error('Erreur lors de la conversion de l\'image en base64');
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Erreur lors du chargement de l\'image:', error);
    return null;
  }
}

export async function generatePdf(
  events: Event[],
  _fields: FieldConfig[], // Non utilisé mais gardé pour compatibilité
  allExtras: Record<string, MatchExtras>,
  club?: ClubInfo
) {
  // Créer un PDF en format paysage A4
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 297mm en paysage
  const pageHeight = doc.internal.pageSize.getHeight(); // 210mm en paysage
  const margin = 8;
  const contentWidth = pageWidth - 2 * margin;

  // Couleurs : seulement noir et blanc
  const black: [number, number, number] = [0, 0, 0];
  const white: [number, number, number] = [255, 255, 255];
  const lightGray: [number, number, number] = [245, 245, 245]; // Très léger pour les lignes alternées

  let yPosition = margin;


  // En-tête avec logo et nom du club (fond blanc)
  const headerHeight = 20;
  // Fond blanc pour l'en-tête
  doc.setFillColor(white[0] ?? 0, white[1] ?? 0, white[2] ?? 0);
  doc.rect(margin, yPosition, contentWidth, headerHeight, 'F');
  // Bordure en bas de l'en-tête
  doc.setDrawColor(black[0] ?? 0, black[1] ?? 0, black[2] ?? 0);
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition + headerHeight, margin + contentWidth, yPosition + headerHeight);

  // Charger et afficher le logo
  if (club?.logo) {
    try {
      const logoBase64 = await loadImageAsBase64(club.logo);
      if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', margin + 2, yPosition + 1, 18, 18);
      }
    } catch (error) {
      console.error('Erreur lors du chargement du logo:', error);
    }
  }

  // Nom du club (texte noir)
  doc.setTextColor(black[0] ?? 0, black[1] ?? 0, black[2] ?? 0);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  const clubNameX = club?.logo ? margin + 22 : margin + 3;
  doc.text(club?.name || 'Academie Football Paris 18', clubNameX, yPosition + 9);

  // Description du club
  if (club?.description) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(club.description, clubNameX, yPosition + 14);
  }

  // Date d'export à droite
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  const exportDate = new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const dateTextWidth = doc.getTextWidth(`Exporté le : ${exportDate}`);
  doc.text(`Exporté le : ${exportDate}`, pageWidth - margin - dateTextWidth, yPosition + 9);

  yPosition += headerHeight + 6;

  // Grouper les événements par date
  const eventsByDate: Record<string, Event[]> = {};
  events.forEach((event) => {
    const date = event.date;
    if (!date) return;
    if (!eventsByDate[date]) {
      eventsByDate[date] = [];
    }
    eventsByDate[date].push(event);
  });

  // Trier les dates
  const sortedDates = Object.keys(eventsByDate).sort((a, b) => {
    const partsA = a.split('/').map(Number);
    const partsB = b.split('/').map(Number);
    const [dayA = 1, monthA = 1, yearA = 2000] = partsA;
    const [dayB = 1, monthB = 1, yearB = 2000] = partsB;
    const dateA = new Date(yearA, monthA - 1, dayA);
    const dateB = new Date(yearB, monthB - 1, dayB);
    return dateA.getTime() - dateB.getTime();
  });

  // Afficher toutes les dates (avec pagination si nécessaire)
  const datesToShow = sortedDates;

  // Colonnes du tableau dans l'ordre demandé
  const columns = [
    { key: 'heure', label: 'Heure', width: 12 },
    { key: 'horaireRdv', label: 'RDV', width: 12 },
    { key: 'competition', label: 'Compétition', width: 25 },
    { key: 'equipeLocale', label: 'Équipe locale', width: 30 },
    { key: 'equipeVisiteur', label: 'Équipe visiteur', width: 30 },
    { key: 'adresse', label: 'Adresse', width: 50 },
    { key: 'staff', label: 'Staff', width: 40 },
    { key: 'contacts', label: 'Contacts AFP', width: 50 },
  ];

  const totalColumnWidth = columns.reduce((sum, col) => sum + col.width, 0);
  const scaleFactor = contentWidth / totalColumnWidth;

  // Ajuster les largeurs des colonnes
  columns.forEach((col) => {
    col.width = col.width * scaleFactor;
  });

  datesToShow.forEach((date, dateIndex) => {
    // Vérifier si on a besoin d'une nouvelle page avant d'ajouter un nouveau tableau
    if (dateIndex > 0) {
      const spaceNeeded = 20; // Espace pour le titre + en-tête
      if (yPosition + spaceNeeded > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      } else {
        yPosition += 8; // Espace entre les tableaux
      }
    }

    const dateEvents = (eventsByDate[date] || []).sort((a, b) => {
      const timeA = 'time' in a ? a.time : '';
      const timeB = 'time' in b ? b.time : '';
      return timeA.localeCompare(timeB);
    });

    // Titre du tableau avec la date et le jour
    doc.setTextColor(black[0] ?? 0, black[1] ?? 0, black[2] ?? 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    const dateFormatted = formatDateWithDayName(date); // Format "Samedi 17/01/2026"
    doc.text(`Planning du ${dateFormatted}`, margin, yPosition);
    yPosition += 5;

    // En-tête du tableau
    const headerRowHeight = 7;
    doc.setFillColor(black[0] ?? 0, black[1] ?? 0, black[2] ?? 0);
    doc.rect(margin, yPosition, contentWidth, headerRowHeight, 'F');

    doc.setTextColor(white[0] ?? 0, white[1] ?? 0, white[2] ?? 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');

    let xPos = margin + 1;
    columns.forEach((col) => {
      const label = col.label.length > 15 ? col.label.substring(0, 13) + '...' : col.label;
      doc.text(label, xPos, yPosition + 5);
      xPos += col.width;
    });

    yPosition += headerRowHeight;

    // Lignes du tableau
    const baseRowHeight = 8; // Hauteur de base pour la lisibilité
    let rowIndex = 0;

    dateEvents.forEach((event) => {
      // Calculer la hauteur de la ligne (peut être plus grande si certaines colonnes sont longues)
      let rowHeight = baseRowHeight;
      let addressLines: string[] = [];

      // Préparer l'adresse pour vérifier si elle nécessite plusieurs lignes
      if ('details' in event && event.details) {
        const stadium = event.details.stadium || '';
        const address = event.details.address || '';
        let fullAddress = '';
        if (stadium && address) {
          fullAddress = `${stadium}, ${address}`;
        } else {
          fullAddress = stadium || address;
        }

        const addressCol = columns.find(col => col.key === 'adresse');
        if (addressCol && fullAddress) {
          const maxWidth = addressCol.width - 2;
          addressLines = doc.splitTextToSize(fullAddress, maxWidth);
          if (addressLines.length > 1) {
            rowHeight = Math.max(rowHeight, baseRowHeight + (addressLines.length - 1) * 3.5);
          }
        }
      }

      // Vérifier aussi la hauteur nécessaire pour Staff et Contacts
      const match = event as Match;
      const extras = match.id ? allExtras[match.id] : null;

      // Calculer la hauteur pour Staff
      const staffCol = columns.find(col => col.key === 'staff');
      if (staffCol) {
        const staffParts: string[] = [];
        if ('staff' in event && event.staff) {
          if (event.staff.referee) staffParts.push(`Arb Off: ${event.staff.referee}`);
          if (event.staff.assistant1) staffParts.push(`Asst1: ${event.staff.assistant1}`);
          if (event.staff.assistant2) staffParts.push(`Asst2: ${event.staff.assistant2}`);
        }
        if (staffParts.length > 0) {
          const maxWidth = staffCol.width - 2;
          let totalLines = 0;
          // Calculer le nombre de lignes pour chaque élément (chaque élément sur sa propre ligne)
          staffParts.forEach((item) => {
            const wrappedLines = doc.splitTextToSize(item, maxWidth);
            totalLines += wrappedLines.length;
          });
          if (totalLines > 1) {
            rowHeight = Math.max(rowHeight, baseRowHeight + (totalLines - 1) * 3.5);
          }
        }
      }

      // Calculer la hauteur pour Contacts
      const contactsCol = columns.find(col => col.key === 'contacts');
      if (contactsCol && extras) {
        const contactParts: string[] = [];
        if (extras.arbitreTouche) {
          if (Array.isArray(extras.arbitreTouche)) {
            extras.arbitreTouche.forEach((a) => {
              contactParts.push(`Arb touche: ${a.nom}${a.numero ? ` (${a.numero})` : ''}`);
            });
          } else if (typeof extras.arbitreTouche === 'object' && 'nom' in extras.arbitreTouche) {
            const a = extras.arbitreTouche as { nom: string; numero?: string };
            contactParts.push(`Arb touche: ${a.nom}${a.numero ? ` (${a.numero})` : ''}`);
          }
        }
        if (extras.contactEncadrants && Array.isArray(extras.contactEncadrants)) {
          extras.contactEncadrants.forEach((c) => {
            contactParts.push(`Enc: ${c.nom}${c.numero ? ` (${c.numero})` : ''}`);
          });
        }
        if (extras.contactAccompagnateur && Array.isArray(extras.contactAccompagnateur)) {
          extras.contactAccompagnateur.forEach((c) => {
            contactParts.push(`Acc: ${c.nom}${c.numero ? ` (${c.numero})` : ''}`);
          });
        }
        if (contactParts.length > 0) {
          const maxWidth = contactsCol.width - 2;
          let totalLines = 0;
          // Calculer le nombre de lignes pour chaque élément (chaque élément sur sa propre ligne)
          contactParts.forEach((item) => {
            const wrappedLines = doc.splitTextToSize(item, maxWidth);
            totalLines += wrappedLines.length;
          });
          if (totalLines > 1) {
            rowHeight = Math.max(rowHeight, baseRowHeight + (totalLines - 1) * 3.5);
          }
        }
      }

      // Vérifier si on dépasse la hauteur disponible de la page
      // Si oui, créer une nouvelle page et réafficher l'en-tête du tableau
      if (yPosition + rowHeight > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;

        // Réafficher le titre du tableau sur la nouvelle page
        doc.setTextColor(black[0] ?? 0, black[1] ?? 0, black[2] ?? 0);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`Planning du ${dateFormatted} (suite)`, margin, yPosition);
        yPosition += 5;

        // Réafficher l'en-tête du tableau
        doc.setFillColor(black[0] ?? 0, black[1] ?? 0, black[2] ?? 0);
        doc.rect(margin, yPosition, contentWidth, headerRowHeight, 'F');

        doc.setTextColor(white[0] ?? 0, white[1] ?? 0, white[2] ?? 0);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');

        xPos = margin + 1;
        columns.forEach((col) => {
          const label = col.label.length > 15 ? col.label.substring(0, 13) + '...' : col.label;
          doc.text(label, xPos, yPosition + 5);
          xPos += col.width;
        });

        yPosition += headerRowHeight;
        rowIndex = 0; // Réinitialiser l'index pour les couleurs alternées
      }

      // Fond alterné très léger
      if (rowIndex % 2 === 0) {
        doc.setFillColor(lightGray[0] ?? 0, lightGray[1] ?? 0, lightGray[2] ?? 0);
        doc.rect(margin, yPosition, contentWidth, rowHeight, 'F');
      }

      // Déterminer le type d'événement
      let eventType: string;
      if ('type' in event && event.type) {
        eventType = event.type;
      } else if ('localTeam' in event || 'competition' in event) {
        eventType = match.type === 'amical' ? 'amical' : 'officiel';
      } else if ('lieu' in event) {
        const simpleEvent = event as Entrainement | Plateau;
        eventType = simpleEvent.type;
      } else {
        eventType = 'inconnu';
      }

      const typeLabels: Record<string, string> = {
        officiel: 'Officiel',
        amical: 'Amical',
        entrainement: 'Entraînement',
        plateau: 'Plateau',
      };

      // Afficher les valeurs
      doc.setTextColor(black[0] ?? 0, black[1] ?? 0, black[2] ?? 0);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');

      xPos = margin + 1;
      let currentY = yPosition + 5.5; // Position Y de base pour le texte

      columns.forEach((col) => {
        let value = '';
        let isMultiLine = false;
        let colAddressLines: string[] = [];

        switch (col.key) {
          case 'heure':
            value = 'time' in event ? event.time : '';
            break;
          case 'horaireRdv':
            if ('horaireRendezVous' in event) {
              value = (event as Match).horaireRendezVous || '';
            }
            break;
          case 'competition':
            if ('competition' in event) {
              value = (event as Match).competition || '';
            } else if ('lieu' in event) {
              // Pour les entraînements/plateaux, mettre le type
              value = typeLabels[eventType] || eventType;
            }
            break;
          case 'equipeLocale':
            if ('localTeam' in event) {
              value = (event as Match).localTeam || '';
            } else if ('lieu' in event) {
              // Pour les entraînements/plateaux, mettre le lieu
              value = (event as Entrainement | Plateau).lieu || '';
            }
            break;
          case 'equipeVisiteur':
            if ('awayTeam' in event) {
              value = (event as Match).awayTeam || '';
            }
            break;
          case 'adresse':
            if ('details' in event && event.details) {
              const stadium = event.details.stadium || '';
              const address = event.details.address || '';
              if (stadium && address) {
                value = `${stadium}, ${address}`;
              } else {
                value = stadium || address;
              }
            }
            // Utiliser les lignes pré-calculées pour l'adresse
            colAddressLines = addressLines;
            if (addressLines.length > 0) {
              isMultiLine = true;
            }
            break;
          case 'staff':
            // Staff depuis matches.json uniquement
            const staffParts: string[] = [];
            if ('staff' in event && event.staff) {
              if (event.staff.referee) {
                staffParts.push(`Arb Off: ${event.staff.referee}`);
              }
              if (event.staff.assistant1) {
                staffParts.push(`Asst1: ${event.staff.assistant1}`);
              }
              if (event.staff.assistant2) {
                staffParts.push(`Asst2: ${event.staff.assistant2}`);
              }
            }
            value = staffParts.join('\n');
            break;
          case 'contacts':
            // Contacts depuis matches-extras.json uniquement
            const contactParts: string[] = [];

            // Arbitres AFP (depuis matches-extras.json)
            if (extras?.arbitreTouche) {
              if (Array.isArray(extras.arbitreTouche)) {
                extras.arbitreTouche.forEach((a) => {
                  contactParts.push(`Arb touche: ${a.nom}${a.numero ? ` (${a.numero})` : ''}`);
                });
              } else if (typeof extras.arbitreTouche === 'object' && 'nom' in extras.arbitreTouche) {
                const a = extras.arbitreTouche as { nom: string; numero?: string };
                contactParts.push(`Arb touche: ${a.nom}${a.numero ? ` (${a.numero})` : ''}`);
              }
            }

            // Encadrants (depuis matches-extras.json uniquement)
            if (extras?.contactEncadrants && Array.isArray(extras.contactEncadrants)) {
              extras.contactEncadrants.forEach((c) => {
                contactParts.push(`Enc: ${c.nom}${c.numero ? ` (${c.numero})` : ''}`);
              });
            }

            // Accompagnateurs (depuis matches-extras.json uniquement)
            if (extras?.contactAccompagnateur && Array.isArray(extras.contactAccompagnateur)) {
              extras.contactAccompagnateur.forEach((c) => {
                contactParts.push(`Acc: ${c.nom}${c.numero ? ` (${c.numero})` : ''}`);
              });
            }

            value = contactParts.join('\n');
            break;
        }

        // Afficher le texte
        if (col.key === 'adresse' && isMultiLine && colAddressLines.length > 0) {
          // Afficher l'adresse sur plusieurs lignes
          colAddressLines.forEach((line, lineIndex) => {
            doc.text(line, xPos, currentY + (lineIndex * 3.5));
          });
        } else if ((col.key === 'staff' || col.key === 'contacts') && value) {
          // Afficher Staff et Contacts sur plusieurs lignes (chaque élément sur sa propre ligne)
          const maxWidth = col.width - 2;
          // Diviser d'abord par les sauts de ligne
          const items = value.split('\n');
          let lineOffset = 0;
          items.forEach((item) => {
            // Si un item est trop long, le diviser en plusieurs lignes
            const wrappedLines = doc.splitTextToSize(item, maxWidth);
            wrappedLines.forEach((line: string, lineIndex: number) => {
              doc.text(line, xPos, currentY + (lineOffset + lineIndex) * 3.5);
            });
            lineOffset += wrappedLines.length;
          });
        } else {
          // Tronquer le texte si nécessaire pour les autres colonnes
          const maxWidth = col.width - 2;
          const lines = doc.splitTextToSize(value || '', maxWidth);
          const displayText = lines.length > 1 ? lines[0] + '...' : lines[0] || '';
          doc.text(displayText, xPos, currentY);
        }

        doc.setFont('helvetica', 'normal'); // Réinitialiser la police
        xPos += col.width;
      });

      yPosition += rowHeight;
      rowIndex++;
    });
  });

  // Ajouter les abréviations sur une seule ligne après le dernier tableau
  // Vérifier si on a besoin d'une nouvelle page
  if (yPosition + 8 > pageHeight - margin) {
    doc.addPage();
    yPosition = margin;
  } else {
    yPosition += 5; // Espacement après le tableau
  }

  // Liste des abréviations
  const abbreviations = [
    { abbr: 'Arb Off', full: 'Arbitre Officiel' },
    { abbr: 'Asst1', full: 'Assistant 1' },
    { abbr: 'Asst2', full: 'Assistant 2' },
    { abbr: 'Arb touche', full: 'Arbitre touche' },
    { abbr: 'Enc', full: 'Encadrant' },
    { abbr: 'Acc', full: 'Accompagnateur' },
  ];

  // Construire le texte sur une seule ligne
  const abbreviationsText = abbreviations
    .map((item) => `${item.abbr}: ${item.full}`)
    .join(' - ');

  doc.setTextColor(black[0] ?? 0, black[1] ?? 0, black[2] ?? 0);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');

  // Diviser le texte si nécessaire pour tenir dans la largeur de la page
  const maxWidth = contentWidth;
  const lines = doc.splitTextToSize(abbreviationsText, maxWidth);

  lines.forEach((line: string, index: number) => {
    if (yPosition + 5 > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
    }
    doc.text(line, margin, yPosition);
    yPosition += 4;
  });

  // Générer le nom du fichier
  const fileName = `export-matches-${new Date().toISOString().split('T')[0]}.pdf`;

  // Télécharger le PDF
  doc.save(fileName);
}
