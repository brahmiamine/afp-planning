import { describe, expect, it } from 'vitest';
import { isAssignmentSwapOpen, nextAssignmentSwapStatus } from './assignment-swaps';

describe('assignment swap workflow', () => {
  it('requires target acceptance before admin approval', () => {
    expect(nextAssignmentSwapStatus('pending-target', 'target', 'accept')).toBe('pending-admin');
    expect(nextAssignmentSwapStatus('pending-target', 'admin', 'approve')).toBeNull();
    expect(nextAssignmentSwapStatus('pending-admin', 'admin', 'approve')).toBe('approved');
  });

  it('closes the request on target decline or admin rejection', () => {
    expect(nextAssignmentSwapStatus('pending-target', 'target', 'decline')).toBe('declined');
    expect(nextAssignmentSwapStatus('pending-admin', 'admin', 'reject')).toBe('rejected');
    expect(isAssignmentSwapOpen('declined')).toBe(false);
    expect(isAssignmentSwapOpen('pending-admin')).toBe(true);
  });
});
