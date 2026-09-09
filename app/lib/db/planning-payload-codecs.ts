import type { MatchExtras } from '@/hooks/useMatchExtras';
import type {
  Entrainement,
  Match,
  MatchType,
  PlanningPublicationStatus,
  Plateau,
} from '@/types/match';

export const PLANNING_PAYLOAD_SCHEMA_VERSION = 1 as const;

export class PlanningPayloadValidationError extends Error {
  constructor(entity: string, reason: string) {
    super(`Payload ${entity} invalide : ${reason}`);
    this.name = 'PlanningPayloadValidationError';
  }
}

type PayloadRecord = Record<string, unknown>;

function asRecord(raw: unknown, entity: string): PayloadRecord {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PlanningPayloadValidationError(entity, 'objet JSON attendu');
  }
  return raw as PayloadRecord;
}

function domainRecord(raw: unknown, entity: string): PayloadRecord {
  const record = asRecord(raw, entity);
  const version = record.schemaVersion;
  if (version !== undefined && version !== PLANNING_PAYLOAD_SCHEMA_VERSION) {
    throw new PlanningPayloadValidationError(
      entity,
      `schemaVersion non supportée (${String(version)})`,
    );
  }
  const { schemaVersion: _schemaVersion, ...domain } = record;
  return domain;
}

function requireString(record: PayloadRecord, key: string, entity: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PlanningPayloadValidationError(entity, `${key} doit être une chaîne non vide`);
  }
  return value;
}

function optionalString(
  record: PayloadRecord,
  key: string,
  entity: string,
  fallback = '',
): string {
  const value = record[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'string') {
    throw new PlanningPayloadValidationError(entity, `${key} doit être une chaîne`);
  }
  return value;
}

function validateOptionalNonNegativeInteger(
  record: PayloadRecord,
  key: string,
  entity: string,
): void {
  const value = record[key];
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new PlanningPayloadValidationError(entity, `${key} doit être un entier positif ou nul`);
  }
}

function validateOptionalArray(record: PayloadRecord, key: string, entity: string): void {
  const value = record[key];
  if (value !== undefined && !Array.isArray(value)) {
    throw new PlanningPayloadValidationError(entity, `${key} doit être un tableau`);
  }
}

function validatePlanningStatus(record: PayloadRecord, entity: string): void {
  const value = record.planningStatus;
  if (value === undefined) return;
  const allowed: PlanningPublicationStatus[] = ['draft', 'published', 'modified', 'cancelled'];
  if (typeof value !== 'string' || !allowed.includes(value as PlanningPublicationStatus)) {
    throw new PlanningPayloadValidationError(entity, 'planningStatus inconnu');
  }
}

function validateNullableObject(record: PayloadRecord, key: string, entity: string): void {
  const value = record[key];
  if (value === undefined || value === null) return;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new PlanningPayloadValidationError(entity, `${key} doit être un objet ou null`);
  }
}

export function parseMatchPayload(
  raw: unknown,
  entity: 'MatchOfficial' | 'MatchAmical',
  fallback: { id: string; type: Extract<MatchType, 'officiel' | 'amical'> },
): Match {
  const record = domainRecord(raw, entity);
  requireString(record, 'date', entity);
  // Un match amical peut être créé sans horaire précis (le formulaire ne l'exige
  // pas) : `time` y est donc facultatif, alors qu'un match officiel issu du
  // scraper porte toujours une heure.
  const time = entity === 'MatchAmical'
    ? optionalString(record, 'time', entity)
    : requireString(record, 'time', entity);
  requireString(record, 'competition', entity);
  requireString(record, 'localTeam', entity);
  requireString(record, 'awayTeam', entity);
  const horaireRendezVous = optionalString(record, 'horaireRendezVous', entity);

  if (record.venue !== 'domicile' && record.venue !== 'extérieur') {
    throw new PlanningPayloadValidationError(entity, 'venue doit valoir domicile ou extérieur');
  }
  if (record.id !== undefined && record.id !== fallback.id) {
    throw new PlanningPayloadValidationError(entity, 'id incohérent avec la clé de la ligne');
  }
  if (record.type !== undefined && record.type !== fallback.type) {
    throw new PlanningPayloadValidationError(entity, 'type incohérent avec la table');
  }

  validateOptionalNonNegativeInteger(record, 'planningRevision', entity);
  validatePlanningStatus(record, entity);
  validateNullableObject(record, 'details', entity);
  validateNullableObject(record, 'staff', entity);

  return {
    ...record,
    id: fallback.id,
    type: fallback.type,
    time,
    horaireRendezVous,
  } as unknown as Match;
}

export function parseEntrainementPayload(raw: unknown, id: string): Entrainement {
  const entity = 'Entrainement';
  const record = domainRecord(raw, entity);
  requireString(record, 'date', entity);
  requireString(record, 'time', entity);
  const lieu = optionalString(record, 'lieu', entity);
  if (record.id !== undefined && record.id !== id) {
    throw new PlanningPayloadValidationError(entity, 'id incohérent avec la clé de la ligne');
  }
  if (record.type !== undefined && record.type !== 'entrainement') {
    throw new PlanningPayloadValidationError(entity, 'type incohérent avec la table');
  }
  validateOptionalNonNegativeInteger(record, 'planningRevision', entity);
  validatePlanningStatus(record, entity);
  validateOptionalArray(record, 'encadrants', entity);
  return { ...record, id, type: 'entrainement', lieu } as unknown as Entrainement;
}

export function parsePlateauPayload(raw: unknown, id: string): Plateau {
  const entity = 'Plateau';
  const record = domainRecord(raw, entity);
  requireString(record, 'date', entity);
  requireString(record, 'time', entity);
  const lieu = optionalString(record, 'lieu', entity);
  if (record.id !== undefined && record.id !== id) {
    throw new PlanningPayloadValidationError(entity, 'id incohérent avec la clé de la ligne');
  }
  if (record.type !== undefined && record.type !== 'plateau') {
    throw new PlanningPayloadValidationError(entity, 'type incohérent avec la table');
  }
  validateOptionalNonNegativeInteger(record, 'planningRevision', entity);
  validatePlanningStatus(record, entity);
  validateOptionalArray(record, 'encadrants', entity);
  validateOptionalArray(record, 'categories', entity);
  return { ...record, id, type: 'plateau', lieu } as unknown as Plateau;
}

export function parseMatchExtrasPayload(raw: unknown, matchId: string): MatchExtras {
  const entity = 'MatchExtra';
  const record = domainRecord(raw, entity);
  if (record.id !== undefined && record.id !== matchId) {
    throw new PlanningPayloadValidationError(entity, 'id incohérent avec matchId');
  }
  validateOptionalNonNegativeInteger(record, 'planningRevision', entity);
  validatePlanningStatus(record, entity);
  validateOptionalArray(record, 'arbitreTouche', entity);
  validateOptionalArray(record, 'contactEncadrants', entity);
  validateOptionalArray(record, 'contactAccompagnateur', entity);
  validateNullableObject(record, 'officialSourceSnapshot', entity);
  validateNullableObject(record, 'officialAdminOverride', entity);
  return { ...record, id: matchId } as unknown as MatchExtras;
}

function serializeDomainPayload(value: object): PayloadRecord {
  return {
    ...(value as unknown as PayloadRecord),
    schemaVersion: PLANNING_PAYLOAD_SCHEMA_VERSION,
  };
}

export function serializeMatchPayload(value: Match): PayloadRecord {
  return serializeDomainPayload(value);
}

export function serializeEntrainementPayload(value: Entrainement): PayloadRecord {
  return serializeDomainPayload(value);
}

export function serializePlateauPayload(value: Plateau): PayloadRecord {
  return serializeDomainPayload(value);
}

export function serializeMatchExtrasPayload(value: MatchExtras): PayloadRecord {
  return serializeDomainPayload(value);
}
