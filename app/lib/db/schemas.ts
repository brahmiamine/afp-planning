import { EntitySchema } from 'typeorm';
import { OfficielIndisponibilite } from '@/lib/utils/officiel-availability';

export interface OfficielEntity {
  id: number;
  nom: string;
  telephone: string | null;
  indisponibilites: OfficielIndisponibilite[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EncadrantEntity {
  id: number;
  nom: string;
  telephone: string | null;
  indisponibilites: OfficielIndisponibilite[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccompagnateurEntity {
  id: number;
  nom: string;
  telephone: string | null;
  indisponibilites: OfficielIndisponibilite[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClubEntity {
  id: number;
  nom: string;
  logo: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategorieEntity {
  id: number;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StadeEntity {
  id: number;
  nom: string;
  adresse: string | null;
  googleMapsUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchOfficialEntity {
  id: string;
  date: string;
  time: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchAmicalEntity {
  id: string;
  date: string;
  time: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface EntrainementEntity {
  id: string;
  date: string;
  time: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlateauEntity {
  id: string;
  date: string;
  time: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchExtraEntity {
  matchId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppMetaEntity {
  key: string;
  value: string;
  updatedAt: Date;
}

export const OfficielSchema = new EntitySchema<OfficielEntity>({
  name: 'Officiel',
  tableName: 'officiels',
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    nom: { type: String, unique: true },
    telephone: { type: String, nullable: true },
    indisponibilites: { type: 'simple-json', nullable: true },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const EncadrantSchema = new EntitySchema<EncadrantEntity>({
  name: 'Encadrant',
  tableName: 'encadrants',
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    nom: { type: String, unique: true },
    telephone: { type: String, nullable: true },
    indisponibilites: { type: 'simple-json', nullable: true },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const AccompagnateurSchema = new EntitySchema<AccompagnateurEntity>({
  name: 'Accompagnateur',
  tableName: 'accompagnateurs',
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    nom: { type: String, unique: true },
    telephone: { type: String, nullable: true },
    indisponibilites: { type: 'simple-json', nullable: true },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const ClubSchema = new EntitySchema<ClubEntity>({
  name: 'Club',
  tableName: 'clubs',
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    nom: { type: String, unique: true },
    logo: { type: String },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const CategorieSchema = new EntitySchema<CategorieEntity>({
  name: 'Categorie',
  tableName: 'categories',
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    value: { type: String, unique: true },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const StadeSchema = new EntitySchema<StadeEntity>({
  name: 'Stade',
  tableName: 'stades',
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    nom: { type: String, unique: true },
    adresse: { type: String, nullable: true },
    googleMapsUrl: { type: String },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const MatchOfficialSchema = new EntitySchema<MatchOfficialEntity>({
  name: 'MatchOfficial',
  tableName: 'matches_officiels',
  indices: [
    {
      name: 'idx_matches_officiels_date',
      columns: ['date'],
    },
  ],
  columns: {
    id: { type: String, primary: true },
    date: { type: String },
    time: { type: String, default: '' },
    payload: { type: 'simple-json' },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const MatchAmicalSchema = new EntitySchema<MatchAmicalEntity>({
  name: 'MatchAmical',
  tableName: 'matches_amicaux',
  indices: [
    {
      name: 'idx_matches_amicaux_date',
      columns: ['date'],
    },
  ],
  columns: {
    id: { type: String, primary: true },
    date: { type: String },
    time: { type: String, default: '' },
    payload: { type: 'simple-json' },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const EntrainementSchema = new EntitySchema<EntrainementEntity>({
  name: 'Entrainement',
  tableName: 'entrainements',
  indices: [
    {
      name: 'idx_entrainements_date',
      columns: ['date'],
    },
  ],
  columns: {
    id: { type: String, primary: true },
    date: { type: String },
    time: { type: String, default: '' },
    payload: { type: 'simple-json' },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const PlateauSchema = new EntitySchema<PlateauEntity>({
  name: 'Plateau',
  tableName: 'plateaux',
  indices: [
    {
      name: 'idx_plateaux_date',
      columns: ['date'],
    },
  ],
  columns: {
    id: { type: String, primary: true },
    date: { type: String },
    time: { type: String, default: '' },
    payload: { type: 'simple-json' },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const MatchExtraSchema = new EntitySchema<MatchExtraEntity>({
  name: 'MatchExtra',
  tableName: 'matches_extras',
  columns: {
    matchId: { type: String, primary: true },
    payload: { type: 'simple-json' },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const AppMetaSchema = new EntitySchema<AppMetaEntity>({
  name: 'AppMeta',
  tableName: 'app_meta',
  columns: {
    key: { type: String, primary: true },
    value: { type: 'text' },
    updatedAt: { type: Date, updateDate: true },
  },
});

export const allSchemas = [
  OfficielSchema,
  EncadrantSchema,
  AccompagnateurSchema,
  ClubSchema,
  CategorieSchema,
  StadeSchema,
  MatchOfficialSchema,
  MatchAmicalSchema,
  EntrainementSchema,
  PlateauSchema,
  MatchExtraSchema,
  AppMetaSchema,
];
