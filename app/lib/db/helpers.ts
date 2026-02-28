import { MatchesData } from '@/types/match';

type DatedItem = {
  date: string;
  time?: string;
};

function parseDate(date: string): number {
  const [day, month, year] = date.split('/').map((part) => Number.parseInt(part, 10));
  if (!day || !month || !year) {
    return 0;
  }
  return new Date(year, month - 1, day).getTime();
}

export function sortByDateAndTime<T extends DatedItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const dateDiff = parseDate(a.date) - parseDate(b.date);
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return (a.time || '').localeCompare(b.time || '');
  });
}

export function groupMatchesByDate<T extends DatedItem>(items: T[]): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};

  for (const item of sortByDateAndTime(items)) {
    if (!grouped[item.date]) {
      grouped[item.date] = [];
    }
    const dateGroup = grouped[item.date];
    if (dateGroup) {
      dateGroup.push(item);
    }
  }

  return grouped;
}

export function normalizeMatchesData(matchesData: MatchesData): MatchesData {
  const flattened = Object.values(matchesData.matches || {}).flat();

  return {
    club: matchesData.club,
    url: matchesData.url,
    scrapedAt: matchesData.scrapedAt,
    matches: groupMatchesByDate(flattened),
  };
}
