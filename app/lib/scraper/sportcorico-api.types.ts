/**
 * DTOs of the live SportCorico match API.
 * These types describe the external payload, not the internal Match model.
 */

export interface SportCoricoOfficial {
  id: number;
  official_scraping_id?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  sort_order?: number;
}

export interface SportCoricoInfrastructure {
  id?: number;
  name?: string;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  surface_type?: string | null;
}

export interface SportCoricoMatchApi {
  id: number;
  slug: string;

  home_team?: number;
  home_team_slug?: string;
  home_team_name: string;
  home_team_club_slug?: string;
  home_team_club_name?: string;
  home_club_name?: string;
  home_team_logo?: string;
  home_logo?: string;

  outside_team?: number;
  outside_team_slug?: string;
  outside_team_name: string;
  outside_team_club_slug?: string;
  outside_team_club_name?: string;
  outside_club_name?: string;
  outside_team_logo?: string;
  outside_logo?: string;

  category_name?: string;
  home_team_category_and_code_name?: string;
  outside_team_category_and_code_name?: string;

  location?: string;
  planned_date?: string;
  planned_time?: string;

  day?: string;

  championship_name?: string;
  championship_slug?: string;

  pool_name?: string;
  pool_slug?: string;

  phase_name?: string;
  phase_slug?: string;

  status?: string;

  officials?: SportCoricoOfficial[];
  infrastructure?: SportCoricoInfrastructure;
}

export interface SportCoricoMatchApiResponse {
  success?: boolean;
  match: SportCoricoMatchApi;
}

export interface SportCoricoClubMatchGroup {
  date?: string;
  matches?: SportCoricoMatchApi[];
}

export interface SportCoricoClubApi {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  logo_filename?: string;
  logo?: string;
  previousMatches?: SportCoricoClubMatchGroup[];
  previous_matches?: SportCoricoClubMatchGroup[];
  previous_games?: SportCoricoClubMatchGroup[];
  currentMatches?: SportCoricoClubMatchGroup[];
  current_matches?: SportCoricoClubMatchGroup[];
  current_games?: SportCoricoClubMatchGroup[];
  nextMatches?: SportCoricoClubMatchGroup[];
  next_matches?: SportCoricoClubMatchGroup[];
  next_games?: SportCoricoClubMatchGroup[];
}

export interface SportCoricoClubApiResponse {
  success?: boolean;
  club: SportCoricoClubApi;
}
