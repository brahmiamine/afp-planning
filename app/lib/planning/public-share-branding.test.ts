import { describe, expect, it } from 'vitest';
import { buildPublicShareMetadata } from './public-share-branding';

describe('buildPublicShareMetadata', () => {
  it('utilise un titre générique quand le jeton est invalide', async () => {
    await expect(buildPublicShareMetadata('token-trop-court')).resolves.toEqual({
      title: 'Planning partagé',
    });
  });
});
