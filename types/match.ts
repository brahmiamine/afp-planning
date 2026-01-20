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
  categorie?: string; // Catégorie sélectionnée (pour matchs amicaux)
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

// Structure pour les matchs amicaux (même structure que Match)
export interface MatchesAmicauxData {
  matches: Record<string, Match[]>;
}

// Structure pour les entraînements
export interface Entrainement {
  id: string; // ID unique généré (ex: entrainement-2026-01-17-09-00)
  type: 'entrainement';
  date: string;
  time: string;
  lieu: string;
  categorie?: string; // Catégorie sélectionnée
  encadrants?: Array<{
    nom: string;
    numero: string;
  }>;
  // Rétrocompatibilité: garder encadrant pour les anciens entraînements
  encadrant?: {
    nom: string;
    prenom: string;
  };
}

export interface EntrainementsData {
  entrainements: Record<string, Entrainement[]>;
}

// Structure pour les plateaux
export interface Plateau {
  id: string; // ID unique généré (ex: plateau-2026-01-17-09-00)
  type: 'plateau';
  date: string;
  time: string;
  lieu: string;
  categories?: string[]; // Catégories sélectionnées (plusieurs possibles)
  encadrants?: Array<{
    nom: string;
    numero: string;
  }>;
  // Rétrocompatibilité: garder encadrant pour les anciens plateaux
  encadrant?: {
    nom: string;
    prenom: string;
  };
}

export interface PlateauxData {
  plateaux: Record<string, Plateau[]>;
}
