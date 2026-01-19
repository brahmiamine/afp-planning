import { chromium } from 'playwright';
import fs from 'fs';

const URL = 'https://www.sportcorico.com/clubs/academie-football-paris-18';

// Fonction pour scraper un seul match - Optimisée
async function scrapeSingleMatch(browser, match, index, total) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    // Optimisations de performance
    ignoreHTTPSErrors: true,
    bypassCSP: true
  });
  const page = await context.newPage();
  
  try {
    // Bloquer les ressources inutiles pour accélérer
    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      // Bloquer les images, fonts, media (mais garder les scripts et styles)
      if (['image', 'font', 'media'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });
    
    // Naviguer vers la page du match - Optimisé
    await page.goto(match.url, {
      waitUntil: 'domcontentloaded', // Plus rapide que networkidle
      timeout: 20000
    });
    
    // Attendre seulement que le contenu essentiel soit chargé (sélecteur principal)
    try {
      await Promise.race([
        page.waitForSelector('.bg-white.border-l-8, div.w-full', { timeout: 5000 }),
        page.waitForTimeout(800) // Fallback timeout réduit
      ]);
    } catch (e) {
      // Si le sélecteur n'est pas trouvé, continuer quand même
    }
    
    // Extraire les détails du match
    const matchDetails = await page.evaluate(() => {
      // Chercher d'abord dans le div.w-full qui contient toutes les informations
      let detailSection = document.querySelector('div.w-full');
      
      // Si non trouvé, chercher dans la section classique
      if (!detailSection || !detailSection.innerText.includes('Détails du match')) {
        detailSection = document.querySelector('.bg-white.border-l-8.border-primary.rounded-lg');
        
        if (!detailSection) {
          const allDivs = document.querySelectorAll('div');
          for (const div of allDivs) {
            if (div.classList.contains('bg-white') && 
                div.classList.contains('border-l-8') && 
                div.classList.contains('border-primary') && 
                div.classList.contains('rounded-lg')) {
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
      let itineraryLink = '';
      const itineraryDiv = detailSection.querySelector('div.flex.flex-wrap.mb-2') || 
                          detailSection.querySelector('div[class*="flex"][class*="wrap"]');
      
      if (itineraryDiv) {
        // Chercher un lien à l'intérieur
        const link = itineraryDiv.querySelector('a[href*="itinéraire"], a[href*="itinerary"], a[href*="maps"], a[href*="google"]');
        if (link) {
          itineraryLink = link.getAttribute('href');
        } else {
          // Si pas de lien, chercher dans tout le contenu pour un lien Google Maps
          const allLinks = detailSection.querySelectorAll('a');
          for (const link of allLinks) {
            const href = link.getAttribute('href');
            if (href && (href.includes('maps') || href.includes('google') || href.includes('itinéraire'))) {
              itineraryLink = href;
              break;
            }
          }
        }
      }
      
      const text = detailSection.innerText.trim();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      let stadium = '';
      let fullDateTime = '';
      let competition = '';
      let address = '';
      let terrainType = '';
      let foundDateTime = false;
      
      // Ignorer les premières lignes de menu/navigation
      let startIndex = 0;
      let foundDetailsSection = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Ignorer les lignes de menu/navigation
        if (line === 'INFORMATIONS' || 
            line === 'FORMES DU MOMENT' || 
            line === 'CLASSEMENT' || 
            line.toLowerCase().includes('publicité') ||
            line === '') {
          continue;
        }
        
        // Marquer quand on trouve "Détails du match"
        if (line.toLowerCase().includes('détails du match') || line.toLowerCase().includes('détails')) {
          foundDetailsSection = true;
          startIndex = i + 1;
          break;
        }
      }
      
      // Si "Détails du match" n'est pas trouvé, commencer après les lignes de menu
      if (!foundDetailsSection) {
        for (let i = 0; i < Math.min(5, lines.length); i++) {
          const line = lines[i];
          if (line !== 'INFORMATIONS' && 
              line !== 'FORMES DU MOMENT' && 
              line !== 'CLASSEMENT' &&
              !line.toLowerCase().includes('publicité') &&
              line.length > 3) {
            startIndex = i;
            break;
          }
        }
      }
      
      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        
        // Ignorer les lignes vides ou de menu
        if (!line || 
            line === 'INFORMATIONS' || 
            line === 'FORMES DU MOMENT' || 
            line === 'CLASSEMENT' ||
            line.toLowerCase().includes('publicité') ||
            line.toLowerCase() === 'itinéraire' ||
            line.toLowerCase() === 'itinerary') {
          continue;
        }
        
        // Stade : première ligne significative qui n'est pas une date, qui n'est pas "Itinéraire", et qui contient des majuscules ou des mots-clés de stade
        if (!stadium && 
            !line.match(/\d{2}\/\d{2}\/\d{4}/) && 
            line.length > 3 && 
            !line.toLowerCase().includes('journée') &&
            !line.toLowerCase().includes('staff') &&
            !line.toLowerCase().includes('arbitre') &&
            !line.toLowerCase().includes('type de terrain') &&
            (line.match(/^[A-Z]/) || line.match(/STADE|GYMNASE|TERRAIN|COMPLEXE|POTERNE/i))) {
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
          if (line.includes('Journée')) {
            competition = line;
          } else if (foundDateTime && !address && !terrainType &&
                     line.match(/[A-Z]{2,}/) && 
                     !line.includes('RUE') && 
                     !line.toLowerCase().includes('terrain') &&
                     !line.match(/^\d{2}\/\d{2}\/\d{4}/) &&
                     line !== stadium &&
                     !line.toLowerCase().includes('itinéraire')) {
            // Ligne de compétition potentielle (entre date et adresse)
            competition = line;
          }
        }
        
        // Adresse : ligne qui contient "RUE" ou un code postal (format: X RUE ... - 750XX - PARIS)
        if (!address && (line.includes('RUE') || line.match(/\d{5}\s*-\s*[A-Z]+/))) {
          address = line;
        }
        
        // Type de terrain : ligne qui contient "Type de terrain" ou "terrain"
        if (!terrainType && line.toLowerCase().includes('type de terrain')) {
          terrainType = line;
        } else if (!terrainType && line.toLowerCase().includes('terrain') && !line.includes('RUE')) {
          // Format alternatif : "Synthétique", "PVC", etc. (souvent après "Type de terrain :")
          if (i > 0 && lines[i-1].toLowerCase().includes('terrain')) {
            terrainType = lines[i-1] + ' ' + line;
          }
        }
      }
      
      // Si terrainType n'est pas trouvé, chercher dans rawText
      if (!terrainType && text.toLowerCase().includes('type de terrain')) {
        const terrainMatch = text.match(/Type\s+de\s+terrain\s*:\s*([^\n]+)/i);
        if (terrainMatch) {
          terrainType = `Type de terrain : ${terrainMatch[1].trim()}`;
        }
      }
      
      return {
        stadium: stadium || '',
        dateTime: fullDateTime || '',
        competition: competition || '',
        address: address || '',
        terrainType: terrainType || '',
        itineraryLink: itineraryLink || '',
        rawText: text
      };
    });
    
    // Extraire les logos des équipes depuis la page de détail - Plus fiable
    // Passer les noms d'équipes pour déterminer le venue
    const localTeam = match.localTeam || '';
    const awayTeam = match.awayTeam || '';
    const isHomeMatch = (localTeam.toLowerCase().includes('afp') || localTeam.toLowerCase().includes('afp 18'));
    
    const teamLogos = await page.evaluate(({ localTeam, awayTeam, isHomeMatch }) => {
      let localTeamLogo = '';
      let awayTeamLogo = '';
      
      // Chercher toutes les images de logo dans les div avec classes "p-3 bg-white flex items-center justify-center rounded-full"
      const logoContainers = document.querySelectorAll('div.p-3.bg-white.flex.items-center.justify-center.rounded-full, div[class*="p-3"][class*="bg-white"][class*="rounded-full"]');
      
      const logos = [];
      for (const container of logoContainers) {
        // Chercher l'image dans le conteneur (peut être dans un <a> ou directement)
        const img = container.querySelector('img[src*="storage/logos"], img[data-src*="storage/logos"]');
        if (img) {
          const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
          const alt = (img.getAttribute('alt') || '').toLowerCase();
          
          // Ignorer les placeholders
          if (src && 
              src.includes('api.sportcorico.com/storage/logos') && 
              !src.includes('ecusson') && 
              !src.includes('sportcorico-black') &&
              !src.includes('sport-o-solidarite') &&
              !src.includes('championnet-s-paris-511117')) {
            
            // Déterminer la position selon la structure DOM
            // Match à domicile : logo AFP dans div.flex-col (sans flex-col-reverse) - premier logo
            // Match à l'extérieur : logo AFP dans div.flex-col-reverse - deuxième logo
            const isAfp = alt.includes('afp');
            
            // Remonter dans la hiérarchie pour trouver le conteneur parent avec flex-col ou flex-col-reverse
            // Chercher dans div.flex-col.custom-container ou div[class*="flex-col"][class*="custom-container"]
            let current = container;
            let foundFlexCol = false;
            let isFlexColReverse = false;
            let domOrder = 0; // Ordre dans le DOM (0 = premier, 1 = deuxième)
            
            // Parcourir les parents pour trouver le conteneur principal avec flex-col
            // Le conteneur principal est généralement : div.flex-col.custom-container ou div[class*="flex-col"]
            for (let i = 0; i < 15 && current && current !== document.body; i++) {
              const classes = current.className || '';
              
              // Chercher le conteneur principal avec flex-col (peut être custom-container ou autre)
              if (classes.includes('flex-col')) {
                foundFlexCol = true;
                isFlexColReverse = classes.includes('flex-col-reverse');
                
                // Trouver le parent pour déterminer l'ordre
                const parent = current.parentElement;
                if (parent) {
                  // Chercher les enfants directs qui contiennent flex-col
                  const siblings = Array.from(parent.children).filter(child => {
                    const childClasses = child.className || '';
                    return childClasses.includes('flex-col');
                  });
                  domOrder = siblings.indexOf(current);
                  
                  // Si pas trouvé, utiliser l'ordre général des enfants
                  if (domOrder < 0) {
                    domOrder = Array.from(parent.children).indexOf(current);
                  }
                }
                break;
              }
              current = current.parentElement;
            }
            
            // Si pas trouvé, chercher plus haut dans la hiérarchie (jusqu'à 20 niveaux)
            if (!foundFlexCol) {
              current = container;
              for (let i = 0; i < 20 && current && current !== document.body; i++) {
                const classes = current.className || '';
                if (classes.includes('flex-col') || classes.includes('flex-col-reverse')) {
                  foundFlexCol = true;
                  isFlexColReverse = classes.includes('flex-col-reverse');
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
            
            // Déterminer la position selon le venue
            // Match à domicile : logo dans flex-col (sans reverse) = local, logo dans flex-col-reverse = away
            // Match à l'extérieur : logo dans flex-col (sans reverse) = local (autre équipe), logo dans flex-col-reverse = away (AFP)
            const isLocalPosition = foundFlexCol && !isFlexColReverse;
            const isAwayPosition = foundFlexCol && isFlexColReverse;
            
            logos.push({
              src: src,
              alt: alt,
              isAfp: isAfp,
              isLocalPosition: isLocalPosition,
              isAwayPosition: isAwayPosition,
              domOrder: domOrder,
              element: container
            });
          }
        }
      }
      
      // Trier les logos par ordre DOM
      logos.sort((a, b) => a.domOrder - b.domOrder);
      
      // Identifier les logos selon le venue
      // PRIORITÉ 1: Correspondance par AFP selon venue
      for (const logo of logos) {
        if (isHomeMatch) {
          // Match à domicile : AFP = localTeamLogo (premier dans DOM, sans flex-col-reverse)
          if (logo.isAfp && !localTeamLogo && logo.isLocalPosition) {
            localTeamLogo = logo.src;
          }
        } else {
          // Match à l'extérieur : AFP = awayTeamLogo (deuxième dans DOM, avec flex-col-reverse)
          if (logo.isAfp && !awayTeamLogo && logo.isAwayPosition) {
            awayTeamLogo = logo.src;
          }
        }
      }
      
      // PRIORITÉ 1b: Si pas trouvé par position, utiliser AFP sans condition de position
      for (const logo of logos) {
        if (isHomeMatch) {
          if (logo.isAfp && !localTeamLogo) {
            localTeamLogo = logo.src;
          }
        } else {
          if (logo.isAfp && !awayTeamLogo) {
            awayTeamLogo = logo.src;
          }
        }
      }
      
      // PRIORITÉ 2: Identifier par position selon venue
      for (const logo of logos) {
        if (isHomeMatch) {
          // Match à domicile : localPosition = local, awayPosition = away
          if (logo.isLocalPosition && !localTeamLogo && logo.src !== localTeamLogo) {
            localTeamLogo = logo.src;
          }
          if (logo.isAwayPosition && !awayTeamLogo && logo.src !== localTeamLogo) {
            awayTeamLogo = logo.src;
          }
        } else {
          // Match à l'extérieur : localPosition = away (autre équipe), awayPosition = local (AFP)
          if (logo.isAwayPosition && !localTeamLogo && logo.src !== awayTeamLogo) {
            localTeamLogo = logo.src;
          }
          if (logo.isLocalPosition && !awayTeamLogo && logo.src !== localTeamLogo) {
            awayTeamLogo = logo.src;
          }
        }
      }
      
      // PRIORITÉ 3: Identifier le logo restant (non-AFP si domicile, AFP si extérieur)
      if (isHomeMatch) {
        // Match à domicile : chercher le non-AFP pour away
        if (!awayTeamLogo) {
          for (const logo of logos) {
            if (!logo.isAfp && logo.src !== localTeamLogo) {
              awayTeamLogo = logo.src;
              break;
            }
          }
        }
      } else {
        // Match à l'extérieur : chercher le non-AFP pour local
        if (!localTeamLogo) {
          for (const logo of logos) {
            if (!logo.isAfp && logo.src !== awayTeamLogo) {
              localTeamLogo = logo.src;
              break;
            }
          }
        }
      }
      
      // PRIORITÉ 4: Si pas trouvé, utiliser l'ordre selon venue
      if (!localTeamLogo || !awayTeamLogo) {
        const validLogos = logos.filter(l => l.src);
        if (validLogos.length >= 2) {
          if (isHomeMatch) {
            // Match à domicile : premier = local (AFP), second = away
            const afpLogo = validLogos.find(l => l.isAfp);
            const otherLogo = validLogos.find(l => !l.isAfp);
            if (!localTeamLogo && afpLogo) localTeamLogo = afpLogo.src;
            if (!awayTeamLogo && otherLogo) awayTeamLogo = otherLogo.src;
            // Fallback : ordre DOM
            if (!localTeamLogo) localTeamLogo = validLogos[0].src;
            if (!awayTeamLogo) awayTeamLogo = validLogos[1].src;
          } else {
            // Match à l'extérieur : premier = local (autre), second = away (AFP)
            const afpLogo = validLogos.find(l => l.isAfp);
            const otherLogo = validLogos.find(l => !l.isAfp);
            if (!localTeamLogo && otherLogo) localTeamLogo = otherLogo.src;
            if (!awayTeamLogo && afpLogo) awayTeamLogo = afpLogo.src;
            // Fallback : ordre DOM
            if (!localTeamLogo) localTeamLogo = validLogos[0].src;
            if (!awayTeamLogo) awayTeamLogo = validLogos[1].src;
          }
        } else if (validLogos.length === 1) {
          // Si un seul logo, déterminer par AFP et venue
          if (isHomeMatch) {
            if (validLogos[0].isAfp && !localTeamLogo) {
              localTeamLogo = validLogos[0].src;
            } else if (!awayTeamLogo) {
              awayTeamLogo = validLogos[0].src;
            }
          } else {
            if (validLogos[0].isAfp && !awayTeamLogo) {
              awayTeamLogo = validLogos[0].src;
            } else if (!localTeamLogo) {
              localTeamLogo = validLogos[0].src;
            }
          }
        }
      }
      
      return {
        localTeamLogo: localTeamLogo || '',
        awayTeamLogo: awayTeamLogo || ''
      };
    }, { localTeam, awayTeam, isHomeMatch });
    
    // Extraire le staff du match si disponible - Optimisé
    const matchStaff = await page.evaluate(() => {
      // Chercher directement le texte "Staff du match" pour éviter de parcourir toutes les sections
      const staffText = document.body.innerText;
      if (!staffText.includes('Staff du match') && !staffText.includes('Arbitre Centre')) {
        return null;
      }
      
      // Chercher toutes les sections avec les mêmes classes (optimisé avec querySelector)
      const allSections = document.querySelectorAll('.bg-white.border-l-8.border-primary.rounded-lg, div.w-full');
      
      for (const section of allSections) {
        const text = section.innerText.trim();
        
        // Vérifier si cette section contient "Staff du match" (rapide check)
        if (text.includes('Staff du match') || text.includes('Arbitre Centre')) {
          const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          
          let staffSection = {
            referee: '',
            assistant1: '',
            assistant2: '',
            rawText: text
          };
          
          for (const line of lines) {
            // Arbitre Centre - plusieurs formats possibles
            if (!staffSection.referee) {
              const refereeMatch = line.match(/Arbitre\s+Centre\s*:\s*(.+?)(?:\s*Arbitre|$)/i) ||
                                   line.match(/Arbitre\s+Centre\s+(.+?)(?:\s*Arbitre|$)/i);
              if (refereeMatch) {
                staffSection.referee = refereeMatch[1].trim();
              }
            }
            
            // Arbitre Assistant 1
            if (!staffSection.assistant1) {
              const assistant1Match = line.match(/Arbitre\s+Assistant\s+1\s*:\s*(.+?)(?:\s*Arbitre|$)/i) ||
                                      line.match(/Arbitre\s+Assistant\s+1\s+(.+?)(?:\s*Arbitre|$)/i);
              if (assistant1Match) {
                staffSection.assistant1 = assistant1Match[1].trim();
              }
            }
            
            // Arbitre Assistant 2
            if (!staffSection.assistant2) {
              const assistant2Match = line.match(/Arbitre\s+Assistant\s+2\s*:\s*(.+?)(?:\s*Arbitre|$)/i) ||
                                      line.match(/Arbitre\s+Assistant\s+2\s+(.+?)(?:\s*Arbitre|$)/i);
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
    });
    
    if (matchDetails && matchDetails.rawText) {
      match.details = matchDetails;
      
      // Ajouter le staff si disponible
      if (matchStaff) {
        match.staff = matchStaff;
        console.log(`    ✅ Extraits: ${matchDetails.stadium || 'N/A'} | Staff: ${matchStaff.referee ? 'Oui' : 'Non'}`);
      } else {
        match.staff = null;
        console.log(`    ✅ Extraits: ${matchDetails.stadium || 'N/A'}`);
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
    const chunkPromises = chunk.map((match, idx) => 
      scrapeSingleMatch(browser, match, i + idx, matches.length)
    );
    
    const chunkResults = await Promise.allSettled(chunkPromises);
    
    // Extraire les résultats (fulfilled) ou gérer les erreurs (rejected)
    for (const result of chunkResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error(`  ❌ Erreur: ${result.reason?.message || 'Unknown error'}`);
        // Ajouter quand même un match vide pour garder la cohérence
        results.push({ error: result.reason?.message || 'Unknown error', details: null, staff: null });
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
  console.log('🚀 Démarrage du scraper en mode headless...\n');
  
  // Configuration optimisée pour Railway et autres environnements de production
  const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT;
  
  // Arguments Chromium optimisés pour les environnements serveur
  const chromiumArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process'
  ];
  
  // Lancer le navigateur en mode headless (background)
  const browser = await chromium.launch({
    headless: true,
    args: chromiumArgs,
    // Timeout augmenté pour Railway
    timeout: isProduction ? 60000 : 30000
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true
    });
    
    const page = await context.newPage();
    
    // Bloquer les ressources inutiles pour accélérer le chargement initial
    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (['image', 'font', 'media'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });
    
    console.log(`📄 Navigation vers ${URL}...`);
    await page.goto(URL, {
      waitUntil: 'domcontentloaded', // Plus rapide
      timeout: 20000
    });

    // Attendre seulement que la section soit chargée (plus rapide)
    try {
      await page.waitForSelector('section.mb-10', { timeout: 5000 });
    } catch (e) {
      await page.waitForTimeout(1000); // Fallback réduit
    }

    console.log('✅ Page chargée !');
    console.log('\n🔍 Recherche de la section "LES MATCHS"...\n');

    // Trouver la section "LES MATCHS"
    const matchesSection = await page.locator('section.mb-10').first();
    
    if (!(await matchesSection.count())) {
      throw new Error('Section "LES MATCHS" non trouvée');
    }

    console.log('✅ Section "LES MATCHS" trouvée !\n');

    // Extraire les informations du club (logo, nom, description)
    const clubInfo = await page.evaluate(() => {
      const clubData = {
        logo: '',
        name: '',
        description: ''
      };
      
      // Extraire le logo - plusieurs sélecteurs pour être sûr
      const logoImg = document.querySelector('#logo-banner img') ||
                      document.querySelector('img[itemprop="image"]') ||
                      document.querySelector('.club-banner-logo img');
      if (logoImg) {
        clubData.logo = logoImg.getAttribute('src') || logoImg.getAttribute('data-src') || '';
      }
      
      // Extraire le nom du club (h1) - plusieurs sélecteurs
      const nameH1 = document.querySelector('.club-banner-text2 h1') ||
                      document.querySelector('h1.text-sm.font-extrabold') ||
                      document.querySelector('h1[class*="font-extrabold"]');
      if (nameH1) {
        clubData.name = nameH1.textContent.trim();
      }
      
      // Extraire la description du club (h2) - plusieurs sélecteurs
      const descH2 = document.querySelector('.club-banner-text2 h2') ||
                      document.querySelector('h2.text-xs.sm\\:text-sm') ||
                      document.querySelector('h2.mb-1');
      if (descH2) {
        clubData.description = descH2.textContent.trim();
      }
      
      return clubData;
    });

    console.log(`📸 Logo du club: ${clubInfo.logo || 'Non trouvé'}`);
    console.log(`🏆 Nom du club: ${clubInfo.name || 'Non trouvé'}`);
    console.log(`📝 Description: ${clubInfo.description || 'Non trouvé'}\n`);

    // Extraire tous les liens de matchs avec leurs dates et URLs
    const matchesWithUrls = await page.evaluate(() => {
      const section = document.querySelector('section.mb-10');
      if (!section) return [];

      const datePattern = /(\d{2}\/\d{2}\/\d{4})/;
      const matches = [];
      
      // Créer un array de tous les éléments avec leurs positions dans le DOM
      const allElements = [];
      const walker = document.createTreeWalker(
        section,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
              return NodeFilter.FILTER_ACCEPT;
            }
            if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'A') {
              return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
          }
        }
      );
      
      let currentDate = null;
      let node;
      
      while (node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          const dateMatch = text.match(datePattern);
          if (dateMatch) {
            currentDate = dateMatch[1];
          }
        } else if (node.tagName === 'A') {
          const linkText = node.textContent.trim();
          const href = node.getAttribute('href');
          
          if (href && href.includes('/match/') && linkText.length > 20) {
            const timeMatch = linkText.match(/(\d{2}:\d{2})/);
            if (timeMatch) {
              const time = timeMatch[1];
              const parts = linkText.split(time);
              
              if (parts.length >= 2) {
                const beforeTime = parts[0].trim();
                const afterTime = parts[1].trim();
                
                // Extraire la compétition depuis le DOM
                // Chercher dans div.championnat-head > div.text-center.block.text-sm
                let competition = '';
                
                // Remonter dans la hiérarchie pour trouver le conteneur du match
                let competitionContainer = node.parentElement;
                for (let i = 0; i < 15 && competitionContainer && competitionContainer.tagName !== 'BODY'; i++) {
                  // Chercher div.championnat-head dans le conteneur
                  const championnatHead = competitionContainer.querySelector('div.championnat-head, div[class*="championnat-head"]');
                  if (championnatHead) {
                    // Chercher div.text-center.block.text-sm dans championnat-head
                    const competitionDiv = championnatHead.querySelector('div.text-center.block.text-sm, div[class*="text-center"][class*="block"][class*="text-sm"]');
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
                  const competitionMatch = beforeTime.match(/^([A-Z][A-Z0-9\sÉÈÊÀÂ]+?)(?=\s*(?:Afp|AFP))/i) ||
                                          beforeTime.match(/^([A-Z][A-Z0-9\sÉÈÊÀÂ\-]+?)(?=\s+[A-Z])/);
                  if (competitionMatch) {
                    competition = competitionMatch[1].trim();
                  }
                }
                
                // Extraire l'équipe locale
                let localTeam = beforeTime;
                if (competition) {
                  localTeam = beforeTime.replace(competition, '').trim();
                }
                
                const awayTeam = afterTime.trim();
                
                // Déterminer si Afp 18 joue à domicile ou à l'extérieur AVANT d'extraire les logos
                const localTeamLower = localTeam.toLowerCase();
                const isHomeMatch = localTeamLower.includes('afp') || localTeamLower.includes('afp 18');
                
                // Extraire les logos des équipes (home et away) - Correspondance par alt
                let homeTeamLogo = '';
                let awayTeamLogo = '';
                
                // Normaliser les noms d'équipes pour la correspondance (plus permissif)
                const normalizeTeamName = (name) => {
                  if (!name) return '';
                  return name.toLowerCase()
                    .replace(/\s+/g, ' ')
                    .replace(/[^\w\s]/g, '') // Garder lettres, chiffres et espaces
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
                    const words1 = n1.split(' ').filter(w => w.length >= 2);
                    const words2 = n2.split(' ').filter(w => w.length >= 2);
                    
                    // Vérifier si au moins 2 mots significatifs correspondent
                    let matchCount = 0;
                    let totalWords = Math.min(words1.length, words2.length);
                    
                    // Ajuster le seuil selon le nombre de mots
                    const minMatch = totalWords >= 4 ? 3 : (totalWords >= 2 ? 2 : 1);
                    
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
                for (let i = 0; i < 25 && container && container.tagName !== 'BODY'; i++) {
                  const classes = container.classList ? container.classList.toString() : '';
                  
                  // Chercher div.my-5 qui contient ce match spécifique
                  if (classes.includes('my-5')) {
                    // Vérifier que ce conteneur contient le lien
                    const hasLink = container.contains(node);
                    
                    if (hasLink) {
                      // Vérifier qu'il contient aussi des images (src ou data-src)
                      const allImgs = Array.from(container.querySelectorAll('img'));
                      const hasImages = allImgs.some(img => {
                        const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                        return src && src.includes('storage/logos');
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
                  for (let i = 0; i < 20 && container && container.tagName !== 'BODY'; i++) {
                    const classes = container.classList ? container.classList.toString() : '';
                    
                    // Chercher un conteneur avec border qui contient les images ET le lien (src ou data-src)
                    const allImgs = Array.from(container.querySelectorAll('img'));
                    const hasImages = allImgs.some(img => {
                      const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                      return src.includes('storage/logos');
                    });
                    const hasLink = container.contains(node);
                    
                    if (classes.includes('border') && hasImages && hasLink) {
                      bestContainer = container;
                      break;
                    }
                    
                    container = container.parentElement;
                  }
                }
                
                // Utiliser bestContainer si trouvé
                container = bestContainer;
                
                // Si pas trouvé de div.my-5, chercher dans les parents proches
                if (!container || container.tagName === 'BODY') {
                  container = node.parentElement;
                  // Remonter jusqu'à trouver un conteneur avec my-5 ou border
                  for (let i = 0; i < 20 && container && container.tagName !== 'BODY'; i++) {
                    const classes = container.classList ? container.classList.toString() : '';
                    if (classes.includes('my-5')) {
                      break;
                    }
                    container = container.parentElement;
                  }
                }
                
                // Si on n'a toujours pas trouvé de conteneur, chercher le div.block parent qui contient le lien
                // Les images sont souvent dans un div.block qui est un parent du lien
                if (!container || container.tagName === 'BODY') {
                  let parent = node.parentElement;
                  for (let i = 0; i < 15 && parent && parent.tagName !== 'BODY'; i++) {
                    const classes = parent.classList ? parent.classList.toString() : '';
                    // Chercher div.block ou div avec border qui contient le lien
                    if (classes.includes('block') || classes.includes('border') || classes.includes('border_theme')) {
                      // Vérifier si ce conteneur contient aussi des images
                      const imgs = Array.from(parent.querySelectorAll('img'));
                      const hasImgs = imgs.some(img => {
                        const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                        return src && src.includes('storage/logos');
                      });
                      if (hasImgs || !container) {
                        container = parent;
                        if (hasImgs) break;
                      }
                    }
                    parent = parent.parentElement;
                  }
                }
                
                if (container && container.tagName !== 'BODY') {
                  // Collecter toutes les images de logo valides dans le conteneur ET ses enfants directs
                  // Limiter la recherche au conteneur spécifique du match pour éviter les logos d'autres matchs
                  const allImgs = Array.from(container.querySelectorAll('img'));
                  
                  for (const img of allImgs) {
                    const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                    
                    // Ignorer les placeholders et garder seulement les vrais logos
                    // Filtrer explicitement les logos placeholders récurrents
                    if (!src || 
                        !src.includes('api.sportcorico.com/storage/logos') || 
                        src.includes('ecusson') || 
                        src.includes('sportcorico-black') ||
                        src.includes('sport-o-solidarite') ||
                        src.includes('sport-o-solidarite-848816') ||
                        src.includes('championnet-s-paris-511117')) {
                      continue;
                    }
                    
                    // Obtenir l'attribut alt pour faire la correspondance
                    const alt = img.getAttribute('alt') || '';
                    const altLower = alt.toLowerCase();
                    const altNormalized = normalizeTeamName(alt);
                    
                    // Identifier si c'est le logo AFP
                    const isAfpInAlt = altLower.includes('afp');
                    
                    // Si match à domicile : AFP = localTeamLogo (premier dans DOM)
                    // Si match à l'extérieur : AFP = awayTeamLogo (deuxième dans DOM ou flex-col-reverse)
                    if (isHomeMatch) {
                      // Match à domicile : AFP est l'équipe locale
                      if (isAfpInAlt && !homeTeamLogo) {
                        homeTeamLogo = src;
                        continue;
                      }
                      // L'autre équipe est l'équipe adverse
                      if (!isAfpInAlt && !awayTeamLogo) {
                        const matchesAwayTeam = teamNamesMatch(alt, awayTeam);
                        if (matchesAwayTeam) {
                          awayTeamLogo = src;
                          continue;
                        }
                      }
                    } else {
                      // Match à l'extérieur : AFP est l'équipe adverse
                      if (isAfpInAlt && !awayTeamLogo) {
                        awayTeamLogo = src;
                        continue;
                      }
                      // L'autre équipe est l'équipe locale
                      if (!isAfpInAlt && !homeTeamLogo) {
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
                      const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                      if (src && 
                          src.includes('api.sportcorico.com/storage/logos') && 
                          !src.includes('ecusson') && 
                          !src.includes('sportcorico-black') &&
                          !src.includes('sport-o-solidarite') &&
                          !src.includes('sport-o-solidarite-848816') &&
                          !src.includes('championnet-s-paris-511117')) {
                        const alt = (img.getAttribute('alt') || '').toLowerCase();
                        const isAfp = alt.includes('afp');
                        
                        // Remonter dans la hiérarchie pour trouver flex-col ou flex-col-reverse
                        let current = img;
                        let foundFlexCol = false;
                        let isFlexColReverse = false;
                        let domOrder = logoIndex;
                        
                        // Parcourir les parents pour trouver flex-col ou flex-col-reverse
                        for (let i = 0; i < 15 && current && current !== document.body; i++) {
                          const classes = current.className || '';
                          if (classes.includes('flex-col')) {
                            foundFlexCol = true;
                            isFlexColReverse = classes.includes('flex-col-reverse');
                            
                            // Trouver l'ordre dans le parent
                            const parent = current.parentElement;
                            if (parent) {
                              const siblings = Array.from(parent.children).filter(child => {
                                const childClasses = child.className || '';
                                return childClasses.includes('flex-col');
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
                            const classes = current.className || '';
                            if (classes.includes('flex-col') || classes.includes('flex-col-reverse')) {
                              foundFlexCol = true;
                              isFlexColReverse = classes.includes('flex-col-reverse');
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
                          isAfp: isAfp,
                          isLocalPosition: isLocalPosition,
                          isAwayPosition: isAwayPosition,
                          domOrder: domOrder,
                          logoIndex: logoIndex
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
                    
                    // Identifier par position et AFP selon le venue
                    // Match à domicile : logo dans flex-col (sans reverse) = AFP = home
                    //                 logo dans flex-col-reverse = autre = away
                    // Match à l'extérieur : logo dans flex-col (sans reverse) = autre = home
                    //                     logo dans flex-col-reverse = AFP = away
                    for (const logo of validLogos) {
                      if (isHomeMatch) {
                        // Match à domicile
                        if (logo.isAfp && logo.isLocalPosition && !homeTeamLogo) {
                          homeTeamLogo = logo.src;
                        }
                        if (!logo.isAfp && logo.isAwayPosition && !awayTeamLogo) {
                          awayTeamLogo = logo.src;
                        }
                      } else {
                        // Match à l'extérieur
                        if (!logo.isAfp && logo.isLocalPosition && !homeTeamLogo) {
                          homeTeamLogo = logo.src;
                        }
                        if (logo.isAfp && logo.isAwayPosition && !awayTeamLogo) {
                          awayTeamLogo = logo.src;
                        }
                      }
                    }
                    
                    // Fallback : utiliser AFP et ordre DOM
                    if (!homeTeamLogo || !awayTeamLogo) {
                      for (const logo of validLogos) {
                        if (isHomeMatch) {
                          if (logo.isAfp && !homeTeamLogo) {
                            homeTeamLogo = logo.src;
                          } else if (!logo.isAfp && !awayTeamLogo && logo.src !== homeTeamLogo) {
                            awayTeamLogo = logo.src;
                          }
                        } else {
                          if (!logo.isAfp && !homeTeamLogo) {
                            homeTeamLogo = logo.src;
                          } else if (logo.isAfp && !awayTeamLogo && logo.src !== homeTeamLogo) {
                            awayTeamLogo = logo.src;
                          }
                        }
                      }
                    }
                    
                    // Dernier fallback : utiliser l'ordre DOM strict
                    if (validLogos.length >= 2) {
                      if (isHomeMatch) {
                        // Match à domicile : premier = AFP (home), second = away
                        if (!homeTeamLogo) {
                          const afpLogo = validLogos.find(l => l.isAfp);
                          homeTeamLogo = afpLogo ? afpLogo.src : validLogos[0].src;
                        }
                        if (!awayTeamLogo) {
                          const otherLogo = validLogos.find(l => !l.isAfp && l.src !== homeTeamLogo);
                          awayTeamLogo = otherLogo ? otherLogo.src : validLogos[1].src;
                        }
                      } else {
                        // Match à l'extérieur : premier = autre (home), second = AFP (away)
                        if (!homeTeamLogo) {
                          const otherLogo = validLogos.find(l => !l.isAfp);
                          homeTeamLogo = otherLogo ? otherLogo.src : validLogos[0].src;
                        }
                        if (!awayTeamLogo) {
                          const afpLogo = validLogos.find(l => l.isAfp);
                          awayTeamLogo = afpLogo ? afpLogo.src : validLogos[1].src;
                        }
                      }
                    }
                  }
                }
                
                const venue = isHomeMatch ? 'domicile' : 'extérieur';
                
                // Calculer l'horaire du rendez-vous (1h30 avant le match)
                const calculateMeetingTime = (matchTime) => {
                  if (!matchTime || !matchTime.match(/^\d{2}:\d{2}$/)) return '';
                  
                  const [hours, minutes] = matchTime.split(':').map(Number);
                  let totalMinutes = hours * 60 + minutes;
                  
                  // Soustraire 1h30 (90 minutes)
                  totalMinutes -= 90;
                  
                  // Gérer le passage à la veille si nécessaire (heure négative)
                  if (totalMinutes < 0) {
                    totalMinutes += 24 * 60; // Ajouter 24h
                  }
                  
                  const newHours = Math.floor(totalMinutes / 60) % 24;
                  const newMinutes = totalMinutes % 60;
                  
                  return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
                };
                
                const horaireRendezVous = calculateMeetingTime(time);
                
                // Extraire l'ID depuis l'URL (ex: /match/afp-18-u13-f-1-montmartre-s-paris-u13-f-1-wduo1)
                const fullUrl = href.startsWith('http') ? href : `https://www.sportcorico.com${href}`;
                const matchIdMatch = href.match(/\/match\/([^\/\?]+)/);
                const matchId = matchIdMatch ? matchIdMatch[1] : href.replace(/^\/match\//, '').replace(/\/$/, '').split('?')[0];
                
                matches.push({
                  id: matchId, // ID extrait de l'URL
                  type: 'officiel', // Type de match (officiel pour les matchs scrapés)
                  date: currentDate,
                  competition: competition,
                  localTeam: localTeam,
                  awayTeam: awayTeam,
                  venue: venue, // "domicile" ou "extérieur" pour Afp 18
                  localTeamLogo: homeTeamLogo,
                  awayTeamLogo: awayTeamLogo,
                  time: time,
                  horaireRendezVous: horaireRendezVous, // 1h30 avant le match
                  url: fullUrl,
                  rawText: linkText
                });
              }
            }
          }
        }
      }
      
      return matches;
    });

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
      const date = match.date || 'Date inconnue';
      if (!matchesData[date]) {
        matchesData[date] = [];
      }
      matchesData[date].push(match);
    }

    // Convertir en format JSON structuré
    const jsonData = {
      club: {
        name: clubInfo.name || 'Academie Football Paris 18',
        description: clubInfo.description || 'Club de Football à Paris 18',
        logo: clubInfo.logo || ''
      },
      url: URL,
      scrapedAt: new Date().toISOString(),
      matches: matchesData
    };

    // Afficher les résultats
    console.log('📊 Résultats du scraping:\n');
    console.log(JSON.stringify(jsonData, null, 2));

    // Sauvegarder dans un fichier JSON
    const outputFile = 'matches.json';
    fs.writeFileSync(outputFile, JSON.stringify(jsonData, null, 2), 'utf-8');
    console.log(`💾 Données sauvegardées dans ${outputFile}`);

    // Fermer le navigateur
    await browser.close();
    
    console.log('\n✅ Scraping terminé avec succès !');
    console.log(`📊 Total: ${matchesWithUrls.length} matchs traités\n`);

  } catch (error) {
    console.error('❌ Erreur lors du scraping:', error);
    await browser.close();
    process.exit(1);
  }
}

// Lancer le scraper
scrapeMatches();
