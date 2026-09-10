# Décisions produit — planning et publication (issue #394)

Document de référence pour les règles métier laissées optionnelles par les feature flags.
Les décisions ci-dessous tranchent les points FUNC-004/005/006/009 et PLAN-003/004/005/009.

## 1. Minima de rôles à la publication (FUNC-004 / PLAN-003)

**Décision : B — flags optionnels (comportement actuel).**

Les flags `requireArbitreForPublication`, `requireEncadrantForPublication` et
`requireAccompagnateurForPublication` restent configurables club par club. Un club peut
publier sans arbitre/encadrant/accompagnateur si les flags correspondants sont désactivés.
Le contrôle durci (`publicationReadiness`) reste activable séparément.

## 2. Libellé `assignmentValidation` (FUNC-005 / PLAN-009)

**Décision : A — le texte décrit la validation au save ET à la publication.**

Quand le flag est activé, les indisponibilités, conflits et types de personnes sont
contrôlés à l'enregistrement des affectations (`saveRoleAssignments`, PUT match extras)
**et** au moment de la publication globale. Le brouillon invalide ne peut pas être publié.

## 3. Visibilité post-publication : swaps vs reste du planning (FUNC-006 / PLAN-004)

**Décision : C — swaps immédiats, reste différé jusqu'à republication globale.**

Les échanges d'affectation validés mettent à jour le snapshot publié immédiatement
(`patchPublishedPlanningEventAssignments`) pour que la cible voie le changement sans attendre
« Publier le planning ». Toute autre modification structurelle (date, lieu, retrait…) reste
en brouillon `modified` jusqu'à la prochaine publication globale. L'UI de publication et
la page échanges rappellent cette exception.

## 4. Statut « reporté » (FUNC-009 / PLAN-005)

**Décision : C — pas de statut `postponed` dédié.**

Un report se matérialise par une nouvelle date/heure sur l'événement, ou par une annulation
avec motif explicite. Aucun statut opérationnel supplémentaire n'est introduit.
