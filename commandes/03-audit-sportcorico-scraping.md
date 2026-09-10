# Commande — Audit SportCorico et Scraping

Réalise un **audit complet et approfondi du scraping SportCorico** du projet **AFP Planning** à partir du code réel présent sur `main`.

Repository : `https://github.com/brahmiamine/afp-planning`

## Objectif

Comprendre et vérifier le cycle complet : configuration club → construction URL SportCorico → récupération HTTP → parsing → normalisation → matching du club → matching du match → création/mise à jour → doublons → disparition → annulation/report → archivage → impact planning/publication.

Je veux détecter : faux matching, doublons, perte de matchs, mises à jour incorrectes, écrasement de données internes, suppression dangereuse, erreurs silencieuses, manque d'idempotence, concurrence, fragilité du parser, problèmes timezone, sécurité SSRF et mauvaise isolation tenant.

## Architecture

Recense tous les fichiers liés directement ou indirectement au scraping : services, API, helpers, configuration, modèles DB, historique, logs, tests et interfaces de déclenchement.

Construis un tableau fichier/responsabilité/entrée/sortie/appelé par.

## Configuration SportCorico

Analyse précisément tous les paramètres, notamment `matchesUrlKey` et `scraperClubName` si présents.

Pour chacun : où il est configuré, stocké, validé, utilisé, s'il est obligatoire et pourquoi il existe.

Réponds avec preuve à : **a-t-on réellement besoin de `matchesUrlKey` ET `scraperClubName` ?**

## Déclenchement

Identifie tous les déclencheurs : bouton, API, cron, worker, script, synchronisation implicite.

Vérifie si deux scrapings peuvent être lancés simultanément et quelles protections existent.

## HTTP et sécurité

Analyse construction URL, hostname, protocole, paramètres, redirections, timeout, retries, erreurs HTTP, contenu vide et SSRF.

Vérifie surtout qu'une panne réseau ou une erreur du parser ne soit jamais interprétée comme « tous les matchs ont disparu ».

## Parsing

Documente les données extraites : date, heure, domicile, extérieur, compétition, catégorie, terrain, lieu, statut, score, journée, identifiant/URL éventuel.

Évalue la robustesse des sélecteurs face à de petits changements HTML.

## Normalisation et matching club

Analyse normalisation casse, espaces, accents, apostrophes, tirets, noms de clubs et équipes.

Vérifie les risques de faux positif ou faux négatif lors du matching du club.

## Identité d'un match

C'est une partie critique.

Détermine exactement comment le code décide qu'un match SportCorico correspond à un match déjà stocké.

Analyse la stabilité de cette identité si changent : heure, date, terrain, adversaire, compétition ou statut.

## Création, mise à jour et source de vérité

Construis une matrice par champ indiquant : créé par scraper, mis à jour par scraper, modifiable manuellement, préservé lors du rescraping.

Distingue clairement données SportCorico et données internes AFP Planning.

Vérifie qu'un rescraping ne supprime pas les affectations, notes, publication, chat ou autres informations métier liées au match.

## Scénarios obligatoires

Analyse ou teste :

- nouveau match ;
- match inchangé ;
- changement heure ;
- changement date ;
- changement terrain ;
- adversaire/compétition renommé ;
- match reporté ;
- match annulé ;
- match disparu ;
- match disparu puis revenu ;
- match créé manuellement puis découvert par SportCorico ;
- match SportCorico supprimé manuellement puis rescrapé ;
- double scraping ;
- scraping concurrent ;
- erreur réseau ;
- HTML invalide ;
- parser retourne 0 ;
- changement d'heure été/hiver ;
- scraping Club A ne touche jamais Club B.

## Idempotence et atomicité

Vérifie qu'exécuter deux fois un scraping identique ne produit pas d'effets supplémentaires inutiles.

Analyse le comportement d'un run partiellement échoué et l'usage éventuel de transactions/locks/contraintes uniques.

## Archives et publication

Analyse comment les matchs disparus, passés, annulés et reportés interagissent avec les archives, les affectations, le planning publié et les notifications.

## Performance et observabilité

Recherche N+1, requêtes DB dans les boucles, insert/update unitaires excessifs et appels HTTP répétés.

Vérifie si un run permet de savoir : nouveaux, modifiés, inchangés, disparus, erreurs.

## Tests

Recense les tests existants et construis une matrice couvrant les scénarios critiques ci-dessus.

Privilégie les fixtures HTML en test. N'effectue aucun test destructif sur un site ou environnement de production.

## Findings

Utilise `SCRAPE-001`, `SCRAPE-002`, etc.

Pour chaque finding : priorité, observation, preuve, scénario reproductible, impact, cause racine et correction recommandée.

Priorités :
- P0 : corruption/perte massive/cross-tenant ;
- P1 : doublons, matching/report/disparition incorrects ;
- P2 : observabilité, robustesse, performance ;
- P3 : simplification/nettoyage.

## Score

Donne une note `/100` couvrant identification des matchs, idempotence, mises à jour, disparition/annulation/report, robustesse parsing, intégrité des données, erreurs, tenant/sécurité, performance et tests.

## Rapport

Crée ou remplace :

`/audits/03-sportcorico-scraping.md`

Le rapport doit contenir architecture, configuration, HTTP, parsing, normalisation, matching, synchronisation, scénarios, archives, publication, sécurité, performance, tests, findings, score et plan de remédiation.

## Contraintes

Pendant cet audit :
- ne modifie pas le scraper ;
- ne modifie ni API, ni DB, ni UI ;
- ne crée ni issue ni PR ;
- seuls `/audits/**` peuvent être modifiés.

## Fin de tâche

Présente : score `/100`, nombre de P0/P1/P2/P3, 10 risques principaux, causes racines, réponse claire sur `matchesUrlKey`/`scraperClubName`, plan de remédiation et fichier d'audit créé.

Arrête-toi après cet audit.