/**
 * Petite couche de validation de payload partagée (issue #282) : les routes d'écriture
 * historiques (entraînements, matchs amicaux, plateaux) accédaient directement aux champs
 * d'un corps JSON non vérifié (`input.date.replace(...)`), ce qui renvoyait un 500
 * générique — ou pire, un plantage non journalisé côté client — pour n'importe quel champ
 * manquant ou mal typé. `BodyValidator` collecte toutes les erreurs de forme avant
 * d'écrire quoi que ce soit, pour un unique 400 explicite avec un détail par champ.
 *
 * Volontairement pas de bibliothèque de schéma tierce : la forme des payloads reste assez
 * simple (quelques chaînes, une date jj/mm/aaaa, une heure hh:mm, un tableau de contacts)
 * pour qu'une poignée de validateurs composables suffise, sans dépendance supplémentaire à
 * faire vivre dans le lockfile.
 */

export interface ValidationIssue {
  field: string;
  message: string;
}

export class RequestValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(issues.map((issue) => `${issue.field} : ${issue.message}`).join(' ; ') || 'Requête invalide');
    this.name = 'RequestValidationError';
    this.issues = issues;
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Corps JSON attendu comme objet — un tableau, une chaîne ou `null` à la racine n'est
 * jamais un payload valide pour ces routes. */
export function parseJsonBody(body: unknown): Record<string, unknown> {
  if (!isPlainObject(body)) {
    throw new RequestValidationError([{ field: 'body', message: 'doit être un objet JSON' }]);
  }
  return body;
}

const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Date au format jj/mm/aaaa (convention du dépôt) désignant un jour calendaire réel —
 * `31/02/2026` est structurellement bien formée mais rejetée ici. */
export function isValidEventDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isValidEventTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

interface RequiredOpt {
  required?: boolean;
}

/**
 * Collecte les erreurs de forme d'un corps de requête déjà connu comme un objet JSON
 * (`parseJsonBody`). Chaque méthode renvoie la valeur validée (ou `undefined`) sans
 * jamais lancer immédiatement — seul `throwIfInvalid()` lève, une fois tous les champs
 * examinés, pour que l'appelant reçoive la liste complète des erreurs en un seul 400
 * plutôt qu'un aller-retour par champ fautif.
 */
export class BodyValidator {
  readonly issues: ValidationIssue[] = [];

  constructor(private readonly body: Record<string, unknown>) {}

  private fail(field: string, message: string): void {
    this.issues.push({ field, message });
  }

  private isAbsent(value: unknown): boolean {
    return value === undefined || value === null || value === '';
  }

  string(field: string, opts: RequiredOpt & { maxLength?: number } = {}): string | undefined {
    const { required = true, maxLength } = opts;
    const value = this.body[field];
    if (this.isAbsent(value)) {
      if (required) this.fail(field, 'requis');
      return undefined;
    }
    if (typeof value !== 'string') {
      this.fail(field, 'doit être une chaîne de caractères');
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      if (required) this.fail(field, 'requis');
      return undefined;
    }
    if (maxLength !== undefined && trimmed.length > maxLength) {
      this.fail(field, `ne doit pas dépasser ${maxLength} caractères`);
      return undefined;
    }
    return trimmed;
  }

  date(field: string, opts: RequiredOpt = {}): string | undefined {
    const { required = true } = opts;
    const value = this.body[field];
    if (this.isAbsent(value)) {
      if (required) this.fail(field, 'requis (format jj/mm/aaaa)');
      return undefined;
    }
    if (!isValidEventDate(value)) {
      this.fail(field, 'doit être une date valide au format jj/mm/aaaa');
      return undefined;
    }
    return value;
  }

  time(field: string, opts: RequiredOpt = {}): string | undefined {
    const { required = true } = opts;
    const value = this.body[field];
    if (this.isAbsent(value)) {
      if (required) this.fail(field, 'requis (format hh:mm)');
      return undefined;
    }
    if (!isValidEventTime(value)) {
      this.fail(field, 'doit être une heure valide au format hh:mm');
      return undefined;
    }
    return value;
  }

  enum<T extends string>(field: string, allowed: readonly T[], opts: RequiredOpt = {}): T | undefined {
    const { required = true } = opts;
    const value = this.body[field];
    if (this.isAbsent(value)) {
      if (required) this.fail(field, 'requis');
      return undefined;
    }
    if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
      this.fail(field, `doit être l'une des valeurs suivantes : ${allowed.join(', ')}`);
      return undefined;
    }
    return value as T;
  }

  number(field: string, opts: RequiredOpt & { min?: number; max?: number } = {}): number | undefined {
    const { required = false, min, max } = opts;
    const value = this.body[field];
    if (value === undefined || value === null) {
      if (required) this.fail(field, 'requis');
      return undefined;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.fail(field, 'doit être un nombre');
      return undefined;
    }
    if (min !== undefined && value < min) {
      this.fail(field, `doit être supérieur ou égal à ${min}`);
      return undefined;
    }
    if (max !== undefined && value > max) {
      this.fail(field, `doit être inférieur ou égal à ${max}`);
      return undefined;
    }
    return value;
  }

  boolean(field: string, opts: RequiredOpt = {}): boolean | undefined {
    const { required = false } = opts;
    const value = this.body[field];
    if (value === undefined || value === null) {
      if (required) this.fail(field, 'requis');
      return undefined;
    }
    if (typeof value !== 'boolean') {
      this.fail(field, 'doit être un booléen');
      return undefined;
    }
    return value;
  }

  /** Tableau de chaînes de caractères (ex. `categories` d'un plateau). */
  stringArray(field: string, opts: RequiredOpt & { maxItemLength?: number } = {}): unknown[] | undefined {
    const { required = false, maxItemLength } = opts;
    const value = this.body[field];
    if (value === undefined || value === null) {
      if (required) this.fail(field, 'requis');
      return undefined;
    }
    if (!Array.isArray(value)) {
      this.fail(field, 'doit être une liste');
      return undefined;
    }
    value.forEach((item, index) => {
      if (typeof item !== 'string' || !item.trim()) {
        this.fail(`${field}[${index}]`, 'doit être une chaîne de caractères non vide');
      } else if (maxItemLength !== undefined && item.trim().length > maxItemLength) {
        this.fail(`${field}[${index}]`, `ne doit pas dépasser ${maxItemLength} caractères`);
      }
    });
    return value;
  }

  /**
   * Tableau de contacts d'affectation (`AssignmentContact[]`, issue #282) : valide juste
   * assez de structure — un tableau d'objets portant chacun un `nom` non vide — pour que
   * `enrichAssignmentContacts`, qui suppose déjà cette forme, ne plante jamais sur un champ
   * manquant. Les contraintes métier plus fines (existence de `personId`, cohérence du
   * rôle…) restent vérifiées plus loin, où le contexte club est disponible.
   */
  assignmentContacts(field: string, opts: RequiredOpt = {}): unknown[] | undefined {
    const { required = false } = opts;
    const value = this.body[field];
    if (value === undefined || value === null) {
      if (required) this.fail(field, 'requis');
      return undefined;
    }
    if (!Array.isArray(value)) {
      this.fail(field, 'doit être une liste');
      return undefined;
    }
    value.forEach((item, index) => {
      if (!isPlainObject(item) || typeof item.nom !== 'string' || !item.nom.trim()) {
        this.fail(`${field}[${index}].nom`, 'requis');
      }
    });
    return value;
  }

  throwIfInvalid(): void {
    if (this.issues.length) throw new RequestValidationError(this.issues);
  }
}
