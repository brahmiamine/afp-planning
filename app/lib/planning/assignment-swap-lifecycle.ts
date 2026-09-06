import type { DataSource } from 'typeorm';
import {
  shouldExpireAssignmentSwap,
  type AssignmentSwapPayload,
} from './assignment-swaps';
import { getPlanningEventSnapshot } from './event-store';
import { listPublishedPlanningEventSnapshots } from './published-planning';
import {
  savePlanningRecord,
  type PlanningRecord,
  type PlanningRecordKind,
} from './records';

const SWAP_KIND = 'assignment-swap' as PlanningRecordKind;

async function snapshotsForLifecycle(db: DataSource) {
  return listPublishedPlanningEventSnapshots(db);
}

async function snapshotForRecord(
  db: DataSource,
  published: Awaited<ReturnType<typeof listPublishedPlanningEventSnapshots>>,
  record: PlanningRecord<AssignmentSwapPayload>,
) {
  if (published) {
    return published.find((snapshot) =>
      snapshot.eventType === record.payload.eventType
      && snapshot.eventId === record.payload.eventId) ?? null;
  }
  return getPlanningEventSnapshot(db, record.payload.eventType, record.payload.eventId);
}

async function expireRecord(
  db: DataSource,
  record: PlanningRecord<AssignmentSwapPayload>,
): Promise<PlanningRecord<AssignmentSwapPayload>> {
  const payload: AssignmentSwapPayload = { ...record.payload, status: 'expired' };
  await savePlanningRecord(db, {
    id: record.id,
    kind: SWAP_KIND,
    eventType: record.eventType,
    eventId: record.eventId,
    ownerUserId: record.ownerUserId,
    payload,
  });
  return { ...record, payload };
}

export async function expireInvalidAssignmentSwaps(
  db: DataSource,
  records: PlanningRecord<AssignmentSwapPayload>[],
  timeZone: string,
  now = Date.now(),
): Promise<PlanningRecord<AssignmentSwapPayload>[]> {
  const published = await snapshotsForLifecycle(db);
  const result: PlanningRecord<AssignmentSwapPayload>[] = [];
  for (const record of records) {
    const snapshot = await snapshotForRecord(db, published, record);
    if (shouldExpireAssignmentSwap(record.payload, snapshot, now, timeZone)) {
      result.push(await expireRecord(db, record));
    } else {
      result.push(record);
    }
  }
  return result;
}

export async function expireAssignmentSwapIfInvalid(
  db: DataSource,
  record: PlanningRecord<AssignmentSwapPayload>,
  timeZone: string,
  now = Date.now(),
): Promise<PlanningRecord<AssignmentSwapPayload>> {
  return (await expireInvalidAssignmentSwaps(db, [record], timeZone, now))[0]!;
}
