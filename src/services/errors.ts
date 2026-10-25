/** A problem the user can fix; screens show `message` as is. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function must<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) {
    throw new ValidationError(message);
  }
  return value;
}

/** Drizzle wraps driver errors; the SQLite message lives on `cause`. */
function messageChain(e: unknown): string {
  const parts: string[] = [];
  // Duck-typed on purpose: errors thrown by the native SQLite addon may come from
  // another JavaScript realm, where `instanceof Error` is false.
  for (let cur: unknown = e; cur && typeof cur === 'object' && parts.length < 5; cur = (cur as { cause?: unknown }).cause) {
    const m = (cur as { message?: unknown }).message;
    if (typeof m === 'string') {
      parts.push(m);
    }
  }
  return parts.join(' | ');
}

/** Turns SQLite constraint errors into messages the owner can act on. */
export function friendly(e: unknown, what: string): never {
  const msg = messageChain(e);
  if (/UNIQUE constraint failed/i.test(msg)) {
    throw new ValidationError(`${what} already exists`);
  }
  if (/FOREIGN KEY constraint failed/i.test(msg)) {
    throw new ValidationError('A linked item or supplier no longer exists');
  }
  throw e;
}
