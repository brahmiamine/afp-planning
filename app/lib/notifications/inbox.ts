/** Types liés aux messages chat — affichés dans l'onglet Chat, pas dans /notifications. */
export const CHAT_INBOX_EXCLUDED_TYPES = [
  'chat-dm',
  'chat-event-message',
  'chat-channel-message',
  'chat-mention',
] as const;
