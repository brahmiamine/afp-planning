# Responsabilités des espaces administrateur

## `/club` — consultation des événements

Cette page répond à « qu’est-ce qui est programmé ? ».

| Action visible | Catégorie | Destination / implémentation |
| --- | --- | --- |
| Parcourir tous les événements (carte / liste / calendrier) | Consultation | `EventList` + `MatchFilters` |
| Filtrer les événements | Consultation | `MatchFilters` partagé |
| Actualiser les événements depuis le site officiel | Consultation | `ScraperButton` partagé |
| Ouvrir un événement | Consultation | Espace événement |

Le dashboard ne propose plus de vue d’ensemble pilotage, d’alertes météo, de clôture
de présence, de création d’événement, d’affectation ni de publication. Ces actions
appartiennent à la préparation.

## `/club/planning` — préparation et publication

Cette page répond à « je construis, je corrige et je publie le planning ».

| Action visible | Catégorie | Destination / implémentation |
| --- | --- | --- |
| Actualiser les événements | Édition | `ScraperButton` partagé |
| Ajouter un événement | Édition | Dialogue partagé de `EventsPanel` |
| Filtrer et parcourir | Édition | `MatchFilters` et `EventsPanel` |
| Affecter ou modifier | Édition | Drag & drop et espace événement |
| Corriger les alertes (postes manquants, refus, relances) | Édition | Cartes de `EventsPanel`, auto-affectation et relances |
| Publier le planning global / publier les changements | Pilotage | `PublishPlanningControl` partagé |
| Contrôle de publication (diff + points bloquants affichés avant toute tentative) | Pilotage | `PublishPlanningControl` + `collectPublicationBlockers` renvoyé par l’aperçu |
| Charge, ressources, historique | Pilotage | Navigation de la section Planning |

La publication reste une seule action globale et un seul endpoint
(`/api/planning/publication-all`). L’aperçu (`GET`) renvoie désormais aussi les points
bloquants courants, affichés en permanence sous le bouton de publication.
