# Commande — Audit Planning et Publication

Réalise un **audit complet et approfondi du planning, des affectations et de la publication** du projet **AFP Planning** à partir du code réel présent sur `main`.

Repository : `https://github.com/brahmiamine/afp-planning`

## Objectif

Vérifier le cycle complet : match créé ou scrapé → préparation → affectations → validation → publication → Mon Planning → modification/republication → notifications → historique/archives.

Détecte : règles de publication incohérentes, affectations invalides, utilisateurs indisponibles affectés, données visibles trop tôt, modification après publication mal propagée, publication partielle, doublons, états impossibles, concurrence, notifications incorrectes et divergence frontend/backend.

## Architecture

Recense les pages, composants, API, services, repositories, entités, helpers et tests liés au planning, préparation, événements, matchs, affectations, publication, indisponibilités, Mon Planning, notifications et archives.

## Concepts

Distingue clairement : match, événement, planning, préparation, publication, affectation, fonction sur le match, statut et archive. Signale les concepts dupliqués ou legacy.

## Workflow réel

Reconstitue les vrais états et transitions avec les endpoints et données réellement utilisés. Utilise Mermaid si utile.

## Affectations

Analyse toutes les fonctions réellement présentes, notamment arbitre club, encadrant et accompagnateur.

Vérifie : qui peut affecter, qui est éligible, doublons, plusieurs fonctions, utilisateur désactivé, utilisateur autre club, utilisateur indisponible, conflits horaires, suppression/remplacement après publication.

Vérifie que `accessRole` n'est pas confondu avec la fonction exercée sur le match.

## Règles de publication

Identifie toutes les conditions réelles de publication et où elles sont contrôlées : UI, API, service, DB.

Vérifie notamment si le produit applique des conditions du type : au moins 1 arbitre club, 1 encadrant et 1 accompagnateur pour certains matchs, si elles sont configurables, dépendent du type de match et sont impossibles à contourner par API.

Si une règle attendue n'est pas déterminable, marque `Décision produit nécessaire`.

## Publication globale

Détermine si la publication se fait par événement, période, semaine ou globalement. Analyse la portée réelle des filtres UI et la signification exacte de « publié » dans la DB : boolean, statut, date, snapshot, version ou autre.

Détermine si Mon Planning lit un snapshot publié ou les données vivantes.

## Scénarios obligatoires

Analyse ou teste :

- match complet → publication ;
- arbitre/encadrant/accompagnateur manquant ;
- utilisateur indisponible ;
- doublon d'affectation ;
- plusieurs fonctions pour une même personne ;
- match non publié visible ou non dans Mon Planning ;
- changement d'arbitre après publication ;
- suppression/ajout d'affectation après publication ;
- changement date/heure/terrain après publication ;
- match annulé ;
- match reporté ;
- match disparu du scraping ;
- nouveau match après publication ;
- republication sans changement ;
- double clic publication ;
- deux admins simultanés ;
- publication pendant modification ;
- tentative de publier une ressource d'un autre club.

## Mon Planning

Vérifie pourquoi un match apparaît, quelles règles de publication s'appliquent et comment la fonction de l'utilisateur sur le match est affichée. Analyse le cas de plusieurs fonctions.

## Indisponibilités

Détermine si elles bloquent, avertissent ou n'ont aucun effet sur l'affectation. Analyse aussi le cas où une indisponibilité est créée après une affectation.

## Modification après publication

Construis une matrice par type de modification : effet DB, effet Mon Planning, notification, republication requise ou non.

Recherche une notion de dirty state / changedSincePublish / version / needsRepublish et analyse les conséquences si elle n'existe pas.

## Notifications et chat événement

Vérifie quand les notifications sont émises et si un utilisateur désaffecté conserve ou perd l'accès à une discussion d'événement.

## Atomicité et idempotence

Analyse publication partielle, transactions, double publication, notifications dupliquées et conflits entre plusieurs admins.

## Tests

Recense les tests couvrant préparation, affectation, indisponibilité, publication valide/invalide, modification après publication, report, annulation, double publication et cross-tenant.

## Findings

Utilise `PLAN-001`, `PLAN-002`, etc. Pour chaque finding : priorité, observation, preuve, scénario, impact, cause racine et correction recommandée.

Priorités : P0 bloquant/corruption/cross-tenant ; P1 règle de publication ou propagation incorrecte ; P2 workflow incomplet ; P3 amélioration mineure.

## Score

Donne une note `/100` couvrant workflow, affectations, règles de publication, modifications post-publication, Mon Planning, indisponibilités, notifications, statuts/historique, concurrence et tests.

## Rapport

Crée ou remplace :

`/audits/04-planning-publication.md`

Le rapport doit contenir workflow, statuts, affectations, indisponibilités, règles de publication, Mon Planning, modifications/republication, notifications, archives, concurrence, tests, findings, décisions produit, score et plan de remédiation.

## Contraintes

- ne modifie pas `app/**` ;
- ne change pas les règles métier ;
- ne modifie ni API, ni DB, ni migrations ;
- ne crée ni issue ni PR ;
- seuls `/audits/**` peuvent être modifiés.

## Fin de tâche

Présente score `/100`, nombre de P0/P1/P2/P3, 10 problèmes majeurs, décisions produit nécessaires, causes racines, plan de remédiation et fichier d'audit créé.

Arrête-toi après cet audit.