import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export {
  calculateMeetingTime,
  extractMatchCategorie,
  parseClubInfo,
  parseDetailTeamLogos,
  parseMatchDetails,
  parseMatchStaff,
  parseMatchesList,
  PARSER_EXPORT_NAMES,
} from './sportcorico-parser.dom.js';

const DOM_PARSER_PATH = fileURLToPath(new URL('./sportcorico-parser.dom.js', import.meta.url));

export function normalizeMatchesUrlKey(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  const fromPathMatch = trimmed.match(/\/clubs\/([^/?#]+)/i);
  const fromPath = fromPathMatch?.[1] ?? trimmed.split('/').filter(Boolean).pop() ?? trimmed;

  return fromPath
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function resolveMatchesUrlKey(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    throw new Error(
      'SCRAPER_MATCHES_URL_KEY est requis. Exemple : SCRAPER_MATCHES_URL_KEY=mon-club node scraper.js',
    );
  }

  const normalized = normalizeMatchesUrlKey(rawValue);
  if (!normalized) {
    throw new Error('SCRAPER_MATCHES_URL_KEY invalide après normalisation');
  }

  return normalized;
}

let cachedBrowserBundle = null;

export function getSportCoricoParserBrowserBundle() {
  if (cachedBrowserBundle) return cachedBrowserBundle;

  const source = readFileSync(DOM_PARSER_PATH, 'utf8');
  cachedBrowserBundle = `${source
    .replace(/^export function (\w+)/gm, 'function $1')
    .replace(/^export const (\w+) =/gm, 'const $1 =')}
return {
  parseClubInfo,
  parseMatchesList,
  parseMatchDetails,
  parseMatchStaff,
  parseDetailTeamLogos,
  calculateMeetingTime,
};`;

  return cachedBrowserBundle;
}
