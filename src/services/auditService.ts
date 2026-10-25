import { desc } from 'drizzle-orm';
import { Queryable, schema } from '../db/client';
import { getSession } from './session';

/**
 * Records who did something. Pass the transaction of the action itself so the
 * entry exists exactly when the action does. Never put secrets in `detail`.
 */
export async function audit(
  q: Queryable,
  action: string,
  entity: string,
  entityId?: number | null,
  detail?: Record<string, unknown>,
): Promise<void> {
  const who = getSession();
  await q.insert(schema.auditLog).values({
    userId: who?.id ?? null,
    actor: who?.name ?? 'system',
    action,
    entity,
    entityId: entityId ?? null,
    detail: detail ? JSON.stringify(detail) : null,
  });
}

export async function listAudit(q: Queryable, limit = 100) {
  return q.select().from(schema.auditLog).orderBy(desc(schema.auditLog.id)).limit(limit);
}
