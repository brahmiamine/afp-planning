export interface MatchDetails {
  stadium: string;
  dateTime: string;
  competition: string;
  address: string;
  terrainType: string;
  itineraryLink: string;
  rawText: string;
}

export interface MatchStaff {
  referee: string;
  assistant1: string;
  assistant2: string;
  rawText: string;
}

export type MatchType = 'officiel' | 'amical' | 'entrainement' | 'plateau';

export interface Match {
  id?: string; // ID extrait de l'URL (ex: afp-18-u13-f-1-montmartre-s-paris-u13-f-1-wduo1)
  type?: MatchType; // Type de match (officiel pour les matchs scrapés)
  date: string;
  competition: string;
  localTeam: string;
  awayTeam: string;
  venue: 'domicile' | 'extérieur';
  localTeamLogo?: string;
  awayTeamLogo?: string;
  time: string;
  horaireRendezVous: string;
  url?: string;
  rawText?: string;
  details?: MatchDetails | null;
  staff?: MatchStaff | null;
}

export interface ClubInfo {
  name: string;
  description: string;
  logo: string;
}

export interface MatchesData {
  club: ClubInfo;
  url: string;
  scrapedAt: string;
  matches: Record<string, Match[]>;
}
