import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { normalizeIndisponibilites, type OfficielIndisponibilite } from '@/lib/utils/officiel-availability';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';

interface Encadrant {
    nom: string;
    telephone?: string;
    indisponibilites?: OfficielIndisponibilite[];
}

interface EncadrantsData {
    encadrants: Encadrant[];
}

function normalize(value: string): string {
    return value.trim().toLowerCase();
}

export async function GET() {
    try {
        const db = await getDb();
        const repo = db.getRepository('Encadrant');
        const all = await repo.find({ order: { nom: 'ASC' } });

        const data: EncadrantsData = {
            encadrants: all.map((item) => ({
                nom: String(item.nom),
                telephone: item.telephone ? String(item.telephone) : undefined,
                indisponibilites: normalizeIndisponibilites(item.indisponibilites),
            })),
        };

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error reading encadrants from DB:', error);
        return NextResponse.json({ error: 'Failed to load encadrants' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const auth = await requireRole(request, WRITE_ROLES);
    if ('error' in auth) {
        return auth.error;
    }

    try {
        const body = await request.json();
        const { oldNom, nom, telephone, indisponibilites } = body;

        const targetOldNom = oldNom && typeof oldNom === 'string' ? oldNom : nom;

        if (!targetOldNom || typeof targetOldNom !== 'string' || targetOldNom.trim() === '') {
            return NextResponse.json({ error: 'L\'ancien nom de l\'encadrant est requis' }, { status: 400 });
        }

        if (!nom || typeof nom !== 'string' || nom.trim() === '') {
            return NextResponse.json({ error: 'Le nom de l\'encadrant est requis' }, { status: 400 });
        }

        const db = await getDb();
        const repo = db.getRepository('Encadrant');

        const current = await repo.findOneBy({ nom: targetOldNom });

        const encadrant = current ?? (await repo
            .createQueryBuilder('encadrant')
            .where('LOWER(encadrant.nom) = :targetName', { targetName: normalize(targetOldNom) })
            .getOne());

        if (!encadrant) {
            return NextResponse.json({ error: 'Encadrant non trouvé' }, { status: 404 });
        }

        const existingWithSameName = await repo
            .createQueryBuilder('encadrant')
            .where('LOWER(encadrant.nom) = :newName', { newName: normalize(nom) })
            .getOne();

        if (existingWithSameName && existingWithSameName.id !== encadrant.id) {
            return NextResponse.json({ error: 'Un encadrant avec ce nom existe déjà' }, { status: 400 });
        }

        encadrant.nom = nom.trim();
        encadrant.telephone = telephone && typeof telephone === 'string' ? telephone.trim() || null : null;

        if (Object.prototype.hasOwnProperty.call(body, 'indisponibilites')) {
            const normalizedIndisponibilites = normalizeIndisponibilites(indisponibilites);
            encadrant.indisponibilites = normalizedIndisponibilites.length > 0 ? normalizedIndisponibilites : null;
        }

        await repo.save(encadrant);

        const all = await repo.find({ order: { nom: 'ASC' } });
        const data: EncadrantsData = {
            encadrants: all.map((item) => ({
                nom: String(item.nom),
                telephone: item.telephone ? String(item.telephone) : undefined,
                indisponibilites: normalizeIndisponibilites(item.indisponibilites),
            })),
        };

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error updating encadrants in DB:', error);
        return NextResponse.json({ error: 'Failed to update encadrants' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireRole(request, WRITE_ROLES);
    if ('error' in auth) {
        return auth.error;
    }

    try {
        const body = await request.json();
        const { nom, telephone, indisponibilites } = body;

        if (!nom || typeof nom !== 'string' || nom.trim() === '') {
            return NextResponse.json({ error: 'Le nom de l\'encadrant est requis' }, { status: 400 });
        }

        const db = await getDb();
        const repo = db.getRepository('Encadrant');

        const existing = await repo
            .createQueryBuilder('encadrant')
            .where('LOWER(encadrant.nom) = :normalizedNom', { normalizedNom: normalize(nom) })
            .getOne();

        if (existing) {
            return NextResponse.json({ error: 'Un encadrant avec ce nom existe déjà' }, { status: 400 });
        }

        const normalizedIndisponibilites = normalizeIndisponibilites(indisponibilites);

        await repo.save({
            nom: nom.trim(),
            telephone: telephone && typeof telephone === 'string' ? telephone.trim() || null : null,
            indisponibilites: normalizedIndisponibilites.length > 0 ? normalizedIndisponibilites : null,
        });

        const all = await repo.find({ order: { nom: 'ASC' } });
        const data: EncadrantsData = {
            encadrants: all.map((item) => ({
                nom: String(item.nom),
                telephone: item.telephone ? String(item.telephone) : undefined,
                indisponibilites: normalizeIndisponibilites(item.indisponibilites),
            })),
        };

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error adding encadrant in DB:', error);
        return NextResponse.json({ error: 'Failed to add encadrant' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const auth = await requireRole(request, WRITE_ROLES);
    if ('error' in auth) {
        return auth.error;
    }

    try {
        const { searchParams } = new URL(request.url);
        const nom = searchParams.get('nom');

        if (!nom || typeof nom !== 'string' || nom.trim() === '') {
            return NextResponse.json({ error: 'Le nom de l\'encadrant est requis' }, { status: 400 });
        }

        const db = await getDb();
        const repo = db.getRepository('Encadrant');

        const encadrant = await repo
            .createQueryBuilder('encadrant')
            .where('LOWER(encadrant.nom) = :normalizedNom', { normalizedNom: normalize(nom) })
            .getOne();

        if (!encadrant) {
            return NextResponse.json({ error: 'Encadrant non trouvé' }, { status: 404 });
        }

        await repo.remove(encadrant);

        const all = await repo.find({ order: { nom: 'ASC' } });
        const data: EncadrantsData = {
            encadrants: all.map((item) => ({
                nom: String(item.nom),
                telephone: item.telephone ? String(item.telephone) : undefined,
                indisponibilites: normalizeIndisponibilites(item.indisponibilites),
            })),
        };

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error deleting encadrant in DB:', error);
        return NextResponse.json({ error: 'Failed to delete encadrant' }, { status: 500 });
    }
}
