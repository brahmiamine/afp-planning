import { chromium } from "playwright";
import {
  extractSportCoricoMatchSlug,
  fetchAndMapSportCoricoMatch,
} from "./app/lib/scraper/sportcorico-api.mapper.ts";
import {
  getSportCoricoParserBrowserBundle,
  resolveMatchesUrlKey,
} from "./app/lib/scraper/sportcorico-parser.js";

const SCRAPER_RESULT_PREFIX = "__AFP_SCRAPER_RESULT__=";
const PARSER_BROWSER_BUNDLE = getSportCoricoParserBrowserBundle();

let matchesUrlKey;
try {
  matchesUrlKey = resolveMatchesUrlKey(process.env.SCRAPER_MATCHES_URL_KEY);
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}

const scraperClubName = typeof process.env.SCRAPER_CLUB_NAME === "string" ? process.env.SCRAPER_CLUB_NAME.trim() : "";
const URL = `https://www.sportcorico.com/clubs/${matchesUrlKey}`;

async function runDomParser(page, parserName, ...args) {
  return page.evaluate(
    ({ bundle, parserName, args }) => {
      const parsers = new Function(bundle)();
      return parsers[parserName](document, ...args);
    },
    { bundle: PARSER_BROWSER_BUNDLE, parserName, args },
  );
}

// Fonction pour enrichir un match de la liste via l'API SportCorico
async function scrapeSingleMatch(match) {
  const slug = extractSportCoricoMatchSlug(match.url) || extractSportCoricoMatchSlug(match.id);
  if (!slug) {
    match.details = null;
    match.staff = null;
    match.error = "Slug SportCorico manquant";
    console.error(`    ❌ Erreur: ${match.error}`);
    return match;
  }

  try {
    const mapped = await fetchAndMapSportCoricoMatch(slug, scraperClubName);
    console.log(`    ✅ API: ${mapped.details?.stadium || "N/A"} | Staff: ${mapped.staff?.referee ? "Oui" : "Non"}`);
    return mapped;
  } catch (error) {
    console.error(`    ❌ Erreur: ${error.message}`);
    match.details = null;
    match.staff = null;
    match.error = error.message;
    return match;
  }
}

// Fonction pour traiter des matchs par chunks en parallèle - Optimisée
async function processInParallel(matches, concurrency = 15) {
  const results = [];
  const startTime = Date.now();

  // Utiliser Promise.allSettled pour ne pas bloquer sur les erreurs
  for (let i = 0; i < matches.length; i += concurrency) {
    const chunk = matches.slice(i, i + concurrency);
    const chunkNum = Math.floor(i / concurrency) + 1;
    const totalChunks = Math.ceil(matches.length / concurrency);

    console.log(`\n📦 Chunk ${chunkNum}/${totalChunks} (${chunk.length} matchs en parallèle)...`);

    // Utiliser allSettled pour traiter tous les matchs même en cas d'erreur
    const chunkPromises = chunk.map((match) => scrapeSingleMatch(match));

    const chunkResults = await Promise.allSettled(chunkPromises);

    // Extraire les résultats (fulfilled) ou gérer les erreurs (rejected)
    for (const result of chunkResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        console.error(`  ❌ Erreur: ${result.reason?.message || "Unknown error"}`);
        // Ajouter quand même un match vide pour garder la cohérence
        results.push({ error: result.reason?.message || "Unknown error", details: null, staff: null });
      }
    }

    // Log de progression
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const avgTime = (elapsed / (i + chunk.length)).toFixed(2);
    const remaining = matches.length - (i + chunk.length);
    const estTime = (remaining * avgTime).toFixed(1);
    console.log(`  ⏱️  Progress: ${i + chunk.length}/${matches.length} | Temps: ${elapsed}s | ETA: ${estTime}s`);
  }

  return results;
}

async function scrapeMatches() {
  console.log("🚀 Démarrage du scraper en mode headless...\n");

  // Configuration optimisée pour les environnements de production
  const isProduction = process.env.NODE_ENV === "production";

  // Arguments Chromium optimisés pour les environnements serveur
  const chromiumArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--no-first-run",
    "--no-zygote",
    "--disable-gpu",
    "--disable-web-security",
    "--disable-features=IsolateOrigins,site-per-process",
  ];

  // Lancer le navigateur en mode headless (background)
  const browser = await chromium.launch({
    headless: true,
    args: chromiumArgs,
    // Timeout augmenté en production
    timeout: isProduction ? 60000 : 30000,
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();

    // Bloquer les ressources inutiles pour accélérer le chargement initial
    await page.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      if (["image", "font", "media"].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    console.log(`📄 Navigation vers ${URL}...`);
    await page.goto(URL, {
      waitUntil: "domcontentloaded", // Plus rapide
      timeout: 20000,
    });

    // Attendre seulement que la section soit chargée (plus rapide)
    try {
      await page.waitForSelector("section.mb-10", { timeout: 5000 });
    } catch (e) {
      await page.waitForTimeout(1000); // Fallback réduit
    }

    console.log("✅ Page chargée !");
    console.log('\n🔍 Recherche de la section "LES MATCHS"...\n');

    // Trouver la section "LES MATCHS"
    const matchesSection = await page.locator("section.mb-10").first();

    if (!(await matchesSection.count())) {
      throw new Error('Section "LES MATCHS" non trouvée');
    }

    console.log('✅ Section "LES MATCHS" trouvée !\n');

    // Extraire les informations du club (logo, nom, description)
    const clubInfo = await runDomParser(page, "parseClubInfo");
    console.log(`📸 Logo du club: ${clubInfo.logo || "Non trouvé"}`);
    console.log(`🏆 Nom du club: ${clubInfo.name || "Non trouvé"}`);
    console.log(`📝 Description: ${clubInfo.description || "Non trouvé"}\n`);

    // Extraire tous les liens de matchs avec leurs dates et URLs
    const matchesWithUrls = await runDomParser(page, "parseMatchesList", scraperClubName);
    console.log(`✅ ${matchesWithUrls.length} matchs trouvés avec leurs URLs\n`);

    // Fermer le navigateur après la liste : les détails viennent de l'API.
    await page.close();
    await context.close();
    await browser.close();

    // Traiter tous les matchs en parallèle - Optimisé (15 matchs simultanés)
    const concurrency = 15; // Augmenté pour plus de vitesse
    console.log(`🔄 Démarrage de l'enrichissement API (${concurrency} matchs simultanés)...\n`);
    const startTime = Date.now();

    const scrapedMatches = await processInParallel(matchesWithUrls, concurrency);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.log(`\n⏱️  Temps total: ${duration} secondes\n`);

    // Organiser les résultats par date
    const matchesData = {};
    for (const match of scrapedMatches) {
      const date = match.date || "Date inconnue";
      if (!matchesData[date]) {
        matchesData[date] = [];
      }
      matchesData[date].push(match);
    }

    // Convertir en format JSON structuré
    const jsonData = {
      club: {
        name: clubInfo.name || "Academie Football Paris 18",
        description: clubInfo.description || "Club de Football à Paris 18",
        logo: clubInfo.logo || "",
      },
      url: URL,
      scrapedAt: new Date().toISOString(),
      matches: matchesData,
    };

    // Transmettre le résultat au processus parent. Aucune donnée métier n'est
    // écrite dans un fichier : l'application la persiste directement en DB.
    console.log(`${SCRAPER_RESULT_PREFIX}${JSON.stringify(jsonData)}`);

    console.log("\n✅ Scraping terminé avec succès !");
    console.log(`📊 Total: ${matchesWithUrls.length} matchs traités\n`);
  } catch (error) {
    console.error("❌ Erreur lors du scraping:", error);
    try {
      await browser.close();
    } catch {
      // Le navigateur peut déjà être fermé après l'extraction de la liste.
    }
    process.exit(1);
  }
}

// Lancer le scraper
scrapeMatches();
