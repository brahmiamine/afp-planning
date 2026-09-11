/** Navigateurs embarqués (IDE, Electron…) : PushManager existe mais sans backend FCM/APNs. */
export function isEmbeddedBrowser(userAgent: string): boolean {
  return /Electron\//i.test(userAgent) || /\bCursor\//i.test(userAgent);
}

/** Contexte navigateur où l’enregistrement Web Push a une chance de fonctionner. */
export function canUseWebPush(userAgent: string, isSecureContext: boolean): boolean {
  if (!isSecureContext) return false;
  if (isEmbeddedBrowser(userAgent)) return false;
  return true;
}

export function isPushServiceUnavailableError(error: unknown): boolean {
  if (!(error instanceof DOMException || error instanceof Error)) return false;
  return error.message.toLowerCase().includes('push service not available');
}

export function encodeBase64Url(bytes: ArrayBuffer | ArrayBufferView): string {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let binary = '';
  for (let index = 0; index < view.byteLength; index += 1) {
    binary += String.fromCharCode(view[index]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function subscriptionUsesVapidKey(
  applicationServerKey: ArrayBuffer | ArrayBufferView | null | undefined,
  publicKey: string,
): boolean {
  if (!applicationServerKey) return false;
  return encodeBase64Url(applicationServerKey) === publicKey.replace(/=+$/g, '');
}

export const PUSH_UNAVAILABLE_MESSAGE =
  'Les notifications push ne sont pas disponibles dans ce navigateur. '
  + 'Ouvrez l’application installée sur votre téléphone (Chrome ou Safari) pour les activer.';
