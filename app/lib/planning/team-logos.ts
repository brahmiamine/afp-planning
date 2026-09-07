import type { DataSource, EntityManager } from 'typeorm';
import type { ClubEntity } from '@/lib/db/schemas';
import type { Entrainement, Match, Plateau } from '@/types/match';
import { readAppSettings } from '@/lib/settings-store';
import { resolveMatchLogos, type ClubLogoLookup } from '@/lib/utils/match';

type Queryable = DataSource | EntityManager;

/** Champs « équipes » exposés à l'UI pour afficher les logos à côté des noms de clubs. */
export interface TeamLogoFields {
  localTeam?: string;
  awayTeam?: string;
  localTeamLogo?: string;
  awayTeamLogo?: string;
}

export type TeamLogoResolver = (event: Match | Entrainement | Plateau | null | undefined) => TeamLogoFields;

function isMatchEvent(event: Match | Entrainement | Plateau | null | undefined): event is Match {
  return !!event && ('localTeam' in event || 'awayTeam' in event);
}

/**
 * Prépare une fonction qui, pour un événement de planning, renvoie les noms des deux équipes
 * et l'URL de leur logo. La résolution combine (dans l'ordre) : les logos déjà présents sur
 * le match (scraper), le logo du club de l'utilisateur, puis une recherche tolérante dans la
 * liste des clubs connus. Les données club (liste + logo du club) sont chargées une seule fois.
 */
export async function createTeamLogoResolver(db: Queryable, clubId: string): Promise<TeamLogoResolver> {
  // Dégradation gracieuse : si la liste des clubs ou les paramètres ne sont pas lisibles
  // (contexte de test, base partielle…), on retombe sur les seuls logos portés par le match.
  let clubs: ClubLogoLookup[] = [];
  let ownClub: { name?: string; logo?: string } = {};
  try {
    const [clubRows, settings] = await Promise.all([
      db.getRepository<ClubEntity>('Club').find({ where: { clubId } }),
      readAppSettings(db, clubId),
    ]);
    clubs = clubRows.map((row) => ({ nom: String(row.nom), logo: String(row.logo) }));
    ownClub = { name: settings.clubName, logo: settings.clubLogo };
  } catch {
    clubs = [];
    ownClub = {};
  }

  return (event) => {
    if (!isMatchEvent(event)) return {};
    const { localTeamLogo, awayTeamLogo } = resolveMatchLogos(
      {
        localTeam: event.localTeam ?? '',
        awayTeam: event.awayTeam ?? '',
        localTeamLogo: event.localTeamLogo,
        awayTeamLogo: event.awayTeamLogo,
      },
      clubs,
      ownClub,
    );
    return {
      localTeam: event.localTeam || undefined,
      awayTeam: event.awayTeam || undefined,
      localTeamLogo,
      awayTeamLogo,
    };
  };
}
