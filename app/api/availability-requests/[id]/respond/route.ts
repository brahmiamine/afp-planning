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

    const heldTargetFunctions = auth.user.planningFunctions.filter((fn) => campaign.payload.targetRoles.includes(fn));
    if (heldTargetFunctions.length === 0) {
      return NextResponse.json({ error: 'Cette demande ne vous concerne pas' }, { status: 403 });
    }
    const { timeZone } = await readAppSettings(db, auth.user.clubId);
    if (isAvailabilityCampaignClosed(campaign.payload, timeZone)) {
      return NextResponse.json({ error: 'Cette demande est clôturée' }, { status: 409 });
    }

    const body = await request.json();
    const response = normalizeAvailabilityResponse(body);
    if (!response) return NextResponse.json({ error: 'Réponse de disponibilité invalide' }, { status: 400 });

    const responseScope = campaign.payload.responseScope === 'function' ? 'function' : 'person';
    const requestedFunction = isPlanningFunction(body.planningFunction) ? body.planningFunction : null;
    if (responseScope === 'function' && (!requestedFunction || !heldTargetFunctions.includes(requestedFunction))) {
      return NextResponse.json({ error: 'Fonction concernée requise' }, { status: 400 });
    }
    const respondentFunction = responseScope === 'function' ? requestedFunction! : null;
    const recordId = responseScope === 'function'
      ? `availability-response:${id}:${auth.user.id}:${respondentFunction}`
      : `availability-response:${id}:${auth.user.id}`;
    await savePlanningRecord(db, {
      id: recordId,
      kind: 'availability-response',
      eventId: id,
      ownerUserId: auth.user.id,
      personType: respondentFunction ? personTypeForFunction(respondentFunction) : null,
      personId: auth.user.id,
      payload: {
        ...response,
        responseScope,
        requestTitle: campaign.payload.title,
        respondentName: auth.user.nom,
        respondentFunction,
        respondedAt: new Date().toISOString(),
      },
    });

    await notifyAdmins(db, {
      type: 'availability-response',
      title: 'Réponse de disponibilité',
      message: `${auth.user.nom} a répondu « ${response.status} » à ${campaign.payload.title}.`,
    });

    return NextResponse.json({ success: true, response, responseScope, planningFunction: respondentFunction });
  } catch (error) {
    console.error('Error responding to availability request:', error);
    return NextResponse.json({ error: 'Impossible d’enregistrer votre disponibilité' }, { status: 500 });
  }
}
