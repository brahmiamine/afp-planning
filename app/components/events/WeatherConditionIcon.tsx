import type { ReactNode } from 'react';
import type { WeatherIconKind } from '@/lib/planning/weather-types';

interface WeatherConditionIconProps {
  kind: WeatherIconKind;
  label: string;
  className?: string;
}

function Svg({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={label}
      className={className ?? 'h-12 w-12 shrink-0 text-sky-500'}
      fill="currentColor"
    >
      {children}
    </svg>
  );
}

const sunCore = (
  <>
    <circle cx="32" cy="32" r="11" />
    <g stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none">
      <path d="M32 6v7M32 51v7M6 32h7M51 32h7M13 13l5 5M46 46l5 5M13 51l5-5M46 18l5-5" />
    </g>
  </>
);

const smallSun = (
  <>
    <circle cx="22" cy="20" r="7" />
    <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none">
      <path d="M22 6v5M6 20h5M12 10l3.2 3.2M32 10l-3.2 3.2" />
    </g>
  </>
);

const moonCore = (
  <path d="M40 10c-8.8 0-16 8.5-16 19s7.2 19 16 19c2.6 0 5.1-.5 7.3-1.5C42.6 54 34.2 58 25 58 12.3 58 2 47.3 2 34S12.3 10 25 10c4.6 0 8.9 1.4 12.4 3.8C36.2 12.6 38 11 40 10Z" />
);

const smallMoon = (
  <path d="M28 8c-4.8 0-8.8 4.6-8.8 10.4S23.2 29 28 29c1.4 0 2.8-.3 4-.8C30.6 31.6 26 34 20.8 34 13.8 34 8 28.2 8 21S13.8 8 20.8 8c2.4 0 4.6.7 6.5 1.9-.4-.6-1.3-1.4-2.3-1.9Z" />
);

const cloud = (
  <path d="M18 28c-7.2 0-13 5.4-13 12s5.8 12 13 12h28c7.2 0 13-5.4 13-12s-5.8-12-13-12c-.8 0-1.6.1-2.4.2C41.2 21.4 35.1 17 28 17c-8.3 0-15.2 6.1-16.3 14.1-.5-.1-1.1-.1-1.7-.1Z" />
);

const highCloud = (
  <path d="M20 16c-7.2 0-13 5.2-13 11.6 0 1.2.2 2.3.6 3.4C4.4 32.4 2 36 2 40.2 2 46 7.2 51 13.6 51H42c7.2 0 13-5.4 13-12s-5.8-12-13-12c-.5 0-1 0-1.5.1C39.2 20.4 33.4 16 26.8 16H20Z" />
);

function iconPaths(kind: WeatherIconKind) {
  switch (kind) {
    case 'sun':
      return sunCore;
    case 'moon':
      return moonCore;
    case 'sun-cloud':
      return (
        <>
          {smallSun}
          <path d="M24 36c-6.2 0-11.2 4.4-11.2 9.8S17.8 55.6 24 55.6h21c5.7 0 10.4-4 10.4-9 0-4.1-3.2-7.5-7.5-8.6C46.7 32.8 41.8 29.4 36 29.4c-4.1 0-7.8 1.6-10.3 4.2-.3-.1-.6-.1-1.7 2.4Z" />
        </>
      );
    case 'moon-cloud':
      return (
        <>
          {smallMoon}
          <path d="M24 36c-6.2 0-11.2 4.4-11.2 9.8S17.8 55.6 24 55.6h21c5.7 0 10.4-4 10.4-9 0-4.1-3.2-7.5-7.5-8.6C46.7 32.8 41.8 29.4 36 29.4c-4.1 0-7.8 1.6-10.3 4.2-.3-.1-.6-.1-1.7 2.4Z" />
        </>
      );
    case 'cloud-sun':
      return (
        <>
          {smallSun}
          <path d="M24 38c-6.6 0-12 4.7-12 10.5S17.4 59 24 59h22c6.1 0 11-4.3 11-9.6 0-4.4-3.4-8.1-8-9.2C47.6 34.6 42.4 31 36 31c-4.4 0-8.3 1.7-11 4.4C24.7 35.2 24.3 35.2 24 38Z" />
        </>
      );
    case 'cloud-moon':
      return (
        <>
          {smallMoon}
          <path d="M24 38c-6.6 0-12 4.7-12 10.5S17.4 59 24 59h22c6.1 0 11-4.3 11-9.6 0-4.4-3.4-8.1-8-9.2C47.6 34.6 42.4 31 36 31c-4.4 0-8.3 1.7-11 4.4C24.7 35.2 24.3 35.2 24 38Z" />
        </>
      );
    case 'cloud':
      return cloud;
    case 'fog':
      return (
        <g stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M10 24h36M8 34h48M14 44h34" />
        </g>
      );
    case 'cloud-drizzle':
      return (
        <>
          {highCloud}
          <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none">
            <path d="M18 55v4M28 57v4M38 55v4" />
          </g>
        </>
      );
    case 'freezing-rain':
      return (
        <>
          {highCloud}
          <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none">
            <path d="M18 54v6M30 56v6" />
          </g>
          <circle cx="40" cy="58" r="2.2" />
          <circle cx="46" cy="54" r="1.6" />
        </>
      );
    case 'cloud-rain':
      return (
        <>
          {highCloud}
          <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none">
            <path d="M18 54v7M28 56v7M38 54v7" />
          </g>
        </>
      );
    case 'cloud-rain-heavy':
      return (
        <>
          {highCloud}
          <g stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" fill="none">
            <path d="M14 54v8M24 56v8M34 54v8M44 56v8" />
          </g>
        </>
      );
    case 'cloud-snow':
      return (
        <>
          {highCloud}
          <g fill="currentColor">
            <circle cx="18" cy="56" r="2.2" />
            <circle cx="28" cy="58" r="2.2" />
            <circle cx="38" cy="55" r="2.2" />
          </g>
        </>
      );
    case 'cloud-snow-heavy':
      return (
        <>
          {highCloud}
          <g fill="currentColor">
            <circle cx="16" cy="55" r="2.3" />
            <circle cx="26" cy="58" r="2.3" />
            <circle cx="36" cy="55" r="2.3" />
            <circle cx="22" cy="61" r="1.7" />
            <circle cx="32" cy="61" r="1.7" />
            <circle cx="42" cy="59" r="1.7" />
          </g>
        </>
      );
    case 'snowflake':
      return (
        <g stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" fill="none">
          <path d="M32 8v48M10 21l44 22M10 43l44-22M18 12l28 40M46 12 18 52" />
        </g>
      );
    case 'cloud-lightning':
      return (
        <>
          <path d="M20 12c-7.2 0-13 5.2-13 11.6 0 1 .2 2 .5 3C4.3 27.8 2 31.2 2 35.2 2 40.8 7 45.6 13.2 45.6H28l-3 8h8l-4 10 16-20H41c7 0 12.6-5.2 12.6-11.6S48 22.4 41 22.4c-.5 0-1 0-1.4.1C38.3 16.4 32.8 12 26.4 12H20Z" />
        </>
      );
    case 'cloud-hail':
      return (
        <>
          {highCloud}
          <g fill="currentColor">
            <circle cx="18" cy="56" r="2.6" />
            <circle cx="30" cy="59" r="2.6" />
            <circle cx="42" cy="56" r="2.6" />
          </g>
        </>
      );
  }
}

export function WeatherConditionIcon({ kind, label, className }: WeatherConditionIconProps) {
  return (
    <Svg label={label} className={className}>
      {iconPaths(kind)}
    </Svg>
  );
}
