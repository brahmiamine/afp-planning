import { describe, expect, it } from 'vitest';
import { parseDeleteCommand, parseMessageCommand, parseResumeCommand, parseTypingCommand } from './protocol';

describe('chat message protocol', () => {
  it('normalizes a valid idempotent message command', () => {
    expect(
      parseMessageCommand({
        roomId: 'room-123',
        clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
        content: '  Bonjour à tous  ',
      }),
    ).toEqual({
      roomId: 'room-123',
      clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
      content: 'Bonjour à tous',
      attachment: null,
    });
  });

  it('rejects empty, oversized and non-idempotent commands', () => {
    expect(() => parseMessageCommand({ roomId: 'room-123', clientMessageId: 'bad', content: ' ' })).toThrow(
      'Message vide',
    );
    expect(() =>
      parseMessageCommand({
        roomId: 'room-123',
        clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'x'.repeat(4_001),
      }),
    ).toThrow('Message trop long');
    expect(() => parseMessageCommand({ roomId: 'room-123', clientMessageId: 'bad', content: 'Bonjour' })).toThrow(
      'Identifiant de message invalide',
    );
  });

  it('rejects malformed room identifiers before any database lookup', () => {
    expect(() =>
      parseMessageCommand({
        roomId: '../room',
        clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'Bonjour',
      }),
    ).toThrow('Salon invalide');
  });
});

describe('chat reconnect protocol', () => {
  it('accepts a server sequence cursor and rejects malformed cursors', () => {
    expect(parseResumeCommand({ roomId: 'room-123', afterSequence: 42 })).toEqual({
      roomId: 'room-123',
      afterSequence: 42,
    });
    expect(() => parseResumeCommand({ roomId: 'room-123', afterSequence: -1 })).toThrow(
      'Séquence de reprise invalide',
    );
  });
});

describe('chat typing protocol (issue #267)', () => {
  it('accepts a valid room id', () => {
    expect(parseTypingCommand({ roomId: 'room-123' })).toEqual({ roomId: 'room-123' });
  });

  it('rejects a malformed room id', () => {
    expect(() => parseTypingCommand({ roomId: '../room' })).toThrow('Salon invalide');
    expect(() => parseTypingCommand({})).toThrow('Salon invalide');
  });
});

describe('chat delete protocol (issue #259)', () => {
  it('accepts a valid room + message id pair', () => {
    expect(parseDeleteCommand({ roomId: 'room-123', messageId: '550e8400-e29b-41d4-a716-446655440000' })).toEqual({
      roomId: 'room-123',
      messageId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('rejects a malformed message id or room id', () => {
    expect(() => parseDeleteCommand({ roomId: 'room-123', messageId: 'not-a-uuid' })).toThrow('Message invalide');
    expect(() => parseDeleteCommand({ roomId: '../room', messageId: '550e8400-e29b-41d4-a716-446655440000' })).toThrow(
      'Salon invalide',
    );
  });
});
