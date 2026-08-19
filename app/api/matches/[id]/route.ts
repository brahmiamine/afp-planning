import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { logAuditEntry } from '@/lib/db/audit-log';

// Interface pour les informations supplémentaires d'un match
interface ContactOfficiel {
  nom: string;
  numero: string;
}

interface MatchExtras {
  id: string;
  confirmed?: boolean; // Match confirmé et bien rempli
  arbitreTouche?: ContactOfficiel[];
  contactEncadrants?: ContactOfficiel[];
  contactAccompagnateur?: ContactOfficiel[];
}

// GET: Récupérer les informations supplémentaires d'un match
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Next.js 15+ utilise Promise pour params, on doit await si c'est une Promise
    const resolvedParams = params instanceof Promise ? await params : params;
    const matchId = resolvedParams.id;

    if (!matchId || matchId === 'undefined' || matchId.trim() === '') {
      return NextResponse.json(
        { error: 'ID de match invalide' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const repo = db.getRepository('MatchExtra');
    const row = await repo.findOneBy({ matchId });
    const matchExtras = row ? (row.payload as unknown as MatchExtras) : null;

    return NextResponse.json(matchExtras);
  } catch (error) {
    console.error('Erreur GET match extras:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des informations' },
      { status: 500 }
    );
  }
}

// PUT: Modifier les informations supplémentaires d'un match
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) {
    return auth.error;
  }

  try {
    // Next.js 15+ utilise Promise pour params, on doit await si c'est une Promise
    const resolvedParams = params instanceof Promise ? await params : params;

    // Valider que l'ID est présent et valide
    const matchId = resolvedParams.id;
    if (!matchId || matchId === 'undefined' || matchId.trim() === '') {
      return NextResponse.json(
        { error: 'ID de match invalide' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Fonction helper pour valider et nettoyer un tableau de contacts
    const validateContacts = (contacts: any): ContactOfficiel[] | undefined => {
      if (!Array.isArray(contacts)) {
        // Rétrocompatibilité : si c'est un objet simple, le convertir en tableau
        if (contacts && typeof contacts === 'object' && contacts.nom) {
          return contacts.nom.trim() !== '' ? [{
            nom: contacts.nom.trim(),
            numero: contacts.numero?.trim() || '',
          }] : undefined;
        }
        return undefined;
      }

      const validContacts = contacts
        .filter((c: any) => c && c.nom && c.nom.trim() !== '')
        .map((c: any) => ({
          nom: c.nom.trim(),
          numero: c.numero?.trim() || '',
        }));

      return validContacts.length > 0 ? validContacts : undefined;
    };

    // Valider les données - utiliser l'ID de l'URL comme source de vérité
    const extras: MatchExtras = {
      id: matchId, // Toujours utiliser l'ID de l'URL (params.id)
      confirmed: body.confirmed === true || body.confirmed === false ? body.confirmed : undefined,
      arbitreTouche: validateContacts(body.arbitreTouche),
      contactEncadrants: validateContacts(body.contactEncadrants),
      contactAccompagnateur: validateContacts(body.contactAccompagnateur),
    };

    const db = await getDb();
    const repo = db.getRepository('MatchExtra');
    const existing = await repo.findOneBy({ matchId });
    const before = existing ? (existing.payload as unknown as Record<string, unknown>) : null;

    await repo.save({
      matchId,
      payload: extras as unknown as Record<string, unknown>,
    });

    try {
      await logAuditEntry(db, {
        user: auth.user,
        entityType: 'MatchExtra',
        entityId: matchId,
        action: before ? 'update' : 'create',
        before,
        after: extras as unknown as Record<string, unknown>,
      });
    } catch (auditError) {
      console.error('Erreur audit log match extras:', auditError);
    }

    return NextResponse.json({ success: true, extras });
  } catch (error) {
    console.error('Erreur PUT match extras:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la modification des informations' },
      { status: 500 }
    );
  }
}
