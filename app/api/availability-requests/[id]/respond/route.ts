import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { isReadOnlyRole, type UserRole } from '@/lib/auth/roles';
import { getDb } from '@/lib/db';
import { notifyAdmins } from '@/lib/notifications/service';
import { normalizeAvailabilityResponse } from '@/lib/planning/advanced-rules';
import { getPlanningRecord, savePlanningRecord } from '@/lib/planning/records';

interface AvailabilityRequestPayload {
  title: string;
  startDate: string;
  endDate: string;
  targetRoles: UserRole[];
  message: string | null;
  createdByUserId: number;
  closesAt: string | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;
  const primaryLink = auth.user.personLinks[0];
  if (!isReadOnlyRole(auth.user.roles) || !primaryLink) {
    return NextResponse.json({ error: 'Compte personnel non lié' }, { status: 403 });
  }

  const { id } = params instanceof Promise ? await params : params;
  try {
    const db = await getDb();
    const campaign = await getPlanningRecord<AvailabilityRequestPayload>(db, id);
    if (!campaign || campaign.kind !== 'availability-request') {
      return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    }
    if (!campaign.payload.targetRoles.some((role) => auth.user.roles.includes(role))) {
      return NextResponse.json({ error: 'Cette demande ne vous concerne pas' }, { status: 403 });
    }
    if (campaign.payload.closesAt && Date.parse(campaign.payload.closesAt) < Date.now()) {
      return NextResponse.json({ error: 'Cette demande est clôturée' }, { status: 409 });
    }

    const body = await request.json();
    const response = normalizeAvailabilityResponse(body);
    if (!response) return NextResponse.json({ error: 'Réponse de disponibilité invalide' }, { status: 400 });

    const recordId = `availability-response:${id}:${auth.user.id}`;
    await savePlanningRecord(db, {
      id: recordId,
      kind: 'availability-response',
      eventId: id,
      ownerUserId: auth.user.id,
      personType: primaryLink.personType,
      personId: primaryLink.personId,
      payload: {
        ...response,
        requestTitle: campaign.payload.title,
        respondentName: auth.user.nom,
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
