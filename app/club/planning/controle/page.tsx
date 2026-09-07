import { redirect } from 'next/navigation';

// La page « Contrôle » a été fusionnée dans la préparation du planning : les points
// bloquants (postes manquants, refus, remplacements, relances) sont désormais affichés
// directement sur chaque carte match.
export default function PlanningControleRedirectPage() {
  redirect('/club/planning');
}
