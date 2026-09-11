"use client";

import { Match } from "@/types/match";
import { MatchExtras } from "@/hooks/useMatchExtras";
import { buildShareCardModel } from "@/lib/utils/share-match-card-theme";

interface MatchShareImageProps {
  match: Match;
  extras?: MatchExtras | null;
  localTeamLogo?: string;
  awayTeamLogo?: string;
  clubName?: string;
  clubAbbreviation?: string;
  clubLogo?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

function proxied(src?: string): string | undefined {
  if (!src) return src;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return /^https?:\/\//i.test(src) && !src.startsWith(origin)
    ? `/api/logo-proxy?url=${encodeURIComponent(src)}`
    : src;
}

function TeamBlock({
  name,
  logo,
  color,
  surface,
}: {
  name: string;
  logo?: string;
  color: string;
  surface: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 148,
          height: 148,
          borderRadius: 20,
          background: surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 12,
          boxShadow: "0 10px 28px rgba(15, 23, 42, 0.08)",
        }}
      >
        {logo ? (
          <img
            src={logo}
            alt={name}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
            crossOrigin="anonymous"
          />
        ) : (
          <div style={{ fontSize: 36, fontWeight: 800, color }}>{name.charAt(0).toUpperCase()}</div>
        )}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          color,
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {name}
      </div>
    </div>
  );
}

export function MatchShareImage({
  match,
  extras,
  localTeamLogo,
  awayTeamLogo,
  clubName,
  clubAbbreviation,
  clubLogo,
  primaryColor,
  secondaryColor,
}: MatchShareImageProps) {
  const card = buildShareCardModel({
    match,
    extras,
    clubName,
    clubAbbreviation,
    primaryColor,
    secondaryColor,
  });
  const { palette } = card;
  const localLogoSrc = proxied(localTeamLogo);
  const awayLogoSrc = proxied(awayTeamLogo);
  const clubLogoSrc = proxied(clubLogo);
  const logoSurface = palette.onSecondary === "#111827" ? "#ffffff" : palette.primary;
  const chips = [card.typeLabel, card.venue].filter(Boolean);
  const chipFill = palette.onPrimary === "#f8fafc" ? "#ffffff" : palette.chipOnPrimary;
  const chipColor = palette.onPrimary === "#f8fafc" ? palette.primary : palette.onPrimary;

  return (
    <div
      id="match-share-image"
      style={{
        width: 1200,
        height: 630,
        margin: 0,
        overflow: "hidden",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        background: palette.secondary,
        color: palette.onSecondary,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          background: `linear-gradient(90deg, ${palette.primary} 0%, ${palette.primary} 100%)`,
          color: palette.onPrimary,
          padding: "36px 36px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
          {clubLogoSrc && (
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 16,
                background: "rgba(255,255,255,0.16)",
                padding: 6,
                flexShrink: 0,
              }}
            >
              <img
                src={clubLogoSrc}
                alt={card.clubName || "Club"}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
                crossOrigin="anonymous"
              />
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            {card.clubName && (
              <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15 }}>{card.clubName}</div>
            )}
            <div style={{ fontSize: 18, fontWeight: 600, opacity: 0.86, marginTop: 6 }}>
              {[card.competition, card.date].filter(Boolean).join("  ·  ")}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          {chips.map((chip) => (
            <span
              key={chip}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                background: chipFill,
                color: chipColor,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 28,
          padding: "28px 36px",
          minHeight: 0,
        }}
      >
        <TeamBlock name={card.homeTeam} logo={localLogoSrc} color={palette.onSecondary} surface={logoSurface} />

        <div style={{ width: 168, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: palette.primary }}>VS</div>
          <div
            style={{
              width: 168,
              padding: "16px 0",
              borderRadius: 18,
              background: palette.primary,
              color: palette.onPrimary,
              textAlign: "center",
              fontSize: 30,
              fontWeight: 800,
            }}
          >
            {card.time || "—"}
          </div>
          {card.rendezVous && (
            <div style={{ fontSize: 16, fontWeight: 700, color: palette.mutedOnSecondary }}>RDV {card.rendezVous}</div>
          )}
        </div>

        <TeamBlock name={card.awayTeam} logo={awayLogoSrc} color={palette.onSecondary} surface={logoSurface} />
      </div>

      <div
        style={{
          padding: "22px 36px 26px",
          background: palette.onSecondary === "#111827" ? `${palette.primary}14` : `${palette.primary}38`,
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(card.facts.length, 1)}, minmax(0, 1fr))`,
          gap: 16,
        }}
      >
        {card.facts.length ? (
          card.facts.map((fact) => (
            <div key={`${fact.label}-${fact.value}`} style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  color: palette.primary,
                  marginBottom: 6,
                }}
              >
                {fact.label.toUpperCase()}
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, color: palette.onSecondary, lineHeight: 1.3, whiteSpace: "pre-line" }}>
                {fact.value}
              </div>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 16, fontWeight: 700 }}>{card.clubName}</div>
        )}
      </div>
    </div>
  );
}
