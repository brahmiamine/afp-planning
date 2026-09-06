/**
 * Utilitaires pour la manipulation des dates
 */

/**
 * Parse une date au format DD/MM/YYYY et retourne un objet Date
 */
export function parseDateString(dateString: string): Date {
  const parts = dateString.split('/').map(Number);
  const [day = 1, month = 1, year = 2000] = parts;
  return new Date(year, month - 1, day);
}

/**
 * Compare deux dates au format DD/MM/YYYY
 */
export function compareDates(a: string, b: string): number {
  const dateA = parseDateString(a);
  const dateB = parseDateString(b);
  return dateA.getTime() - dateB.getTime();
}

/**
 * Trie un tableau de dates au format DD/MM/YYYY
 */
export function sortDates(dates: string[]): string[] {
  return [...dates].sort(compareDates);
}

/**
 * Formate une date ISO en format français
 */
export function formatDateFrench(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Obtient le nom du jour en français à partir d'une date au format DD/MM/YYYY
 */
export function getDayName(dateString: string): string {
  const date = parseDateString(dateString);
  return date.toLocaleString('fr-FR', { weekday: 'long' });
}

/**
 * Formate une date avec le nom du jour au format "Samedi 17/01/2026"
 */
export function formatDateWithDayName(dateString: string): string {
  const dayName = getDayName(dateString);
  // Capitaliser la première lettre
  const capitalizedDayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  return `${capitalizedDayName} ${dateString}`;
}

/**
 * Formate une date au format ISO "YYYY-MM-DD" en français (ex: "5 sept. 2026").
 * Construit la date à partir des composants year/month/day plutôt que de parser
 * la chaîne directement, pour éviter un décalage d'un jour lié au fuseau horaire
 * local lors de l'affichage d'une date UTC "sans heure".
 */
export function formatIsoDate(value: string | null | undefined): string {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
}
