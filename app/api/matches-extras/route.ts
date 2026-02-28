import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Interface pour les informations supplémentaires d'un match
interface MatchExtras {
  id: string;
  confirmed?: boolean;
  arbitreTouche?: Array<{ nom: string; numero: string }>;
  contactEncadrants?: Array<{ nom: string; numero: string }>;
  contactAccompagnateur?: Array<{ nom: string; numero: string }>;
}

// GET: Récupérer toutes les informations supplémentaires
export async function GET() {
  try {
    const db = await getDb();
    const repo = db.getRepository('MatchExtra');
    const rows = await repo.find();
    const extras: Record<string, MatchExtras> = {};

    for (const row of rows) {
      extras[String(row.matchId)] = row.payload as unknown as MatchExtras;
    }

    return NextResponse.json(extras);
  } catch (error) {
    console.error('Erreur GET all match extras:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des informations' },
      { status: 500 }
    );
  }
}
