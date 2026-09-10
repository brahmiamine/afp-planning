/**
 * Pure DOM parsers for SportCorico HTML (list + detail pages).
 * Used by scraper.js (Playwright) and unit tests (jsdom fixtures).
 */

const NODE_FILTER = typeof NodeFilter !== "undefined"
  ? NodeFilter
  : {
      SHOW_TEXT: 4,
      SHOW_ELEMENT: 1,
      FILTER_ACCEPT: 1,
      FILTER_SKIP: 3,
    };

const TEXT_NODE = typeof Node !== "undefined" ? Node.TEXT_NODE : 3;
const ELEMENT_NODE = typeof Node !== "undefined" ? Node.ELEMENT_NODE : 1;

function getText(el) {
  if (!el) return "";
  const text = el.innerText ?? el.textContent ?? "";
  return String(text).trim();
}

function normalizeClubIdentity(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactClubIdentity(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function clubIdentityTokens(value) {
  return normalizeClubIdentity(value).split(" ").filter((token) => token.length >= 2);
}

function clubAcronym(clubName) {
  return clubIdentityTokens(clubName)
    .filter((token) => !/^\d+$/.test(token))
    .map((token) => token[0] ?? "")
    .join("");
}

function teamNameMatchesClub(teamName, clubName) {
  const teamNorm = normalizeClubIdentity(teamName);
  const clubNorm = normalizeClubIdentity(clubName);
  if (!teamNorm || !clubNorm) return false;
  if (teamNorm === clubNorm) return true;
  if (teamNorm.includes(clubNorm) || clubNorm.includes(teamNorm)) return true;

  const teamCompact = compactClubIdentity(teamName);
  const clubCompact = compactClubIdentity(clubName);
  if (teamCompact && clubCompact && (teamCompact.includes(clubCompact) || clubCompact.includes(teamCompact))) {
    return true;
  }

  const acronym = clubAcronym(clubName);
  if (acronym.length >= 2) {
    const teamWords = teamNorm.split(" ");
    if (teamWords[0] === acronym || teamCompact.startsWith(acronym)) return true;
  }

  const expectedTokens = clubIdentityTokens(clubName);
  if (expectedTokens.length === 0) return false;
  const actualTokens = new Set(clubIdentityTokens(teamName));
  const overlap = expectedTokens.filter((token) => actualTokens.has(token)).length;
  return overlap / expectedTokens.length >= 0.5;
}

function altMatchesClub(alt, clubName) {
  return teamNameMatchesClub(alt, clubName);
}

function isHomeMatchForClub(localTeam, clubName) {
  return teamNameMatchesClub(localTeam, clubName);
}

export function calculateMeetingTime(matchTime) {
  if (!matchTime || !matchTime.match(/^\d{2}:\d{2}$/)) return "";

  const [hours, minutes] = matchTime.split(":").map(Number);
  let totalMinutes = hours * 60 + minutes;
  totalMinutes -= 90;
  if (totalMinutes < 0) totalMinutes += 24 * 60;

  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;
  return `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
}

export function parseClubInfo(document) {

        const clubData = {
          logo: "",
          name: "",
          description: "",
        };

        // Extraire le logo - plusieurs sélecteurs pour être sûr
        const logoImg =
          document.querySelector("#logo-banner img") ||
          document.querySelector('img[itemprop="image"]') ||
          document.querySelector(".club-banner-logo img");
        if (logoImg) {
          clubData.logo = logoImg.getAttribute("src") || logoImg.getAttribute("data-src") || "";
        }

        // Extraire le nom du club (h1) - plusieurs sélecteurs
        const nameH1 =
          document.querySelector(".club-banner-text2 h1") ||
          document.querySelector("h1.text-sm.font-extrabold") ||
          document.querySelector('h1[class*="font-extrabold"]');
        if (nameH1) {
          clubData.name = nameH1.textContent.trim();
        }

        // Extraire la description du club (h2) - plusieurs sélecteurs
        const descH2 =
          document.querySelector(".club-banner-text2 h2") || document.querySelector("h2.text-xs.sm\\:text-sm") || document.querySelector("h2.mb-1");
        if (descH2) {
          clubData.description = descH2.textContent.trim();
        }

        return clubData;
      
}

export function parseMatchDetails(document) {

        // Chercher d'abord dans le div.w-full qui contient toutes les informations
        let detailSection = document.querySelector("div.w-full");

        // Si non trouvé, chercher dans la section classique
        if (!detailSection || !getText(detailSection).includes("Détails du match")) {
          detailSection = document.querySelector(".bg-white.border-l-8.border-primary.rounded-lg");

          if (!detailSection) {
            const allDivs = document.querySelectorAll("div");
            for (const div of allDivs) {
              if (
                div.classList.contains("bg-white") &&
                div.classList.contains("border-l-8") &&
                div.classList.contains("border-primary") &&
                div.classList.contains("rounded-lg")
              ) {
                detailSection = div;
                break;
              }
            }
          }

          if (!detailSection) {
            detailSection = document.querySelector('div[class*="border-primary"][class*="bg-white"]');
          }
        }

        if (!detailSection) {
          return null;
        }

        // Extraire le lien de l'itinéraire
        let itineraryLink = "";
        const itineraryDiv = detailSection.querySelector("div.flex.flex-wrap.mb-2") || detailSection.querySelector('div[class*="flex"][class*="wrap"]');

        if (itineraryDiv) {
          // Chercher un lien à l'intérieur
          const link = itineraryDiv.querySelector('a[href*="itinéraire"], a[href*="itinerary"], a[href*="maps"], a[href*="google"]');
          if (link) {
            itineraryLink = link.getAttribute("href");
          } else {
            // Si pas de lien, chercher dans tout le contenu pour un lien Google Maps
            const allLinks = detailSection.querySelectorAll("a");
            for (const link of allLinks) {
              const href = link.getAttribute("href");
              if (href && (href.includes("maps") || href.includes("google") || href.includes("itinéraire"))) {
                itineraryLink = href;
                break;
              }
            }
          }
        }

        const text = getText(detailSection).trim();
        const lines = text
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        let stadium = "";
        let fullDateTime = "";
        let competition = "";
        let address = "";
        let terrainType = "";
        let foundDateTime = false;

        // Ignorer les premières lignes de menu/navigation
        let startIndex = 0;
        let foundDetailsSection = false;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Ignorer les lignes de menu/navigation
          if (
            line === "INFORMATIONS" ||
            line === "FORMES DU MOMENT" ||
            line === "CLASSEMENT" ||
            line.toLowerCase().includes("publicité") ||
            line === ""
          ) {
            continue;
          }

          // Marquer quand on trouve "Détails du match"
          if (line.toLowerCase().includes("détails du match") || line.toLowerCase().includes("détails")) {
            foundDetailsSection = true;
            startIndex = i + 1;
            break;
          }
        }

        // Si "Détails du match" n'est pas trouvé, commencer après les lignes de menu
        if (!foundDetailsSection) {
          for (let i = 0; i < Math.min(5, lines.length); i++) {
            const line = lines[i];
            if (
              line !== "INFORMATIONS" &&
              line !== "FORMES DU MOMENT" &&
              line !== "CLASSEMENT" &&
              !line.toLowerCase().includes("publicité") &&
              line.length > 3
            ) {
              startIndex = i;
              break;
            }
          }
        }

        for (let i = startIndex; i < lines.length; i++) {
          const line = lines[i];

          // Ignorer les lignes vides ou de menu
          if (
            !line ||
            line === "INFORMATIONS" ||
            line === "FORMES DU MOMENT" ||
            line === "CLASSEMENT" ||
            line.toLowerCase().includes("publicité") ||
            line.toLowerCase() === "itinéraire" ||
            line.toLowerCase() === "itinerary"
          ) {
            continue;
          }

          // Stade : première ligne significative qui n'est pas une date, qui n'est pas "Itinéraire", et qui contient des majuscules ou des mots-clés de stade
          if (
            !stadium &&
            !line.match(/\d{2}\/\d{2}\/\d{4}/) &&
            line.length > 3 &&
            !line.toLowerCase().includes("journée") &&
            !line.toLowerCase().includes("staff") &&
            !line.toLowerCase().includes("arbitre") &&
            !line.toLowerCase().includes("type de terrain") &&
            (line.match(/^[A-Z]/) || line.match(/STADE|GYMNASE|TERRAIN|COMPLEXE|POTERNE/i))
          ) {
            stadium = line;
          }

          // Date/Heure
          const dateTimeMatch = line.match(/(\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}:\d{2})/);
          if (dateTimeMatch && !fullDateTime) {
            fullDateTime = dateTimeMatch[1];
            foundDateTime = true;
          }

          // Compétition : ligne qui contient "Journée" ou nom de compétition (après la date/heure, avant l'adresse)
          if (!competition) {
            if (line.includes("Journée")) {
              competition = line;
            } else if (
              foundDateTime &&
              !address &&
              !terrainType &&
              line.match(/[A-Z]{2,}/) &&
              !line.includes("RUE") &&
              !line.toLowerCase().includes("terrain") &&
              !line.match(/^\d{2}\/\d{2}\/\d{4}/) &&
              line !== stadium &&
              !line.toLowerCase().includes("itinéraire")
            ) {
              // Ligne de compétition potentielle (entre date et adresse)
              competition = line;
            }
          }

          // Adresse : ligne qui contient "RUE" ou un code postal (format: X RUE ... - 750XX - PARIS)
          if (!address && (line.includes("RUE") || line.match(/\d{5}\s*-\s*[A-Z]+/))) {
            address = line;
          }

          // Type de terrain : ligne qui contient "Type de terrain" ou "terrain"
          if (!terrainType && line.toLowerCase().includes("type de terrain")) {
            terrainType = line;
          } else if (!terrainType && line.toLowerCase().includes("terrain") && !line.includes("RUE")) {
            // Format alternatif : "Synthétique", "PVC", etc. (souvent après "Type de terrain :")
            if (i > 0 && lines[i - 1].toLowerCase().includes("terrain")) {
              terrainType = lines[i - 1] + " " + line;
            }
          }
        }

        // Si terrainType n'est pas trouvé, chercher dans rawText
        if (!terrainType && text.toLowerCase().includes("type de terrain")) {
          const terrainMatch = text.match(/Type\s+de\s+terrain\s*:\s*([^\n]+)/i);
          if (terrainMatch) {
            terrainType = `Type de terrain : ${terrainMatch[1].trim()}`;
          }
        }

        return {
          stadium: stadium || "",
          dateTime: fullDateTime || "",
          competition: competition || "",
          address: address || "",
          terrainType: terrainType || "",
          itineraryLink: itineraryLink || "",
          rawText: text,
        };
      
}

export function parseMatchStaff(document) {

        // Chercher directement le texte "Staff du match" pour éviter de parcourir toutes les sections
        const staffText = getText(document.body);
        if (!staffText.includes("Staff du match") && !staffText.includes("Arbitre Centre")) {
          return null;
        }

        // Chercher toutes les sections avec les mêmes classes (optimisé avec querySelector)
        const allSections = document.querySelectorAll(".bg-white.border-l-8.border-primary.rounded-lg, div.w-full");

        for (const section of allSections) {
          const text = getText(section).trim();

          // Vérifier si cette section contient "Staff du match" (rapide check)
          if (text.includes("Staff du match") || text.includes("Arbitre Centre")) {
            const lines = text
              .split("\n")
              .map((l) => l.trim())
              .filter((l) => l.length > 0);

            let staffSection = {
              referee: "",
              assistant1: "",
              assistant2: "",
              rawText: text,
            };

            for (const line of lines) {
              // Arbitre Centre - plusieurs formats possibles
              if (!staffSection.referee) {
                const refereeMatch =
                  line.match(/Arbitre\s+Centre\s*:\s*(.+?)(?:\s*Arbitre|$)/i) || line.match(/Arbitre\s+Centre\s+(.+?)(?:\s*Arbitre|$)/i);
                if (refereeMatch) {
                  staffSection.referee = refereeMatch[1].trim();
                }
              }

              // Arbitre Assistant 1
              if (!staffSection.assistant1) {
                const assistant1Match =
                  line.match(/Arbitre\s+Assistant\s+1\s*:\s*(.+?)(?:\s*Arbitre|$)/i) || line.match(/Arbitre\s+Assistant\s+1\s+(.+?)(?:\s*Arbitre|$)/i);
                if (assistant1Match) {
                  staffSection.assistant1 = assistant1Match[1].trim();
                }
              }

              // Arbitre Assistant 2
              if (!staffSection.assistant2) {
                const assistant2Match =
                  line.match(/Arbitre\s+Assistant\s+2\s*:\s*(.+?)(?:\s*Arbitre|$)/i) || line.match(/Arbitre\s+Assistant\s+2\s+(.+?)(?:\s*Arbitre|$)/i);
                if (assistant2Match) {
                  staffSection.assistant2 = assistant2Match[1].trim();
                }
              }
            }

            // Si le texte contient directement "Arbitre Centre : VALERY M." dans une seule ligne
            if (!staffSection.referee || !staffSection.assistant2) {
              const fullText = text;
              const refereeMatch = fullText.match(/Arbitre\s+Centre\s*:\s*([A-Z]+\s+[A-Z]\.?)/i);
              if (refereeMatch) {
                staffSection.referee = refereeMatch[1].trim();
              }

              const assistant2Match = fullText.match(/Arbitre\s+Assistant\s+2\s*:\s*([A-Z]+\s+[A-Z]\.?)/i);
              if (assistant2Match) {
                staffSection.assistant2 = assistant2Match[1].trim();
              }
            }

            // Si on a trouvé au moins un arbitre, retourner le staff
            if (staffSection.referee || staffSection.assistant1 || staffSection.assistant2) {
              return staffSection;
            }
          }
        }

        return null;
      
}

export function parseDetailTeamLogos(document, localTeam, awayTeam) {

          // Normalisation simple d'un nom d'équipe pour comparer alt <-> nom scrapé
          const normalize = (value) =>
            (value || "")
              .normalize("NFD")
              .replace(/[̀-ͯ]/g, "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, " ")
              .trim();

          // Une URL est un logo de club si elle pointe vers .../logos/logo-*
          // (ancien hôte api.sportcorico.com/storage/logos et nouveau stockage
          // s3.pub2.infomaniak.cloud/.../sportcorico-media/logos).
          const PLACEHOLDERS = ["ecusson", "sportcorico-black", "sport-o-solidarite", "placeholder", "logo_placeholder"];
          const isClubLogoUrl = (src) =>
            !!src &&
            /\/logos\/logo-/i.test(src) &&
            !PLACEHOLDERS.some((p) => src.toLowerCase().includes(p));

          // Un logo est "renversé" (côté équipe visiteuse) si un ancêtre proche
          // porte la classe flex-col-reverse.
          const isReversed = (el) => {
            let current = el;
            for (let i = 0; i < 12 && current && current !== document.body; i++) {
              const classes = current.className || "";
              if (typeof classes === "string" && classes.includes("flex-col-reverse")) return true;
              current = current.parentElement;
            }
            return false;
          };

          const containers = document.querySelectorAll(
            'div.p-3.bg-white.flex.items-center.justify-center.rounded-full, div[class*="p-3"][class*="bg-white"][class*="rounded-full"]',
          );

          const logos = [];
          const seen = new Set();
          for (const container of containers) {
            const img = container.querySelector("img");
            if (!img) continue;
            const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
            if (!isClubLogoUrl(src) || seen.has(src)) continue;
            seen.add(src);
            logos.push({
              src,
              alt: normalize(img.getAttribute("alt")),
              reversed: isReversed(container),
            });
          }

          if (logos.length === 0) return { localTeamLogo: "", awayTeamLogo: "" };

          const localNorm = normalize(localTeam);
          const awayNorm = normalize(awayTeam);

          // Score de recouvrement de mots entre l'alt du logo et un nom d'équipe
          const overlap = (a, b) => {
            if (!a || !b) return 0;
            const at = a.split(" ").filter((t) => t.length >= 3);
            const bt = new Set(b.split(" ").filter((t) => t.length >= 3));
            if (at.length === 0) return 0;
            return at.filter((t) => bt.has(t)).length / at.length;
          };

          let localTeamLogo = "";
          let awayTeamLogo = "";

          // 1) Association par alt (le plus fiable : l'alt = nom exact de l'équipe)
          const scored = logos.map((l) => ({
            ...l,
            scoreLocal: overlap(l.alt, localNorm),
            scoreAway: overlap(l.alt, awayNorm),
          }));
          const byLocal = [...scored].sort((a, b) => b.scoreLocal - a.scoreLocal)[0];
          const byAway = [...scored].sort((a, b) => b.scoreAway - a.scoreAway)[0];
          if (byLocal && byLocal.scoreLocal >= 0.5) localTeamLogo = byLocal.src;
          if (byAway && byAway.scoreAway >= 0.5 && byAway.src !== localTeamLogo) awayTeamLogo = byAway.src;

          // 2) Association par position (flex-col = local, flex-col-reverse = visiteur)
          if (!localTeamLogo) {
            const hit = logos.find((l) => !l.reversed && l.src !== awayTeamLogo);
            if (hit) localTeamLogo = hit.src;
          }
          if (!awayTeamLogo) {
            const hit = logos.find((l) => l.reversed && l.src !== localTeamLogo);
            if (hit) awayTeamLogo = hit.src;
          }

          // 3) Fallback : ordre du DOM (premier = local, second = visiteur)
          const rest = logos.filter((l) => l.src !== localTeamLogo && l.src !== awayTeamLogo);
          if (!localTeamLogo && rest.length) localTeamLogo = rest.shift().src;
          if (!awayTeamLogo && rest.length) awayTeamLogo = rest.shift().src;

          return { localTeamLogo: localTeamLogo || "", awayTeamLogo: awayTeamLogo || "" };
        
}

export function parseMatchesList(document, scraperClubName) {

        const section = document.querySelector("section.mb-10");
        if (!section) return [];

        const datePattern = /(\d{2}\/\d{2}\/\d{4})/;
        const matches = [];

        // Créer un array de tous les éléments avec leurs positions dans le DOM
        const allElements = [];
        const walker = document.createTreeWalker(section, NODE_FILTER.SHOW_TEXT | NODE_FILTER.SHOW_ELEMENT, {
          acceptNode: (node) => {
            if (node.nodeType === TEXT_NODE && node.textContent.trim()) {
              return NODE_FILTER.FILTER_ACCEPT;
            }
            if (node.nodeType === ELEMENT_NODE && node.tagName === "A") {
              return NODE_FILTER.FILTER_ACCEPT;
            }
            return NODE_FILTER.FILTER_SKIP;
          },
        });

        let currentDate = null;
        let node;

        while ((node = walker.nextNode())) {
          if (node.nodeType === TEXT_NODE) {
            const text = node.textContent.trim();
            const dateMatch = text.match(datePattern);
            if (dateMatch) {
              currentDate = dateMatch[1];
            }
          } else if (node.tagName === "A") {
            const linkText = node.textContent.trim();
            const href = node.getAttribute("href");

            if (href && href.includes("/match/") && linkText.length > 20) {
              const timeMatch = linkText.match(/(\d{2}:\d{2})/);
              if (timeMatch) {
                const time = timeMatch[1];
                const parts = linkText.split(time);

                if (parts.length >= 2) {
                  const beforeTime = parts[0].trim();
                  const afterTime = parts[1].trim();

                  // Extraire la compétition depuis le DOM
                  // Chercher dans div.championnat-head > div.text-center.block.text-sm
                  let competition = "";

                  // Remonter dans la hiérarchie pour trouver le conteneur du match
                  let competitionContainer = node.parentElement;
                  for (let i = 0; i < 15 && competitionContainer && competitionContainer.tagName !== "BODY"; i++) {
                    // Chercher div.championnat-head dans le conteneur
                    const championnatHead = competitionContainer.querySelector('div.championnat-head, div[class*="championnat-head"]');
                    if (championnatHead) {
                      // Chercher div.text-center.block.text-sm dans championnat-head
                      const competitionDiv = championnatHead.querySelector(
                        'div.text-center.block.text-sm, div[class*="text-center"][class*="block"][class*="text-sm"]',
                      );
                      if (competitionDiv) {
                        competition = competitionDiv.textContent.trim();
                        break;
                      }
                      // Fallback: chercher n'importe quel div.text-center dans championnat-head
                      const fallbackDiv = championnatHead.querySelector('div.text-center, div[class*="text-center"]');
                      if (fallbackDiv) {
                        competition = fallbackDiv.textContent.trim();
                        break;
                      }
                    }
                    competitionContainer = competitionContainer.parentElement;
                  }

                  // Fallback: si pas trouvé dans le DOM, utiliser la regex
                  if (!competition) {
                    const clubTokens = clubIdentityTokens(scraperClubName).slice(0, 3);
                    if (clubTokens.length > 0) {
                      const clubPattern = clubTokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
                      const competitionMatch = beforeTime.match(
                        new RegExp(`^([A-Z][A-Z0-9\\sÉÈÊÀÂ]+?)(?=\\s*(?:${clubPattern}))`, "i"),
                      );
                      if (competitionMatch) {
                        competition = competitionMatch[1].trim();
                      }
                    }
                    if (!competition) {
                      const competitionMatch = beforeTime.match(/^([A-Z][A-Z0-9\sÉÈÊÀÂ\-]+?)(?=\s+[A-Z])/);
                      if (competitionMatch) {
                        competition = competitionMatch[1].trim();
                      }
                    }
                  }

                  // Extraire l'équipe locale
                  let localTeam = beforeTime;
                  if (competition) {
                    localTeam = beforeTime.replace(competition, "").trim();
                  }

                  const awayTeam = afterTime.trim();

                  // Déterminer si le club configuré joue à domicile ou à l'extérieur
                  const isHomeMatch = isHomeMatchForClub(localTeam, scraperClubName);

                  // Extraire les logos des équipes (home et away) - Correspondance par alt
                  let homeTeamLogo = "";
                  let awayTeamLogo = "";

                  // Normaliser les noms d'équipes pour la correspondance (plus permissif)
                  const normalizeTeamName = (name) => {
                    if (!name) return "";
                    return name
                      .toLowerCase()
                      .replace(/\s+/g, " ")
                      .replace(/[^\w\s]/g, "") // Garder lettres, chiffres et espaces
                      .trim();
                  };

                  // Fonction pour vérifier si deux noms correspondent (améliorée)
                  const teamNamesMatch = (name1, name2) => {
                    if (!name1 || !name2) return false;

                    // Correspondance exacte (case-insensitive)
                    if (name1.toLowerCase().trim() === name2.toLowerCase().trim()) return true;

                    const n1 = normalizeTeamName(name1);
                    const n2 = normalizeTeamName(name2);

                    // Correspondance exacte après normalisation
                    if (n1 === n2) return true;

                    // Correspondance par inclusion (tolérance aux variations)
                    if (n1.length > 5 && n2.length > 5) {
                      // Vérifier si un nom contient l'autre ou vice versa
                      if (n1.includes(n2) || n2.includes(n1)) return true;

                      // Extraire les premiers mots significatifs (au moins 2 caractères)
                      const words1 = n1.split(" ").filter((w) => w.length >= 2);
                      const words2 = n2.split(" ").filter((w) => w.length >= 2);

                      // Vérifier si au moins 2 mots significatifs correspondent
                      let matchCount = 0;
                      let totalWords = Math.min(words1.length, words2.length);

                      // Ajuster le seuil selon le nombre de mots
                      const minMatch = totalWords >= 4 ? 3 : totalWords >= 2 ? 2 : 1;

                      for (const w1 of words1) {
                        for (const w2 of words2) {
                          // Correspondance exacte de mot ou inclusion
                          if (w1 === w2 || (w1.length >= 3 && w2.length >= 3 && (w1.includes(w2) || w2.includes(w1)))) {
                            matchCount++;
                            if (matchCount >= minMatch) return true;
                          }
                        }
                      }
                    }

                    return false;
                  };

                  const localTeamNormalized = normalizeTeamName(localTeam);
                  const awayTeamNormalized = normalizeTeamName(awayTeam);

                  // Trouver le conteneur parent du match spécifique
                  // Le conteneur d'un match est généralement: div.my-5 qui contient un seul match
                  let container = node.parentElement;
                  let bestContainer = null;

                  // PRIORITÉ 1: Chercher div.my-5 qui est le conteneur de chaque match
                  // Chaque match est dans un div.my-5 unique, et les images sont dans ce même div
                  for (let i = 0; i < 25 && container && container.tagName !== "BODY"; i++) {
                    const classes = container.classList ? container.classList.toString() : "";

                    // Chercher div.my-5 qui contient ce match spécifique
                    if (classes.includes("my-5")) {
                      // Vérifier que ce conteneur contient le lien
                      const hasLink = container.contains(node);

                      if (hasLink) {
                        // Vérifier qu'il contient aussi des images (src ou data-src)
                        const allImgs = Array.from(container.querySelectorAll("img"));
                        const hasImages = allImgs.some((img) => {
                          const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
                          return src && /\/logos\/logo-/i.test(src);
                        });

                        // Si pas d'images dans ce conteneur, c'est quand même le bon conteneur pour ce match
                        // Les images pourraient être dans un enfant direct
                        bestContainer = container;
                        break;
                      }
                    }

                    container = container.parentElement;
                  }

                  // PRIORITÉ 2: Si pas trouvé de div.my-5, chercher un conteneur avec border
                  if (!bestContainer) {
                    container = node.parentElement;
                    for (let i = 0; i < 20 && container && container.tagName !== "BODY"; i++) {
                      const classes = container.classList ? container.classList.toString() : "";

                      // Chercher un conteneur avec border qui contient les images ET le lien (src ou data-src)
                      const allImgs = Array.from(container.querySelectorAll("img"));
                      const hasImages = allImgs.some((img) => {
                        const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
                        return /\/logos\/logo-/i.test(src);
                      });
                      const hasLink = container.contains(node);

                      if (classes.includes("border") && hasImages && hasLink) {
                        bestContainer = container;
                        break;
                      }

                      container = container.parentElement;
                    }
                  }

                  // Utiliser bestContainer si trouvé
                  container = bestContainer;

                  // Si pas trouvé de div.my-5, chercher dans les parents proches
                  if (!container || container.tagName === "BODY") {
                    container = node.parentElement;
                    // Remonter jusqu'à trouver un conteneur avec my-5 ou border
                    for (let i = 0; i < 20 && container && container.tagName !== "BODY"; i++) {
                      const classes = container.classList ? container.classList.toString() : "";
                      if (classes.includes("my-5")) {
                        break;
                      }
                      container = container.parentElement;
                    }
                  }

                  // Si on n'a toujours pas trouvé de conteneur, chercher le div.block parent qui contient le lien
                  // Les images sont souvent dans un div.block qui est un parent du lien
                  if (!container || container.tagName === "BODY") {
                    let parent = node.parentElement;
                    for (let i = 0; i < 15 && parent && parent.tagName !== "BODY"; i++) {
                      const classes = parent.classList ? parent.classList.toString() : "";
                      // Chercher div.block ou div avec border qui contient le lien
                      if (classes.includes("block") || classes.includes("border") || classes.includes("border_theme")) {
                        // Vérifier si ce conteneur contient aussi des images
                        const imgs = Array.from(parent.querySelectorAll("img"));
                        const hasImgs = imgs.some((img) => {
                          const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
                          return src && /\/logos\/logo-/i.test(src);
                        });
                        if (hasImgs || !container) {
                          container = parent;
                          if (hasImgs) break;
                        }
                      }
                      parent = parent.parentElement;
                    }
                  }

                  if (container && container.tagName !== "BODY") {
                    // Collecter toutes les images de logo valides dans le conteneur ET ses enfants directs
                    // Limiter la recherche au conteneur spécifique du match pour éviter les logos d'autres matchs
                    const allImgs = Array.from(container.querySelectorAll("img"));

                    for (const img of allImgs) {
                      const src = img.getAttribute("src") || img.getAttribute("data-src") || "";

                      // Ignorer les placeholders et garder seulement les vrais logos
                      // Filtrer explicitement les logos placeholders récurrents
                      if (
                        !src ||
                        !/\/logos\/logo-/i.test(src) ||
                        src.includes("ecusson") ||
                        src.includes("sportcorico-black") ||
                        src.includes("sport-o-solidarite") ||
                        src.includes("sport-o-solidarite-848816") ||
                        src.includes("championnet-s-paris-511117")
                      ) {
                        continue;
                      }

                      // Obtenir l'attribut alt pour faire la correspondance
                      const alt = img.getAttribute("alt") || "";

                      const isClubLogo = altMatchesClub(alt, scraperClubName);

                      if (isHomeMatch) {
                        if (isClubLogo && !homeTeamLogo) {
                          homeTeamLogo = src;
                          continue;
                        }
                        if (!isClubLogo && !awayTeamLogo) {
                          const matchesAwayTeam = teamNamesMatch(alt, awayTeam);
                          if (matchesAwayTeam) {
                            awayTeamLogo = src;
                            continue;
                          }
                        }
                      } else {
                        if (isClubLogo && !awayTeamLogo) {
                          awayTeamLogo = src;
                          continue;
                        }
                        if (!isClubLogo && !homeTeamLogo) {
                          const matchesLocalTeam = teamNamesMatch(alt, localTeam);
                          if (matchesLocalTeam) {
                            homeTeamLogo = src;
                            continue;
                          }
                        }
                      }
                    }

                    // Si on n'a pas trouvé par correspondance exacte, utiliser la position dans le DOM
                    if (!homeTeamLogo || !awayTeamLogo) {
                      const validLogos = [];
                      let logoIndex = 0; // Index pour suivre l'ordre de découverte

                      for (const img of allImgs) {
                        const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
                        if (
                          src &&
                          /\/logos\/logo-/i.test(src) &&
                          !src.includes("ecusson") &&
                          !src.includes("sportcorico-black") &&
                          !src.includes("sport-o-solidarite") &&
                          !src.includes("sport-o-solidarite-848816") &&
                          !src.includes("championnet-s-paris-511117")
                        ) {
                          const alt = img.getAttribute("alt") || "";
                          const isClubLogo = altMatchesClub(alt, scraperClubName);

                          // Remonter dans la hiérarchie pour trouver flex-col ou flex-col-reverse
                          let current = img;
                          let foundFlexCol = false;
                          let isFlexColReverse = false;
                          let domOrder = logoIndex;

                          // Parcourir les parents pour trouver flex-col ou flex-col-reverse
                          for (let i = 0; i < 15 && current && current !== document.body; i++) {
                            const classes = current.className || "";
                            if (classes.includes("flex-col")) {
                              foundFlexCol = true;
                              isFlexColReverse = classes.includes("flex-col-reverse");

                              // Trouver l'ordre dans le parent
                              const parent = current.parentElement;
                              if (parent) {
                                const siblings = Array.from(parent.children).filter((child) => {
                                  const childClasses = child.className || "";
                                  return childClasses.includes("flex-col");
                                });
                                domOrder = siblings.indexOf(current);
                                if (domOrder < 0) {
                                  domOrder = Array.from(parent.children).indexOf(current);
                                }
                              }
                              break;
                            }
                            current = current.parentElement;
                          }

                          // Si pas trouvé, chercher plus haut
                          if (!foundFlexCol) {
                            current = img.parentElement;
                            for (let i = 0; i < 10 && current && current !== document.body; i++) {
                              const classes = current.className || "";
                              if (classes.includes("flex-col") || classes.includes("flex-col-reverse")) {
                                foundFlexCol = true;
                                isFlexColReverse = classes.includes("flex-col-reverse");
                                const parent = current.parentElement;
                                if (parent) {
                                  const siblings = Array.from(parent.children);
                                  domOrder = siblings.indexOf(current);
                                }
                                break;
                              }
                              current = current.parentElement;
                            }
                          }

                          const isLocalPosition = foundFlexCol && !isFlexColReverse;
                          const isAwayPosition = foundFlexCol && isFlexColReverse;

                          validLogos.push({
                            src: src,
                            alt: alt,
                            isClubLogo: isClubLogo,
                            isLocalPosition: isLocalPosition,
                            isAwayPosition: isAwayPosition,
                            domOrder: domOrder,
                            logoIndex: logoIndex,
                          });

                          logoIndex++;
                        }
                      }

                      // Trier par ordre DOM
                      validLogos.sort((a, b) => {
                        if (a.domOrder !== undefined && b.domOrder !== undefined) {
                          return a.domOrder - b.domOrder;
                        }
                        return a.logoIndex - b.logoIndex;
                      });

                      // Identifier par position et club configuré selon le venue
                      for (const logo of validLogos) {
                        if (isHomeMatch) {
                          if (logo.isClubLogo && logo.isLocalPosition && !homeTeamLogo) {
                            homeTeamLogo = logo.src;
                          }
                          if (!logo.isClubLogo && logo.isAwayPosition && !awayTeamLogo) {
                            awayTeamLogo = logo.src;
                          }
                        } else {
                          if (!logo.isClubLogo && logo.isLocalPosition && !homeTeamLogo) {
                            homeTeamLogo = logo.src;
                          }
                          if (logo.isClubLogo && logo.isAwayPosition && !awayTeamLogo) {
                            awayTeamLogo = logo.src;
                          }
                        }
                      }

                      // Fallback : utiliser le club configuré et l'ordre DOM
                      if (!homeTeamLogo || !awayTeamLogo) {
                        for (const logo of validLogos) {
                          if (isHomeMatch) {
                            if (logo.isClubLogo && !homeTeamLogo) {
                              homeTeamLogo = logo.src;
                            } else if (!logo.isClubLogo && !awayTeamLogo && logo.src !== homeTeamLogo) {
                              awayTeamLogo = logo.src;
                            }
                          } else {
                            if (!logo.isClubLogo && !homeTeamLogo) {
                              homeTeamLogo = logo.src;
                            } else if (logo.isClubLogo && !awayTeamLogo && logo.src !== homeTeamLogo) {
                              awayTeamLogo = logo.src;
                            }
                          }
                        }
                      }

                      // Dernier fallback : utiliser l'ordre DOM strict
                      if (validLogos.length >= 2) {
                        if (isHomeMatch) {
                          if (!homeTeamLogo) {
                            const clubLogo = validLogos.find((l) => l.isClubLogo);
                            homeTeamLogo = clubLogo ? clubLogo.src : validLogos[0].src;
                          }
                          if (!awayTeamLogo) {
                            const otherLogo = validLogos.find((l) => !l.isClubLogo && l.src !== homeTeamLogo);
                            awayTeamLogo = otherLogo ? otherLogo.src : validLogos[1].src;
                          }
                        } else {
                          if (!homeTeamLogo) {
                            const otherLogo = validLogos.find((l) => !l.isClubLogo);
                            homeTeamLogo = otherLogo ? otherLogo.src : validLogos[0].src;
                          }
                          if (!awayTeamLogo) {
                            const clubLogo = validLogos.find((l) => l.isClubLogo);
                            awayTeamLogo = clubLogo ? clubLogo.src : validLogos[1].src;
                          }
                        }
                      }
                    }
                  }

                  const venue = isHomeMatch ? "domicile" : "extérieur";

                  // Calculer l'horaire du rendez-vous (1h30 avant le match)
                  const calculateMeetingTime = (matchTime) => {
                    if (!matchTime || !matchTime.match(/^\d{2}:\d{2}$/)) return "";

                    const [hours, minutes] = matchTime.split(":").map(Number);
                    let totalMinutes = hours * 60 + minutes;

                    // Soustraire 1h30 (90 minutes)
                    totalMinutes -= 90;

                    // Gérer le passage à la veille si nécessaire (heure négative)
                    if (totalMinutes < 0) {
                      totalMinutes += 24 * 60; // Ajouter 24h
                    }

                    const newHours = Math.floor(totalMinutes / 60) % 24;
                    const newMinutes = totalMinutes % 60;

                    return `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
                  };

                  const horaireRendezVous = calculateMeetingTime(time);

                  // Extraire l'ID depuis l'URL (ex: /match/afp-18-u13-f-1-montmartre-s-paris-u13-f-1-wduo1)
                  const fullUrl = href.startsWith("http") ? href : `https://www.sportcorico.com${href}`;
                  const matchIdMatch = href.match(/\/match\/([^\/\?]+)/);
                  const matchId = matchIdMatch
                    ? matchIdMatch[1]
                    : href
                        .replace(/^\/match\//, "")
                        .replace(/\/$/, "")
                        .split("?")[0];

                  matches.push({
                    id: matchId, // ID extrait de l'URL
                    type: "officiel", // Type de match (officiel pour les matchs scrapés)
                    date: currentDate,
                    competition: competition,
                    localTeam: localTeam,
                    awayTeam: awayTeam,
                    venue: venue, // "domicile" ou "extérieur" pour le club configuré
                    localTeamLogo: homeTeamLogo,
                    awayTeamLogo: awayTeamLogo,
                    time: time,
                    horaireRendezVous: horaireRendezVous, // 1h30 avant le match
                    url: fullUrl,
                    rawText: linkText,
                  });
                }
              }
            }
          }
        }

        return matches;
      
}

export const PARSER_EXPORT_NAMES = [
  'parseClubInfo',
  'parseMatchesList',
  'parseMatchDetails',
  'parseMatchStaff',
  'parseDetailTeamLogos',
];
