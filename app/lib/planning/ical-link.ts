export function buildIcalFeedUrl(origin: string, token: string): string {
  const base = origin.replace(/\/$/, '');
  return `${base}/api/ical/${token}`;
}
