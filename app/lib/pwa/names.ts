/** Nom d’application installée : « {club} Planning ». */
export function buildPwaAppName(clubName: string): string {
  const name = clubName.trim() || 'Club';
  return `${name} Planning`;
}

/**
 * Libellé court (icône iOS / short_name Android).
 * 22 caractères max — au-delà, initiales du club + « Planning ».
 */
export function buildPwaShortName(clubName: string): string {
  const fullName = buildPwaAppName(clubName);
  if (fullName.length <= 22) return fullName;

  const initials = clubName
    .split(/\s+/)
    .map((word) => word.trim().charAt(0))
    .join('')
    .replace(/[^A-Za-zÀ-ÿ]/g, '')
    .toUpperCase()
    .slice(0, 6);

  return `${initials || 'Club'} Planning`;
}
