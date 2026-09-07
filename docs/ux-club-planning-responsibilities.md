# Responsabilités des espaces administrateur

## `/club` — pilotage

Cette page répond à « qu’est-ce qui nécessite mon attention ? ».

| Action visible | Catégorie | Destination / implémentation |
| --- | --- | --- |
| Surveiller le week-end, la météo, les refus et les rôles manquants | Pilotage | Cartes du dashboard |
| Relancer une réponse en attente | Pilotage | API de relance partagée |
| Clôturer une présence | Pilotage | API de présence partagée |
| Corriger une alerte | Édition | Espace événement, avec retour au dashboard |
| Ouvrir la préparation | Édition | `/club/planning` |
| Publier les changements | Pilotage | `PublishPlanningControl` partagé |

Le dashboard ne propose plus de liste éditable complète, de création d’événement, de
scraping ou d’affectation automatique. Ces actions appartiennent à la préparation.

## `/club/planning` — préparation

Cette page répond à « je construis et modifie le planning ».

| Action visible | Catégorie | Destination / implémentation |
| --- | --- | --- |
| Actualiser les événements | Édition | `ScraperButton` partagé |
| Ajouter un événement | Édition | Dialogue partagé de `EventsPanel` |
| Filtrer et parcourir | Édition | `MatchFilters` et `EventsPanel` |
| Affecter ou modifier | Édition | Drag & drop et espace événement |
| Publier le planning global | Pilotage | `PublishPlanningControl` partagé |
| Contrôle, charge, ressources, historique | Pilotage | Navigation de la section Planning |

La publication reste une seule action globale et un seul endpoint. Les libellés desktop
et mobile distinguent « Pilotage » de « Préparation ». Les liens d’événement conservent
leur origine pour fournir un retour contextuel.
