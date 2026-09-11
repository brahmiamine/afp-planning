/**
 * Identité d’installation PWA dans le document (Android = manifeste,
 * iOS = apple-touch-icon + apple-mobile-web-app-title).
 * On met à jour les balises existantes au lieu de les supprimer : Next.js
 * les possède via les métadonnées et un remove() provoque removeChild(null).
 */

function setLinkHref(rel: string, href: string, sizes?: string): HTMLLinkElement {
  const selector = sizes
    ? `link[rel="${rel}"][sizes="${sizes}"]`
    : `link[rel="${rel}"]`;
  let link = document.querySelector<HTMLLinkElement>(selector);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    if (sizes) link.sizes = sizes;
    link.dataset.pwaManaged = 'true';
    document.head.appendChild(link);
  }
  link.href = href;
  return link;
}

function setMetaContent(name: string, content: string): void {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    meta.dataset.pwaManaged = 'true';
    document.head.appendChild(meta);
  }
  meta.content = content;
}

export function applyClubPwaDocumentHead(options: {
  iconHref: string;
  manifestHref: string;
  appName: string;
  shortName: string;
  themeColor: string;
}): void {
  setLinkHref('apple-touch-icon', options.iconHref, '180x180');
  setLinkHref('apple-touch-icon', options.iconHref, '192x192');

  document.head.querySelectorAll('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]').forEach((node) => {
    if (node instanceof HTMLLinkElement) {
      node.href = options.iconHref;
    }
  });

  setLinkHref('manifest', options.manifestHref);
  setMetaContent('apple-mobile-web-app-title', options.shortName);
  setMetaContent('application-name', options.appName);
  setMetaContent('apple-mobile-web-app-capable', 'yes');
  setMetaContent('mobile-web-app-capable', 'yes');
  setMetaContent('theme-color', options.themeColor);
}
