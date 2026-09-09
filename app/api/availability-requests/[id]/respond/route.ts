import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { hasAnyPlanningFunction, isPlanningFunction } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import { notifyAdmins } from '@/lib/notifications/service';
import { normalizeAvailabilityResponse } from '@/lib/planning/advanced-rules';
import {
  isAvailabilityCampaignClosed,
  type AvailabilityCampaignPayload,
} from '@/lib/planning/availability-campaigns';
import { personTypeForFunction } from '@/lib/planning/person-link';
import { getPlanningRecord, savePlanningRecord } from '@/lib/planning/records';
import { setCurrentClubId } from '@/lib/auth/club-context';
import { readAppSettings } from '@/lib/settings-store';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  setCurrentClubId(auth.user.clubId);
  if (!hasAnyPlanningFunction(auth.user.planningFunctions)) {
    return NextResponse.json({ error: 'Compte personnel non lié' }, { status: 403 });
  }

  const { id } = params instanceof Promise ? await params : params;
  try {
    const db = await getDb();
    const campaign = await getPlanningRecord<AvailabilityCampaignPayload>(db, id);
    if (!campaign || campaign.kind !== 'availability-request') {
      return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    }

    const matchingRoles = auth.user.planningFunctions.filter((fn) => campaign.payload.targetRoles.includes(fn));
    if (matchingRoles.length === 0) {
      return NextResponse.json({ error: 'Cette demande ne vous concerne pas' }, { status: 403 });
    }
    const { timeZone } = await readAppSettings(db, auth.user.clubId);
    if (isAvailabilityCampaignClosed(campaign.payload, timeZone)) {
      return NextResponse.json({ error: 'Cette demande est clôturée' }, { status: 409 });
    }

    const body = await request.json();
    const response = normalizeAvailabilityResponse(body);
    if (!response) return NextResponse.json({ error: 'Réponse de disponibilité invalide' }, { status: 400 });

    // Une campagne peut cibler plusieurs fonctions à la fois (issue #202) : un dirigeant qui
    // en tient plusieurs peut avoir une disponibilité différente selon la fonction (ex.
    // disponible comme encadrant mais pas comme arbitre club) — la réponse doit donc préciser
    // explicitement pour laquelle elle vaut dès qu'il y a ambiguïté, plutôt que de retenir
    // silencieusement la première fonction correspondante.
    const requestedRole = typeof body.role === 'string' && isPlanningFunction(body.role) ? body.role : null;
    const targetRole = requestedRole && matchingRoles.includes(requestedRole)
      ? requestedRole
      : matchingRoles.length === 1
        ? matchingRoles[0]!
        : null;
    if (!targetRole) {
      return NextResponse.json({ error: 'Précisez la fonction concernée par cette réponse' }, { status: 400 });
    }
    const expectedType = personTypeForFunction(targetRole);

    // La fonction fait partie de la clé : un dirigeant qui répond pour deux fonctions
    // différentes sur la même campagne ne doit pas écraser la première réponse avec la
    // seconde (issue #202).
    const recordId = `availability-response:${id}:${auth.user.id}:${targetRole}`;
    await savePlanningRecord(db, {
      id: recordId,
      kind: 'availability-response',
      eventId: id,
      ownerUserId: auth.user.id,
      personType: expectedType,
      personId: auth.user.id,
      payload: {
        ...response,
        requestTitle: campaign.payload.title,
        respondentName: auth.user.nom,
        respondentRole: targetRole,
        respondedAt: new Date().toISOString(),
      },
    });

    await notifyAdmins(db, {
      type: 'availability-response',
      title: 'Réponse de disponibilité',
      message: `${auth.user.nom} a répondu « ${response.status} » à ${campaign.payload.title}.`,
    });

    return NextResponse.json({ success: true, response });
  } catch (error) {
    console.error('Error responding to availability request:', error);
    return NextResponse.json({ error: 'Impossible d’enregistrer votre disponibilité' }, { status: 500 });
  }
}
