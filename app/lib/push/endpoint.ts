export function isTrustedPushEndpoint(value: string): boolean {
  if (!value || value.length > 4096) return false;

  try {
    const endpoint = new URL(value);
    if (endpoint.protocol !== 'https:') return false;

    const hostname = endpoint.hostname.toLowerCase();
    return (
      hostname === 'fcm.googleapis.com' ||
      hostname.endsWith('.push.services.mozilla.com') ||
      hostname.endsWith('.push.apple.com')
    );
  } catch {
    return false;
  }
}
