import { fireEvent, render, screen } from '@testing-library/react-native';
import App from '../App';
import { Db } from '../src/db/client';

/** Helpers for whole-app tests: real screens and services over in-memory SQLite. */
export const press = (id: string) => fireEvent.press(screen.getByTestId(id));
export const type = (id: string, value: string) => fireEvent.changeText(screen.getByTestId(id), value);
export const text = (id: string) => [screen.getByTestId(id).props.children].flat().join('');

export async function openApp(db: Db, tab: 'home' | 'stock' | 'purchases' | 'sales' = 'stock') {
  await render(<App db={db} />);
  await screen.findByTestId('tab-stock');
  if (tab !== 'home') {
    await press(`tab-${tab}`);
  }
}

export type MoreMenu = 'suppliers' | 'count' | 'recipes' | 'expenses' | 'cashbook' | 'reports' | 'forecast' | 'settings';

/** Open a screen listed under More. */
export async function goMore(menu: MoreMenu) {
  await press('tab-more');
  await press(`menu-${menu}`);
}

/** Local business date, the same way the app computes "today". */
export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
