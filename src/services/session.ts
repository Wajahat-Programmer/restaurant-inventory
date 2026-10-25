import { can, Permission, Role } from '../domain/auth';
import { ValidationError } from './errors';

export interface SessionUser {
  id: number;
  name: string;
  role: Role;
}

/** Who is using the app right now. Kept in memory only, so closing the app locks it again. */
let current: SessionUser | null = null;

export const getSession = (): SessionUser | null => current;
export const setSession = (user: SessionUser | null): void => {
  current = user;
};

const DENIED: Record<Permission, string> = {
  record: 'You are not allowed to record stock.',
  void: 'Only the owner can cancel entries.',
  adjust: 'Only the owner can adjust stock by hand.',
  finance: 'Only the owner can see or change money records.',
  recipes: 'Only the owner can change dishes and prices.',
  manage: 'Only the owner can change settings, users and backups.',
};

/** With nobody signed in the app is not locked, so everything is allowed. */
export function allowed(permission: Permission): boolean {
  return current === null || can(current.role, permission);
}

/** Called at the top of every service that only some roles may use. */
export function requirePermission(permission: Permission): void {
  if (!allowed(permission)) {
    throw new ValidationError(DENIED[permission]);
  }
}
