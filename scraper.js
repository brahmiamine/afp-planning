import { chromium } from "playwright";
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

// Fonction pour scraper un seul match - Optimisée
async function scrapeSingleMatch(browser, match, index, total) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    // Optimisations de performance
    ignoreHTTPSErrors: true,
    bypassCSP: true,
  });
  const page = await context.newPage();

  try {
    // Bloquer les ressources inutiles pour accélérer
    await page.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      // Bloquer les images, fonts, media (mais garder les scripts et styles)
      if (["image", "font", "media"].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    // Naviguer vers la page du match - Optimisé
    await page.goto(match.url, {
      waitUntil: "domcontentloaded", // Plus rapide que networkidle
      timeout: 20000,
    });

    // Attendre seulement que le contenu essentiel soit chargé (sélecteur principal)
    try {
      await Promise.race([
        page.waitForSelector(".bg-white.border-l-8, div.w-full", { timeout: 5000 }),
        page.waitForTimeout(800), // Fallback timeout réduit
      ]);
    } catch (e) {
      // Si le sélecteur n'est pas trouvé, continuer quand même
    }

    // Extraire les détails du match
    const matchDetails = await runDomParser(page, "parseMatchDetails");
    // Extraire les logos des équipes depuis la page de détail - Plus fiable
    // Passer les noms d'équipes pour déterminer le venue
    const localTeam = match.localTeam || "";
    const awayTeam = match.awayTeam || "";

    // S'assurer que les conteneurs de logos sont rendus avant l'extraction
    try {
      await page.waitForSelector(
        'div[class*="p-3"][class*="bg-white"][class*="rounded-full"] img',
        { timeout: 3000 },
      );
    } catch (e) {
      // Continuer même si absent : les fallbacks côté app prendront le relais
    }

    const teamLogos = await runDomParser(page, "parseDetailTeamLogos", localTeam, awayTeam);
    // Extraire le staff du match si disponible - Optimisé
    const matchStaff = await runDomParser(page, "parseMatchStaff");
    if (matchDetails && matchDetails.rawText) {
      match.details = matchDetails;

      // Ajouter le staff si disponible
      if (matchStaff) {
        match.staff = matchStaff;
        console.log(`    ✅ Extraits: ${matchDetails.stadium || "N/A"} | Staff: ${matchStaff.referee ? "Oui" : "Non"}`);
      } else {
        match.staff = null;
        console.log(`    ✅ Extraits: ${matchDetails.stadium || "N/A"}`);
      }
    } else {
      match.details = null;
      match.staff = null;
      console.log(`    ⚠️  Détails non trouvés`);
    }

    // Mettre à jour les logos depuis la page de détail (plus fiable que la liste)
    // Les logos de la page de détail remplacent ceux de la liste car ils sont plus fiables
    if (teamLogos) {
      if (teamLogos.localTeamLogo) {
        match.localTeamLogo = teamLogos.localTeamLogo;
      }
      if (teamLogos.awayTeamLogo) {
        match.awayTeamLogo = teamLogos.awayTeamLogo;
      }
    }

    if (matchDetails?.categorie) {
      match.categorie = matchDetails.categorie;
    }

    match.url = page.url();

    await context.close();
    return match;
  } catch (error) {
    console.error(`    ❌ Erreur: ${error.message}`);
    match.details = null;
    match.error = error.message;
    await context.close();
    return match;
  }
}

// Fonction pour traiter des matchs par chunks en parallèle - Optimisée
async function processInParallel(browser, matches, concurrency = 15) {
  const results = [];
  const startTime = Date.now();

  // Utiliser Promise.allSettled pour ne pas bloquer sur les erreurs
  for (let i = 0; i < matches.length; i += concurrency) {
    const chunk = matches.slice(i, i + concurrency);
    const chunkNum = Math.floor(i / concurrency) + 1;
    const totalChunks = Math.ceil(matches.length / concurrency);

    console.log(`\n📦 Chunk ${chunkNum}/${totalChunks} (${chunk.length} matchs en parallèle)...`);

    // Utiliser allSettled pour traiter tous les matchs même en cas d'erreur
    const chunkPromises = chunk.map((match, idx) => scrapeSingleMatch(browser, match, i + idx, matches.length));

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

    // Fermer la page principale après avoir extrait les URLs
    await page.close();
    await context.close();

    // Traiter tous les matchs en parallèle - Optimisé (15 matchs simultanés)
    const concurrency = 15; // Augmenté pour plus de vitesse
    console.log(`🔄 Démarrage du scraping en parallèle (${concurrency} matchs simultanés)...\n`);
    const startTime = Date.now();

    const scrapedMatches = await processInParallel(browser, matchesWithUrls, concurrency);

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

    // Fermer le navigateur
    await browser.close();

    console.log("\n✅ Scraping terminé avec succès !");
    console.log(`📊 Total: ${matchesWithUrls.length} matchs traités\n`);
  } catch (error) {
    console.error("❌ Erreur lors du scraping:", error);
    await browser.close();
    process.exit(1);
  }
}

// Lancer le scraper
scrapeMatches();
