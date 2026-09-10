export function normalizeClubIdentity(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function compactClubIdentity(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function clubIdentityTokens(value: string): string[] {
  return normalizeClubIdentity(value).split(' ').filter((token) => token.length >= 2);
}

function clubAcronym(clubName: string): string {
  return clubIdentityTokens(clubName)
    .filter((token) => !/^\d+$/.test(token))
    .map((token) => token[0] ?? '')
    .join('');
}

/** True when a scraped team name or logo alt likely refers to the configured club. */
export function teamNameMatchesClub(teamName: string, clubName: string): boolean {
  const teamNorm = normalizeClubIdentity(teamName);
  const clubNorm = normalizeClubIdentity(clubName);
  if (!teamNorm || !clubNorm) return false;
  if (teamNorm === clubNorm) return true;
  if (teamNorm.includes(clubNorm) || clubNorm.includes(teamNorm)) return true;

  const teamCompact = compactClubIdentity(teamName);
  const clubCompact = compactClubIdentity(clubName);
  if (teamCompact && clubCompact && (teamCompact.includes(clubCompact) || clubCompact.includes(teamCompact))) {
    return true;
  }

  const acronym = clubAcronym(clubName);
  if (acronym.length >= 2) {
    const teamWords = teamNorm.split(' ');
    if (teamWords[0] === acronym || teamCompact.startsWith(acronym)) return true;
  }

  const expectedTokens = clubIdentityTokens(clubName);
  if (expectedTokens.length === 0) return false;
  const actualTokens = new Set(clubIdentityTokens(teamName));
  const overlap = expectedTokens.filter((token) => actualTokens.has(token)).length;
  return overlap / expectedTokens.length >= 0.5;
}

export function altMatchesClub(alt: string, clubName: string): boolean {
  return teamNameMatchesClub(alt, clubName);
}

export function isHomeMatchForClub(localTeam: string, clubName: string): boolean {
  return teamNameMatchesClub(localTeam, clubName);
}
