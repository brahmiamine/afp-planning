import html2canvas from 'html2canvas';
import { Match } from '@/types/match';
import { MatchExtras } from '@/hooks/useMatchExtras';
import { buildShareCardModel } from './share-match-card-theme';

interface ShareImageOptions {
  match: Match;
  localTeamLogo?: string;
  awayTeamLogo?: string;
  extras?: MatchExtras | null;
  clubName?: string;
  clubAbbreviation?: string;
  clubLogo?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

function proxied(src?: string): string {
  if (!src) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return /^https?:\/\//i.test(src) && !src.startsWith(origin)
    ? `/api/logo-proxy?url=${encodeURIComponent(src)}`
    : src;
}

export async function generateMatchShareImageSimple({
  match,
  localTeamLogo,
  awayTeamLogo,
  extras,
  clubName,
  clubAbbreviation,
  clubLogo,
  primaryColor,
  secondaryColor,
}: ShareImageOptions): Promise<Blob> {
  const card = buildShareCardModel({
    match,
    extras,
    clubName,
    clubAbbreviation,
    primaryColor,
    secondaryColor,
  });
  const { palette } = card;
  const homeLogo = proxied(localTeamLogo);
  const awayLogo = proxied(awayTeamLogo);
  const brandLogo = proxied(clubLogo);
  const chips = [card.typeLabel, card.venue].filter(Boolean);
  const factsHtml = card.facts.length
    ? card.facts
        .map(
          (fact) => `
            <div>
              <div style="font-size:11px;font-weight:700;letter-spacing:.04em;color:${palette.mutedOnSecondary};margin-bottom:6px;">
                ${escapeHtml(fact.label.toUpperCase())}
              </div>
              <div style="font-size:15px;font-weight:600;color:${palette.onSecondary};line-height:1.3;">
                ${escapeHtml(fact.value)}
              </div>
            </div>`,
        )
        .join('')
    : `<div style="font-size:16px;font-weight:700;">${escapeHtml(card.clubName)}</div>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '0';
  iframe.style.width = '1200px';
  iframe.style.height = '630px';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    throw new Error("Impossible d'accéder au document de l'iframe");
  }

  iframeDoc.open();
  iframeDoc.write(`<!DOCTYPE html><html><head><style>
    html,body{margin:0;padding:0;width:1200px;height:630px;}
    *{box-sizing:border-box;}
  </style></head><body>
    <div id="match-share-image" style="width:1200px;height:630px;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:${palette.secondary};color:${palette.onSecondary};overflow:hidden;">
      <div style="background:${palette.primary};color:${palette.onPrimary};padding:36px 36px 28px;display:flex;align-items:center;justify-content:space-between;gap:24px;">
        <div style="display:flex;align-items:center;gap:16px;min-width:0;">
          ${brandLogo ? `<div style="width:52px;height:52px;border-radius:14px;background:rgba(255,255,255,.16);padding:6px;flex-shrink:0;"><img src="${escapeAttr(brandLogo)}" alt="" style="width:100%;height:100%;object-fit:contain;" crossorigin="anonymous"/></div>` : ''}
          <div>
            ${card.clubName ? `<div style="font-size:22px;font-weight:800;line-height:1.15;">${escapeHtml(card.clubName)}</div>` : ''}
            <div style="font-size:14px;font-weight:500;opacity:.78;margin-top:6px;">${escapeHtml([card.competition, card.date].filter(Boolean).join('  ·  '))}</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-shrink:0;">
          ${chips.map((chip) => `<span style="padding:8px 14px;border-radius:999px;background:${palette.chipOnPrimary};color:${palette.onPrimary};font-size:12px;font-weight:700;">${escapeHtml(chip || '')}</span>`).join('')}
        </div>
      </div>
      <div style="flex:1;display:flex;align-items:center;justify-content:space-between;gap:28px;padding:28px 36px;">
        ${teamHtml(card.homeTeam, homeLogo, palette)}
        <div style="width:168px;display:flex;flex-direction:column;align-items:center;gap:12px;">
          <div style="font-size:28px;font-weight:800;color:${palette.primary};">VS</div>
          <div style="width:148px;padding:14px 0;border-radius:16px;background:${palette.primary};color:${palette.onPrimary};text-align:center;font-size:26px;font-weight:800;">${escapeHtml(card.time || '—')}</div>
          ${card.rendezVous ? `<div style="font-size:13px;font-weight:600;color:${palette.mutedOnSecondary};">RDV ${escapeHtml(card.rendezVous)}</div>` : ''}
        </div>
        ${teamHtml(card.awayTeam, awayLogo, palette)}
      </div>
      <div style="padding:22px 36px 26px;background:${palette.onSecondary === '#111827' ? `${palette.primary}14` : `${palette.primary}38`};display:grid;grid-template-columns:repeat(${Math.max(card.facts.length, 1)},minmax(0,1fr));gap:16px;">
        ${factsHtml}
      </div>
    </div>
  </body></html>`);
  iframeDoc.close();

  await new Promise((resolve) => setTimeout(resolve, 280));
  const element = iframeDoc.getElementById('match-share-image');
  if (!element) {
    document.body.removeChild(iframe);
    throw new Error("Le composant d'image n'a pas pu être rendu.");
  }

  const images = Array.from(element.querySelectorAll('img'));
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );

  try {
    const canvas = await html2canvas(element, {
      width: 1200,
      height: 630,
      scale: 2,
      backgroundColor: palette.secondary,
      logging: false,
      useCORS: true,
      allowTaint: false,
    });
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Échec de la conversion du canvas en image'));
      }, 'image/png', 1.0);
    });
  } finally {
    document.body.removeChild(iframe);
  }
}

function teamHtml(name: string, logo: string, palette: { primary: string; onSecondary: string }) {
  const surface = palette.onSecondary === '#111827' ? '#ffffff' : palette.primary;
  return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:16px;">
    <div style="width:118px;height:118px;border-radius:18px;background:${surface};display:flex;align-items:center;justify-content:center;padding:12px;">
      ${
        logo
          ? `<img src="${escapeAttr(logo)}" alt="" style="width:100%;height:100%;object-fit:contain;" crossorigin="anonymous"/>`
          : `<div style="font-size:36px;font-weight:800;color:${palette.primary};">${escapeHtml(name.charAt(0).toUpperCase())}</div>`
      }
    </div>
    <div style="font-size:24px;font-weight:800;color:${palette.onSecondary};text-align:center;line-height:1.2;">${escapeHtml(name)}</div>
  </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
