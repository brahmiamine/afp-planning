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
