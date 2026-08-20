import { isIP } from 'node:net';

type HeaderValue = string | string[] | undefined;

function firstHeaderValue(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function handshakeClientAddress(
  headers: Record<string, HeaderValue>,
  remoteAddress: string | undefined,
  railwayEnvironmentId = process.env.RAILWAY_ENVIRONMENT_ID,
): string {
  if (railwayEnvironmentId) {
    const railwayClientAddress = firstHeaderValue(headers['x-real-ip'])?.trim();
    if (railwayClientAddress && isIP(railwayClientAddress)) return railwayClientAddress;
  }
  return remoteAddress || 'unknown';
}
