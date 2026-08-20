import { describe, expect, it } from 'vitest';
import { handshakeClientAddress } from './socket-security';

describe('Socket.IO handshake client address', () => {
  it('uses the Railway-injected client address behind the shared edge proxy', () => {
    expect(
      handshakeClientAddress(
        { 'x-real-ip': '203.0.113.8' },
        '10.0.0.4',
        'railway-environment',
      ),
    ).toBe('203.0.113.8');
  });

  it('does not trust proxy headers outside Railway', () => {
    expect(handshakeClientAddress({ 'x-real-ip': '203.0.113.8' }, '127.0.0.1', '')).toBe('127.0.0.1');
  });

  it('falls back to the TCP peer when Railway sends a malformed address', () => {
    expect(handshakeClientAddress({ 'x-real-ip': 'spoofed' }, '10.0.0.4', 'railway-environment')).toBe(
      '10.0.0.4',
    );
  });
});
