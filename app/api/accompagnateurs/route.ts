import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { normalizeIndisponibilites, type OfficielIndisponibilite } from '@/lib/utils/officiel-availability';

interface Accompagnateur {
    nom: string;
    telephone?: string;
    indisponibilites?: OfficielIndisponibilite[];
}

interface AccompagnateursData {
    accompagnateurs: Accompagnateur[];
}

function normalize(value: string): string {
    return value.trim().toLowerCase();
}

export async function GET() {
    try {
        const db = await getDb();
        const repo = db.getRepository('Accompagnateur');
        const all = await repo.find({ order: { nom: 'ASC' } });

        const data: AccompagnateursData = {
            accompagnateurs: all.map((item) => ({
                nom: String(item.nom),
                telephone: item.telephone ? String(item.telephone) : undefined,
                indisponibilites: normalizeIndisponibilites(item.indisponibilites),
            })),
        };

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error reading accompagnateurs from DB:', error);
        return NextResponse.json({ error: 'Failed to load accompagnateurs' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { oldNom, nom, telephone, indisponibilites } = body;

        const targetOldNom = oldNom && typeof oldNom === 'string' ? oldNom : nom;

        if (!targetOldNom || typeof targetOldNom !== 'string' || targetOldNom.trim() === '') {
            return NextResponse.json({ error: 'L\'ancien nom de l\'accompagnateur est requis' }, { status: 400 });
        }

        if (!nom || typeof nom !== 'string' || nom.trim() === '') {
            return NextResponse.json({ error: 'Le nom de l\'accompagnateur est requis' }, { status: 400 });
        }

        const db = await getDb();
        const repo = db.getRepository('Accompagnateur');

        const current = await repo.findOneBy({ nom: targetOldNom });

        const accompagnateur = current ?? (await repo
            .createQueryBuilder('accompagnateur')
            .where('LOWER(accompagnateur.nom) = :targetName', { targetName: normalize(targetOldNom) })
            .getOne());

        if (!accompagnateur) {
            return NextResponse.json({ error: 'Accompagnateur non trouvé' }, { status: 404 });
        }

        const existingWithSameName = await repo
            .createQueryBuilder('accompagnateur')
            .where('LOWER(accompagnateur.nom) = :newName', { newName: normalize(nom) })
            .getOne();

        if (existingWithSameName && existingWithSameName.id !== accompagnateur.id) {
            return NextResponse.json({ error: 'Un accompagnateur avec ce nom existe déjà' }, { status: 400 });
        }

        accompagnateur.nom = nom.trim();
        accompagnateur.telephone = telephone && typeof telephone === 'string' ? telephone.trim() || null : null;

        if (Object.prototype.hasOwnProperty.call(body, 'indisponibilites')) {
            const normalizedIndisponibilites = normalizeIndisponibilites(indisponibilites);
            accompagnateur.indisponibilites = normalizedIndisponibilites.length > 0 ? normalizedIndisponibilites : null;
        }

        await repo.save(accompagnateur);

        const all = await repo.find({ order: { nom: 'ASC' } });
        const data: AccompagnateursData = {
            accompagnateurs: all.map((item) => ({
                nom: String(item.nom),
                telephone: item.telephone ? String(item.telephone) : undefined,
                indisponibilites: normalizeIndisponibilites(item.indisponibilites),
            })),
        };

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error updating accompagnateurs in DB:', error);
        return NextResponse.json({ error: 'Failed to update accompagnateurs' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { nom, telephone, indisponibilites } = body;

        if (!nom || typeof nom !== 'string' || nom.trim() === '') {
            return NextResponse.json({ error: 'Le nom de l\'accompagnateur est requis' }, { status: 400 });
        }

        const db = await getDb();
        const repo = db.getRepository('Accompagnateur');

        const existing = await repo
            .createQueryBuilder('accompagnateur')
            .where('LOWER(accompagnateur.nom) = :normalizedNom', { normalizedNom: normalize(nom) })
            .getOne();

        if (existing) {
            return NextResponse.json({ error: 'Un accompagnateur avec ce nom existe déjà' }, { status: 400 });
        }

        const normalizedIndisponibilites = normalizeIndisponibilites(indisponibilites);

        await repo.save({
            nom: nom.trim(),
            telephone: telephone && typeof telephone === 'string' ? telephone.trim() || null : null,
            indisponibilites: normalizedIndisponibilites.length > 0 ? normalizedIndisponibilites : null,
        });

        const all = await repo.find({ order: { nom: 'ASC' } });
        const data: AccompagnateursData = {
            accompagnateurs: all.map((item) => ({
                nom: String(item.nom),
                telephone: item.telephone ? String(item.telephone) : undefined,
                indisponibilites: normalizeIndisponibilites(item.indisponibilites),
            })),
        };

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error adding accompagnateur in DB:', error);
        return NextResponse.json({ error: 'Failed to add accompagnateur' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const nom = searchParams.get('nom');

        if (!nom || typeof nom !== 'string' || nom.trim() === '') {
            return NextResponse.json({ error: 'Le nom de l\'accompagnateur est requis' }, { status: 400 });
        }

        const db = await getDb();
        const repo = db.getRepository('Accompagnateur');

        const accompagnateur = await repo
            .createQueryBuilder('accompagnateur')
            .where('LOWER(accompagnateur.nom) = :normalizedNom', { normalizedNom: normalize(nom) })
            .getOne();

        if (!accompagnateur) {
            return NextResponse.json({ error: 'Accompagnateur non trouvé' }, { status: 404 });
        }

        await repo.remove(accompagnateur);

        const all = await repo.find({ order: { nom: 'ASC' } });
        const data: AccompagnateursData = {
            accompagnateurs: all.map((item) => ({
                nom: String(item.nom),
                telephone: item.telephone ? String(item.telephone) : undefined,
                indisponibilites: normalizeIndisponibilites(item.indisponibilites),
            })),
        };

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error deleting accompagnateur in DB:', error);
        return NextResponse.json({ error: 'Failed to delete accompagnateur' }, { status: 500 });
    }
}
