export type PersonType = 'officiel' | 'encadrant' | 'accompagnateur';
export type AssignmentStatus = 'pending' | 'accepted' | 'declined';

export interface AssignmentContact {
  nom: string;
  numero: string;
  personId?: number;
  personType?: PersonType;
  status?: AssignmentStatus;
  assignedAt?: string;
  respondedAt?: string;
}

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
  id?: string;
  type?: MatchType;
  date: string;
  competition: string;
  categorie?: string;
  localTeam: string;
  awayTeam: string;
  venue: 'domicile' | 'extérieur';
  localTeamLogo?: string;
  awayTeamLogo?: string;
  time: string;
  horaireRendezVous: string;
  durationMinutes?: number;
  seriesId?: string;
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

export interface MatchesAmicauxData {
  matches: Record<string, Match[]>;
}

export interface Entrainement {
  id: string;
  type: 'entrainement';
  date: string;
  time: string;
  lieu: string;
  categorie?: string;
  durationMinutes?: number;
  seriesId?: string;
  encadrants?: AssignmentContact[];
  encadrant?: {
    nom: string;
    prenom: string;
  };
}

export interface EntrainementsData {
  entrainements: Record<string, Entrainement[]>;
}

export interface Plateau {
  id: string;
  type: 'plateau';
  date: string;
  time: string;
  lieu: string;
  categories?: string[];
  durationMinutes?: number;
  seriesId?: string;
  encadrants?: AssignmentContact[];
  encadrant?: {
    nom: string;
    prenom: string;
  };
}

export interface PlateauxData {
  plateaux: Record<string, Plateau[]>;
}
