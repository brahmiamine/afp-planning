import { redirect } from 'next/navigation';

/** Ancienne route des campagnes : redirigée pour lever l'ambiguïté avec les indisponibilités (issue #320). */
export default function LegacyDisponibilitesPage() {
  redirect('/club/demandes-disponibilite');
}
