import { describe, expect, it } from 'vitest';
import { findTeamLogo, normalizeClubName, resolveMatchLogos } from './match';

const clubs = [
  { nom: 'Academie Football Paris 18', logo: 'afp18.jpg' },
  { nom: 'F.C. Versailles 78', logo: 'versailles.jpg' },
  { nom: 'AS de Paris', logo: 'asparis.jpg' },
];

describe('normalizeClubName', () => {
  it('supprime accents, casse et suffixes de catégorie', () => {
    expect(normalizeClubName('F.C. Versailles 78 U15')).toBe('fc versailles 78');
    expect(normalizeClubName('AS de Paris - Séniors')).toBe('as de paris');
  });
});

describe('findTeamLogo', () => {
  it('trouve par nom exact normalisé', () => {
    expect(findTeamLogo('academie football paris 18', clubs)).toBe('afp18.jpg');
  });

  it('trouve malgré un suffixe de catégorie et une ponctuation différente', () => {
    expect(findTeamLogo('FC Versailles 78 U20', clubs)).toBe('versailles.jpg');
  });

  it('trouve par acronyme', () => {
    expect(findTeamLogo('AFP 18', clubs)).toBe('afp18.jpg');
  });

  it('retourne undefined quand rien ne correspond', () => {
    expect(findTeamLogo('Club Inconnu XYZ', clubs)).toBeUndefined();
  });
});

describe('resolveMatchLogos', () => {
  it('privilégie les logos déjà présents sur le match', () => {
    const result = resolveMatchLogos(
      { localTeam: 'AFP 18', awayTeam: 'FC Versailles', localTeamLogo: 'scrape-a.jpg', awayTeamLogo: 'scrape-b.jpg' },
      clubs,
    );
    expect(result).toEqual({ localTeamLogo: 'scrape-a.jpg', awayTeamLogo: 'scrape-b.jpg' });
  });

  it('utilise le logo du club de l’utilisateur quand l’équipe correspond', () => {
    const result = resolveMatchLogos(
      { localTeam: 'AFP 18 U20', awayTeam: 'CA de Paris' },
      [],
      { name: 'Academie Football Paris 18', logo: 'settings-logo.png' },
    );
    expect(result.localTeamLogo).toBe('settings-logo.png');
  });

  it('retombe sur la recherche tolérante dans la liste des clubs', () => {
    const result = resolveMatchLogos(
      { localTeam: 'AFP 18', awayTeam: 'FC Versailles 78 U17' },
      clubs,
    );
    expect(result.localTeamLogo).toBe('afp18.jpg');
    expect(result.awayTeamLogo).toBe('versailles.jpg');
  });
});
