import { EntitySchema } from 'typeorm';
import type { UserRole } from '@/types/auth';

export interface AuthUserEntity {
  id: number;
  email: string;
  passwordHash: string;
  role: UserRole;
  personId: number | null;
  personName: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const AuthUserSchema = new EntitySchema<AuthUserEntity>({
  name: 'AuthUser',
  tableName: 'auth_users',
  indices: [
    {
      name: 'uq_auth_users_role_person',
      columns: ['role', 'personId'],
      unique: true,
    },
  ],
  columns: {
    id: { type: Number, primary: true, generated: 'increment' },
    email: { type: String, length: 255, unique: true },
    passwordHash: { type: String, length: 255 },
    role: { type: String, length: 32 },
    personId: { type: Number, nullable: true },
    personName: { type: String, length: 255, nullable: true },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
});
