import { ClubInfo } from '@/types/match';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AppSettings {
    clubName: string;
    clubDescription: string;
    clubLogo: string;
    matchesUrlKey: string;
    themeMode: ThemeMode;
    primaryColor: string;
    accentColor: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
    clubName: 'Academie Football Paris 18',
    clubDescription: 'Club de Football à Paris 18',
    clubLogo: '',
    matchesUrlKey: 'academie-football-paris-18',
    themeMode: 'system',
    primaryColor: '#1f2937',
    accentColor: '#e5e7eb',
};

export const APP_SETTINGS_META_KEY = 'app_settings_v1';

function isThemeMode(value: unknown): value is ThemeMode {
    return value === 'light' || value === 'dark' || value === 'system';
}

function toStringValue(value: unknown, fallback: string): string {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeMatchesUrlKey(value: unknown, fallback: string): string {
    if (typeof value !== 'string') {
        return fallback;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return fallback;
    }

    const clubPathPattern = /\/clubs\/([^/?#]+)/i;
    const fromPath = trimmed.match(clubPathPattern)?.[1] ?? trimmed.split('/').filter(Boolean).at(-1) ?? trimmed;

    const normalized = fromPath
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return normalized || fallback;
}

function isHexColor(value: string): boolean {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

function normalizeColor(value: unknown, fallback: string): string {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    if (!isHexColor(trimmed)) {
        return fallback;
    }
    if (trimmed.length === 4) {
        const r = trimmed[1] ?? '0';
        const g = trimmed[2] ?? '0';
        const b = trimmed[3] ?? '0';
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return trimmed.toLowerCase();
}

export function normalizeAppSettings(input: unknown): AppSettings {
    if (!input || typeof input !== 'object') {
        return DEFAULT_APP_SETTINGS;
    }

    const candidate = input as Partial<AppSettings>;

    return {
        clubName: toStringValue(candidate.clubName, DEFAULT_APP_SETTINGS.clubName),
        clubDescription: toStringValue(candidate.clubDescription, DEFAULT_APP_SETTINGS.clubDescription),
        clubLogo: typeof candidate.clubLogo === 'string' ? candidate.clubLogo.trim() : DEFAULT_APP_SETTINGS.clubLogo,
        matchesUrlKey: normalizeMatchesUrlKey(candidate.matchesUrlKey, DEFAULT_APP_SETTINGS.matchesUrlKey),
        themeMode: isThemeMode(candidate.themeMode) ? candidate.themeMode : DEFAULT_APP_SETTINGS.themeMode,
        primaryColor: normalizeColor(candidate.primaryColor, DEFAULT_APP_SETTINGS.primaryColor),
        accentColor: normalizeColor(candidate.accentColor, DEFAULT_APP_SETTINGS.accentColor),
    };
}

export function mergeClubWithSettings(baseClub: ClubInfo | undefined, settings: AppSettings): ClubInfo {
    return {
        name: settings.clubName || baseClub?.name || DEFAULT_APP_SETTINGS.clubName,
        description: settings.clubDescription || baseClub?.description || DEFAULT_APP_SETTINGS.clubDescription,
        logo: settings.clubLogo || baseClub?.logo || '',
    };
}

function getLuminance(hexColor: string): number {
    const hex = hexColor.replace('#', '');
    const normalizedHex = hex.length === 3
        ? `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
        : hex;

    const r = Number.parseInt(normalizedHex.slice(0, 2), 16) / 255;
    const g = Number.parseInt(normalizedHex.slice(2, 4), 16) / 255;
    const b = Number.parseInt(normalizedHex.slice(4, 6), 16) / 255;

    const toLinear = (channel: number) =>
        channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getReadableForeground(hexColor: string): string {
    return getLuminance(hexColor) > 0.5 ? '#111827' : '#f9fafb';
}

export function applyThemeVariables(settings: AppSettings): void {
    if (typeof window === 'undefined') {
        return;
    }

    const rootStyle = document.documentElement.style;
    const primary = normalizeColor(settings.primaryColor, DEFAULT_APP_SETTINGS.primaryColor);
    const accent = normalizeColor(settings.accentColor, DEFAULT_APP_SETTINGS.accentColor);

    rootStyle.setProperty('--primary', primary);
    rootStyle.setProperty('--ring', primary);
    rootStyle.setProperty('--sidebar-primary', primary);
    rootStyle.setProperty('--primary-foreground', getReadableForeground(primary));

    rootStyle.setProperty('--accent', accent);
    rootStyle.setProperty('--sidebar-accent', accent);
    rootStyle.setProperty('--accent-foreground', getReadableForeground(accent));
}
