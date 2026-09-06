import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { runWithClubId } from '@/lib/auth/club-context';
import { PlanningConcurrencyError, savePlanningPublication, type PlanningEventSnapshot } from './event-store';

type Row = { matchId: string; clubId: string; payload: Record<string, unknown> };

function matchSnapshot(id: string, revision: number): PlanningEventSnapshot {
  return {
    eventId: id,
    eventType: 'amical',
    title: `AFP – ${id}`,
    date: '12/09/2026',
    time: '15:00',
    durationMinutes: 90,
    location: 'Stade AFP',
    planningStatus: 'draft',
    event: {
      id,
      type: 'amical',
      date: '12/09/2026',
      time: '15:00',
      horaireRendezVous: '14:00',
      competition: 'Amical',
      localTeam: 'AFP',
      awayTeam: id,
      venue: 'domicile',
      planningRevision: revision,
    },
    extras: { id, planningRevision: revision },
    assignments: { arbitre: [], encadrant: [], accompagnateur: [] },
    revision,
  };
}

function cloneTable(table: Map<string, Row>): Map<string, Row> {
  return new Map([...table].map(([key, row]) => [key, structuredClone(row)]));
}

/**
 * DataSource minimal simulant les SAVEPOINT MySQL/MariaDB (TypeORM ouvre une transaction
 * imbriquée sur le même connection quand `.transaction()` est appelé depuis un manager déjà
 * transactionnel) : seule la transaction racine capture un instantané et le restaure en cas
 * d'erreur, une transaction imbriquée se contente de propager l'erreur vers la racine.
 */
class FakeMatchExtraDb {
  matchExtra = new Map<string, Row>();
  private depth = 0;

  getRepository(name: string) {
    if (name !== 'MatchExtra') throw new Error(`unexpected repo ${name}`);
    return {
      findOne: async ({ where }: { where: { matchId: string; clubId: string } }) => {
        const row = this.matchExtra.get(`${where.matchId}:${where.clubId}`);
        return row ? structuredClone(row) : null;
      },
      save: async (row: Row) => {
        this.matchExtra.set(`${row.matchId}:${row.clubId}`, structuredClone(row));
        return row;
      },
    };
  }

  async transaction<T>(fn: (manager: this) => Promise<T>): Promise<T> {
    if (this.depth > 0) {
      this.depth += 1;
      try {
        return await fn(this);
      } finally {
        this.depth -= 1;
      }
    }
    const snapshot = cloneTable(this.matchExtra);
    this.depth += 1;
    try {
      const result = await fn(this);
      this.depth -= 1;
      return result;
    } catch (error) {
      this.matchExtra = snapshot;
      this.depth -= 1;
      throw error;
    }
  }
}

describe('publication globale — atomicité (issue #37)', () => {
  it('annule toutes les écritures déjà faites si un événement échoue au milieu de la publication', async () => {
    const db = new FakeMatchExtraDb();
    db.matchExtra.set('a-1:afp', { matchId: 'a-1', clubId: 'afp', payload: { id: 'a-1' } });
    // Révision déjà avancée par une modification concurrente : la publication doit échouer sur cet événement.
    db.matchExtra.set('a-2:afp', { matchId: 'a-2', clubId: 'afp', payload: { id: 'a-2', planningRevision: 1 } });

    const snapshotA = matchSnapshot('a-1', 0);
    const snapshotB = matchSnapshot('a-2', 0);
    const patch = { planningStatus: 'published', publishedAt: '2026-09-06T00:00:00.000Z' };

    await runWithClubId('afp', async () => {
      await expect(
        (db as unknown as DataSource).transaction(async (manager) => {
          await savePlanningPublication(manager, snapshotA, patch);
          await savePlanningPublication(manager, snapshotB, patch);
        }),
      ).rejects.toBeInstanceOf(PlanningConcurrencyError);
    });

    // L'événement A a été écrit avec succès avant que B n'échoue : sans transaction englobante,
    // il resterait publié. Avec la transaction globale, son écriture doit être annulée aussi.
    const rowA = db.matchExtra.get('a-1:afp')!;
    expect(rowA.payload).not.toHaveProperty('planningStatus');
    expect(rowA.payload).toEqual({ id: 'a-1' });
  });

  it('publie tous les événements quand aucun ne rencontre de conflit', async () => {
    const db = new FakeMatchExtraDb();
    db.matchExtra.set('a-1:afp', { matchId: 'a-1', clubId: 'afp', payload: { id: 'a-1' } });
    db.matchExtra.set('a-2:afp', { matchId: 'a-2', clubId: 'afp', payload: { id: 'a-2' } });

    const snapshotA = matchSnapshot('a-1', 0);
    const snapshotB = matchSnapshot('a-2', 0);
    const patch = { planningStatus: 'published', publishedAt: '2026-09-06T00:00:00.000Z' };

    await runWithClubId('afp', async () => {
      await (db as unknown as DataSource).transaction(async (manager) => {
        await savePlanningPublication(manager, snapshotA, patch);
        await savePlanningPublication(manager, snapshotB, patch);
      });
    });

    expect(db.matchExtra.get('a-1:afp')!.payload).toMatchObject({ planningStatus: 'published' });
    expect(db.matchExtra.get('a-2:afp')!.payload).toMatchObject({ planningStatus: 'published' });
  });
});
