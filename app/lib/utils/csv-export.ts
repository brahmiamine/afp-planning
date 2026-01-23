import { Match, Entrainement, Plateau, ClubInfo } from '@/types/match';
import { MatchExtras } from '@/hooks/useMatchExtras';

type Event = Match | Entrainement | Plateau;

export interface FieldConfig {
  label: string;
  key: string;
  enabled: boolean;
}

function escapeCsv(value: string | number | boolean | null | undefined): string {
  const str =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : String(value);

  // Remplacer les retours à la ligne pour garder un tableau lisible
  const cleaned = str.replace(/\r?\n|\r/g, ' / ');

  // Utiliser le point-virgule comme séparateur pour la compatibilité FR
  if (cleaned.includes(';') || cleaned.includes('"')) {
    return `"${cleaned.replace(/"/g, '""')}"`;
  }

  return cleaned;
}

export async function generateCsv(
  events: Event[],
  fields: FieldConfig[],
  allExtras: Record<string, MatchExtras>,
  club?: ClubInfo
) {
  const activeFields = fields.filter((f) => f.enabled);
  if (activeFields.length === 0 || events.length === 0) return;

  const lines: string[] = [];

  // En-tête du club (similaire au PDF, noir/blanc côté design de l'app)
  if (club) {
    lines.push(['Club', escapeCsv(club.name)].join(';'));
    if (club.description) {
      lines.push(['Description', escapeCsv(club.description)].join(';'));
    }
  } else {
    lines.push(['Club', 'Academie Football Paris 18'].join(';'));
  }

  const exportDate = new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  lines.push(['Exporté le', escapeCsv(exportDate)].join(';'));

  // Ligne vide avant le tableau principal
  lines.push('');

  // Ligne d'en-tête du tableau
  lines.push(activeFields.map((f) => escapeCsv(f.label)).join(';'));

  // Lignes de données
  for (const event of events) {
    const row: string[] = [];
    const match = event as Match;
    const extras = match.id ? allExtras[match.id] : undefined;

    for (const field of activeFields) {
      let value: string | null = null;

      switch (field.key) {
        case 'date':
          value = event.date;
          break;
        case 'time':
          value = 'time' in event ? event.time : '';
          break;
        case 'type': {
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
          value = typeLabels[eventType] || eventType;
          break;
        }
        case 'localTeam':
          if ('localTeam' in event) {
            value = match.localTeam;
          } else if ('lieu' in event) {
            value = (event as Entrainement | Plateau).lieu;
          }
          break;
        case 'awayTeam':
          if ('awayTeam' in event) {
            value = match.awayTeam;
          }
          break;
        case 'venue':
          if ('venue' in event) {
            value = match.venue === 'domicile' ? 'Domicile' : 'Extérieur';
          }
          break;
        case 'competition':
          if ('competition' in event) {
            value = match.competition;
          }
          break;
        case 'horaireRendezVous':
          if ('horaireRendezVous' in event) {
            value = match.horaireRendezVous;
          }
          break;
        case 'stadium':
          if ('details' in event && event.details) {
            value = event.details.stadium || '';
          }
          break;
        case 'address':
          if ('details' in event && event.details) {
            value = event.details.address || '';
          }
          break;
        case 'terrainType':
          if ('details' in event && event.details) {
            value = event.details.terrainType || '';
          }
          break;
        case 'referee':
          if ('staff' in event && event.staff) {
            value = event.staff.referee || '';
          }
          break;
        case 'assistant1':
          if ('staff' in event && event.staff) {
            value = event.staff.assistant1 || '';
          }
          break;
        case 'assistant2':
          if ('staff' in event && event.staff) {
            value = event.staff.assistant2 || '';
          }
          break;
        case 'arbitreTouche':
          if (extras?.arbitreTouche && Array.isArray(extras.arbitreTouche)) {
            value = extras.arbitreTouche
              .map((a) => `${a.nom}${a.numero ? ` (${a.numero})` : ''}`)
              .join(' / ');
          }
          break;
        case 'encadrants':
          if ('encadrants' in event && event.encadrants && Array.isArray(event.encadrants)) {
            value = event.encadrants
              .map((e) => `${e.nom}${e.numero ? ` (${e.numero})` : ''}`)
              .join(' / ');
          }
          break;
        case 'contactEncadrants':
          if (extras?.contactEncadrants && Array.isArray(extras.contactEncadrants)) {
            value = extras.contactEncadrants
              .map((c) => `${c.nom}${c.numero ? ` (${c.numero})` : ''}`)
              .join(' / ');
          }
          break;
        case 'contactAccompagnateur':
          if (extras?.contactAccompagnateur && Array.isArray(extras.contactAccompagnateur)) {
            value = extras.contactAccompagnateur
              .map((c) => `${c.nom}${c.numero ? ` (${c.numero})` : ''}`)
              .join(' / ');
          }
          break;
        case 'confirmed':
          if (extras && typeof extras.confirmed === 'boolean') {
            value = extras.confirmed ? 'Oui' : 'Non';
          } else {
            value = '';
          }
          break;
        default:
          value = '';
      }

      row.push(escapeCsv(value));
    }

    lines.push(row.join(';'));
  }

  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const fileName = `export-matches-${new Date().toISOString().split('T')[0]}.csv`;

  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

