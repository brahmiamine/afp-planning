/**
 * Accès micro pour les messages vocaux.
 * `getUserMedia({ audio: true })` est ce qui déclenche le prompt d'autorisation
 * du navigateur — à appeler depuis un geste utilisateur (clic sur le micro).
 */
export async function requestMicrophoneStream(): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    const error = new Error("L'enregistrement audio n'est pas disponible sur cet appareil");
    error.name = 'NotSupportedError';
    throw error;
  }

  return navigator.mediaDevices.getUserMedia({ audio: true });
}

export function describeMicrophoneError(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error
    ? String((error as { name: unknown }).name)
    : '';

  if (name === 'NotSupportedError') {
    return "L'enregistrement audio n'est pas disponible sur cet appareil";
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Aucun microphone n’a été trouvé sur cet appareil.';
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'Le microphone a été refusé. Autorisez-le dans les réglages du navigateur puis réessayez.';
  }
  return 'Impossible d’accéder au microphone. Vérifiez l’autorisation du navigateur puis réessayez.';
}
