import { afterEach, describe, expect, it } from 'vitest';
import { getDataSource } from '@/lib/db/data-source';
import { isDbAvailable } from '@/lib/db/test-utils';
import {
  acceptsSharedHandshake,
  acceptsSharedSlidingLimit,
  handshakeBucketKey,
  purgeSharedRateLimitBucket,
  userMessageBucketKey,
} from './socket-rate-limit';

const dbAvailable = await isDbAvailable();

describe.skipIf(!dbAvailable)('shared chat socket rate limits (issue #352)', () => {
  const bucketsToCleanup: string[] = [];

  afterEach(async () => {
    const db = await getDataSource();
    for (const bucketKey of bucketsToCleanup.splice(0)) {
      await purgeSharedRateLimitBucket(db, bucketKey);
    }
  });

  it('partage une fenêtre glissante entre deux instances simulées', async () => {
    const db = await getDataSource();
    const bucketKey = handshakeBucketKey('203.0.113.55');
    bucketsToCleanup.push(bucketKey);

    for (let i = 0; i < 3; i += 1) {
      expect(await acceptsSharedSlidingLimit(db, bucketKey, 3, 10_000)).toBe(true);
    }
    expect(await acceptsSharedSlidingLimit(db, bucketKey, 3, 10_000)).toBe(false);
  });

  it('applique le quota global de handshake avant le quota par adresse', async () => {
    const db = await getDataSource();
    bucketsToCleanup.push(handshakeBucketKey('198.51.100.42'));

    expect(await acceptsSharedHandshake(db, '198.51.100.42', {
      globalMaximum: 1,
      perAddressMaximum: 40,
    })).toBe(true);
    expect(await acceptsSharedHandshake(db, '203.0.113.9', {
      globalMaximum: 1,
      perAddressMaximum: 40,
    })).toBe(false);
  });

  it('limite les messages utilisateur via un bucket partagé', async () => {
    const db = await getDataSource();
    const bucketKey = userMessageBucketKey(424_242);
    bucketsToCleanup.push(bucketKey);

    expect(await acceptsSharedSlidingLimit(db, bucketKey, 2, 10_000)).toBe(true);
    expect(await acceptsSharedSlidingLimit(db, bucketKey, 2, 10_000)).toBe(true);
    expect(await acceptsSharedSlidingLimit(db, bucketKey, 2, 10_000)).toBe(false);
  });
});
