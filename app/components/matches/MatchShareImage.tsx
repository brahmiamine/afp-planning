'use client';

import { Match } from '@/types/match';
import { MatchExtras } from '@/hooks/useMatchExtras';

interface MatchShareImageProps {
  match: Match;
  extras?: MatchExtras | null;
  localTeamLogo?: string;
  awayTeamLogo?: string;
}

export function MatchShareImage({
  match,
  extras: _extras,
  localTeamLogo,
  awayTeamLogo,
}: MatchShareImageProps) {
  return (
    <div
      id="match-share-image"
      style={{
        width: '1200px',
        height: '630px',
        padding: '0',
        margin: '0',
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%)',
        borderRadius: '24px',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        color: '#ffffff',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* Gradient overlay pour plus de profondeur */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(circle at 30% 50%, rgba(59, 130, 246, 0.1) 0%, transparent 50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Contenu principal */}
      <div
        style={{
          width: '100%',
          height: '100%',
          padding: '60px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Header avec date et compétition */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '4px',
                  height: '40px',
                  background: 'linear-gradient(180deg, #3b82f6 0%, #1e40af 100%)',
                  borderRadius: '2px',
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: '14px',
                    color: '#9ca3af',
                    fontWeight: 500,
                    marginBottom: '4px',
                  }}
                >
                  DATE
                </div>
                <div
                  style={{
                    fontSize: '28px',
                    fontWeight: 700,
                    color: '#ffffff',
                  }}
                >
                  {match.date}
                </div>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                backdropFilter: 'blur(10px)',
              }}
            >
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                {match.venue === 'domicile' ? '🏠' : '✈️'}
              </span>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                }}
              >
                {match.venue === 'domicile' ? 'Domicile' : 'Extérieur'}
              </span>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '8px',
            }}
          >
            <span
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#ffffff',
              }}
            >
              {match.competition}
            </span>
            {match.categorie && (
              <span
                style={{
                  fontSize: '12px',
                  padding: '4px 12px',
                  background: 'rgba(59, 130, 246, 0.2)',
                  borderRadius: '8px',
                  color: '#60a5fa',
                  fontWeight: 500,
                }}
              >
                {match.categorie}
              </span>
            )}
          </div>
        </div>

        {/* Équipes */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '40px',
            flex: 1,
            margin: '40px 0',
          }}
        >
          {/* Équipe locale */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '20px',
            }}
          >
            <div
              style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              }}
            >
              {localTeamLogo ? (
                <img
                  src={localTeamLogo}
                  alt={match.localTeam}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                  }}
                  crossOrigin="anonymous"
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '48px',
                    fontWeight: 700,
                    color: '#ffffff',
                  }}
                >
                  {match.localTeam.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div
              style={{
                fontSize: '32px',
                fontWeight: 700,
                color: '#ffffff',
                textAlign: 'center',
                lineHeight: 1.2,
              }}
            >
              {match.localTeam}
            </div>
          </div>

          {/* VS */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              padding: '0 20px',
            }}
          >
            <div
              style={{
                fontSize: '48px',
                fontWeight: 900,
                color: '#3b82f6',
                textShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
              }}
            >
              VS
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '12px 20px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div
                style={{
                  fontSize: '24px',
                  fontWeight: 700,
                  color: '#ffffff',
                }}
              >
                {match.time}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#9ca3af',
                  marginTop: '4px',
                }}
              >
                RDV: {match.horaireRendezVous}
              </div>
            </div>
          </div>

          {/* Équipe adverse */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '20px',
            }}
          >
            <div
              style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              }}
            >
              {awayTeamLogo ? (
                <img
                  src={awayTeamLogo}
                  alt={match.awayTeam}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                  }}
                  crossOrigin="anonymous"
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '48px',
                    fontWeight: 700,
                    color: '#ffffff',
                  }}
                >
                  {match.awayTeam.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div
              style={{
                fontSize: '32px',
                fontWeight: 700,
                color: '#ffffff',
                textAlign: 'center',
                lineHeight: 1.2,
              }}
            >
              {match.awayTeam}
            </div>
          </div>
        </div>

        {/* Footer avec détails supplémentaires */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '24px',
            paddingTop: '24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          {match.details?.stadium && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: '#9ca3af',
                  fontWeight: 500,
                }}
              >
                STADE
              </div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#ffffff',
                }}
              >
                {match.details.stadium}
              </div>
              {match.details.address && (
                <div
                  style={{
                    fontSize: '12px',
                    color: '#9ca3af',
                    marginTop: '2px',
                  }}
                >
                  {match.details.address}
                </div>
              )}
            </div>
          )}
          {match.staff?.referee && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: '#9ca3af',
                  fontWeight: 500,
                }}
              >
                ARBITRE
              </div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#ffffff',
                }}
              >
                {match.staff.referee}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
