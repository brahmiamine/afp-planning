import { apiGet } from '@/lib/utils/api';

const SENT_URL = '/sounds/chat-sent.wav';
const RECEIVED_URL = '/sounds/chat-received.wav';
const VOLUME = 0.35;

let enabled = true;
let preferenceLoaded = false;
let preferenceRequest: Promise<void> | null = null;
/** La lecture audio ne peut démarrer qu'après une première interaction utilisateur
 * (politique autoplay des navigateurs) — voir `unlockChatSounds`. */
let unlocked = false;

function loadPreferenceOnce(): void {
  if (preferenceLoaded || preferenceRequest) return;
  preferenceRequest = apiGet<{ preferences: { chatSounds?: boolean } }>('/api/me/notification-preferences')
    .then((data) => {
      enabled = data.preferences.chatSounds !== false;
    })
    .catch(() => {
      // Échec de chargement : on garde la valeur par défaut (activé).
    })
    .finally(() => {
      preferenceLoaded = true;
      preferenceRequest = null;
    });
}

/** À appeler quand l'utilisateur change la préférence dans les réglages, pour un effet
 * immédiat sur les onglets/vues déjà ouverts sans attendre un rechargement. */
export function setChatSoundsEnabled(value: boolean): void {
  enabled = value;
  preferenceLoaded = true;
}

/** Débloque la lecture audio après une première interaction utilisateur (issue #269). */
export function unlockChatSounds(): void {
  if (unlocked || typeof window === 'undefined') return;
  unlocked = true;
  loadPreferenceOnce();
}

function play(url: string): void {
  loadPreferenceOnce();
  if (!enabled || !unlocked || typeof Audio === 'undefined') return;
  try {
    const audio = new Audio(url);
    audio.volume = VOLUME;
    void audio.play().catch(() => undefined);
  } catch {
    // Environnement sans support audio (ex. certains navigateurs embarqués) : silencieux.
  }
}

export function playChatMessageSentSound(): void {
  play(SENT_URL);
}

export function playChatMessageReceivedSound(): void {
  play(RECEIVED_URL);
}
