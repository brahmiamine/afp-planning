import { isIP } from 'node:net';

type HeaderValue = string | string[] | undefined;

function firstHeaderValue(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function handshakeClientAddress(
  headers: Record<string, HeaderValue>,
  remoteAddress: string | undefined,
  trustProxyHeaders = process.env.TRUST_PROXY_HEADERS === 'true',
): string {
  if (trustProxyHeaders) {
    const proxiedClientAddress = firstHeaderValue(headers['x-real-ip'])?.trim();
    if (proxiedClientAddress && isIP(proxiedClientAddress)) return proxiedClientAddress;
  }
  return remoteAddress || 'unknown';
}
