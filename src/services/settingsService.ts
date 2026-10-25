import { eq } from 'drizzle-orm';
import { Queryable, schema } from '../db/client';

/** Every setting the app knows, with its default. Stored as text in the settings table. */
export const SETTING_DEFAULTS = {
  'forecast.leadDays': '2',
  'forecast.reviewDays': '7',
  'theme': 'system',
  'currency': 'PKR',
  'auth.recovery': '',
  'auth.autoLock': '5',
  'auth.biometricUser': '',
  'update.autoCheck': '1',
  'update.lastCheck': '',
  'update.available': '',
  'update.notified': '',
  'backup.lastOkAt': '',
  'backup.passphraseSet': '0',
  'drive.enabled': '0',
  'drive.account': '',
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting(q: Queryable, key: SettingKey): Promise<string> {
  const [row] = await q.select().from(schema.settings).where(eq(schema.settings.key, key));
  return row?.value ?? SETTING_DEFAULTS[key];
}

export async function setSetting(q: Queryable, key: SettingKey, value: string): Promise<void> {
  await q
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

/** A whole-number setting in a safe range; anything else falls back to the default. */
export async function getIntSetting(q: Queryable, key: SettingKey, min: number, max: number): Promise<number> {
  const n = Number(await getSetting(q, key));
  return Number.isInteger(n) && n >= min && n <= max ? n : Number(SETTING_DEFAULTS[key]);
}
