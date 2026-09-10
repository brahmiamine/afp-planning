import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  calculateMeetingTime,
  normalizeMatchesUrlKey,
  parseClubInfo,
  parseDetailTeamLogos,
  parseMatchDetails,
  parseMatchStaff,
  parseMatchesList,
  resolveMatchesUrlKey,
} from './sportcorico-parser.js';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function loadFixture(name: string): Document {
  const html = readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
  return new JSDOM(html).window.document;
}

const SCRAPER_CLUB_NAME = 'AFP 18';

describe('resolveMatchesUrlKey (issue #340 / SCRAPE-005)', () => {
  it('refuse une exécution standalone sans SCRAPER_MATCHES_URL_KEY', () => {
    expect(() => resolveMatchesUrlKey(undefined)).toThrow(/SCRAPER_MATCHES_URL_KEY est requis/);
    expect(() => resolveMatchesUrlKey('')).toThrow(/SCRAPER_MATCHES_URL_KEY est requis/);
    expect(() => resolveMatchesUrlKey('   ')).toThrow(/SCRAPER_MATCHES_URL_KEY est requis/);
  });

  it('normalise une clé ou un chemin SportCorico sans fallback AFP', () => {
    expect(normalizeMatchesUrlKey('')).toBe('');
    expect(normalizeMatchesUrlKey('Mon-Club Test')).toBe('mon-club-test');
    expect(resolveMatchesUrlKey('https://www.sportcorico.com/clubs/demo-club-99')).toBe('demo-club-99');
  });
});

describe('calculateMeetingTime', () => {
  it('calcule le rendez-vous 1h30 avant le coup d’envoi', () => {
    expect(calculateMeetingTime('18:00')).toBe('16:30');
    expect(calculateMeetingTime('09:00')).toBe('07:30');
    expect(calculateMeetingTime('00:30')).toBe('23:00');
  });
});

describe('parseClubInfo', () => {
  it('extrait logo, nom et description depuis la fixture liste', () => {
    const club = parseClubInfo(loadFixture('club-list.html'));

    expect(club).toEqual({
      logo: 'https://example.test/logos/logo-club-demo-1001.png',
      name: 'Académie Football Paris 18',
      description: 'Club de football à Paris 18e',
    });
  });
});

describe('parseMatchesList', () => {
  it('parse les matchs domicile/extérieur avec champs clés', () => {
    const matches = parseMatchesList(loadFixture('club-list.html'), SCRAPER_CLUB_NAME);

    expect(matches).toHaveLength(2);

    expect(matches[0]).toMatchObject({
      id: 'demo-home-u15-j3-abc12',
      type: 'officiel',
      date: '15/09/2026',
      competition: 'Championnat U15 - Journée 3',
      localTeam: 'AFP 18 U15',
      awayTeam: 'Paris Nord FC U15',
      venue: 'domicile',
      time: '18:00',
      horaireRendezVous: '16:30',
      localTeamLogo: 'https://example.test/logos/logo-afp-u15-2001.png',
      awayTeamLogo: 'https://example.test/logos/logo-rival-u15-2002.png',
      url: 'https://www.sportcorico.com/match/demo-home-u15-j3-abc12',
    });

    expect(matches[1]).toMatchObject({
      id: 'demo-away-u15-cup-def34',
      date: '22/09/2026',
      competition: 'Coupe U15 - 1/8 de finale',
      categorie: 'U15',
      localTeam: 'Montmartre SC U15',
      awayTeam: 'AFP 18 U15',
      venue: 'extérieur',
      time: '14:30',
      horaireRendezVous: '13:00',
      awayTeamLogo: 'https://example.test/logos/logo-afp-u15-2001.png',
    });
  });

  it('retourne une liste vide si la section LES MATCHS est absente', () => {
    const document = new JSDOM('<html><body></body></html>').window.document;
    expect(parseMatchesList(document, SCRAPER_CLUB_NAME)).toEqual([]);
  });
});

describe('parseMatchDetails', () => {
  it('extrait stade, horaire, compétition, adresse et itinéraire', () => {
    const details = parseMatchDetails(loadFixture('match-detail-home.html'));

    expect(details).toMatchObject({
      stadium: 'STADE MUNICIPAL JEAN BOUIN',
      dateTime: '15/09/2026 - 18:00',
      competition: 'Championnat U15 - Journée 3',
      categorie: 'U15',
      address: '12 RUE DU STADE - 75018 - PARIS',
      terrainType: 'Type de terrain : Synthétique',
      itineraryLink: 'https://maps.example.test/?q=stade-jean-bouin',
    });
    expect(details?.rawText).toContain('Détails du match');
  });

  it('retourne null quand le sélecteur detail est cassé (régression sélecteur)', () => {
    expect(parseMatchDetails(loadFixture('match-detail-broken.html'))).toBeNull();
  });
});

describe('extractMatchCategorie (issue #353)', () => {
  it('extrait U15 depuis la compétition ou les noms d’équipes', () => {
    expect(extractMatchCategorie({
      competition: 'Championnat U15 - Journée 3',
      localTeam: 'AFP 18 U15',
      awayTeam: 'Paris Nord FC U15',
      matchId: 'demo-home-u15-j3-abc12',
    })).toBe('U15');
  });

  it('extrait U13 F-1 depuis le slug URL SportCorico', () => {
    expect(extractMatchCategorie({
      competition: '',
      localTeam: '',
      awayTeam: '',
      matchId: 'afp-18-u13-f-1-montmartre-s-paris-u13-f-1-wduo1',
    })).toBe('U13 F-1');
  });

  it('retourne une chaîne vide quand aucune catégorie n’est détectable', () => {
    expect(extractMatchCategorie({
      competition: 'Tournoi amical interclubs',
      localTeam: 'Club A',
      awayTeam: 'Club B',
      matchId: 'friendly-demo',
    })).toBe('');
  });
});

describe('parseMatchStaff', () => {
  it('extrait les arbitres depuis la fixture détail', () => {
    const staff = parseMatchStaff(loadFixture('match-detail-home.html'));

    expect(staff).toMatchObject({
      referee: 'DUPONT J.',
      assistant1: 'MARTIN P.',
      assistant2: 'LEROY A.',
    });
    expect(staff?.rawText).toContain('Staff du match');
  });
});

describe('parseDetailTeamLogos', () => {
  it('associe les logos local/visiteur sur la page détail', () => {
    const logos = parseDetailTeamLogos(
      loadFixture('match-detail-home.html'),
      'AFP 18 U15',
      'Paris Nord FC U15',
    );

    expect(logos).toEqual({
      localTeamLogo: 'https://example.test/logos/logo-afp-u15-2001.png',
      awayTeamLogo: 'https://example.test/logos/logo-rival-u15-2002.png',
    });
  });
});
