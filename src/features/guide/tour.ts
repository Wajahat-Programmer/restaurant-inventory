import { Permission } from '../../domain/auth';

export type TabName = 'Home' | 'Stock' | 'Purchases' | 'Sales' | 'More';
export type StackName = 'Data' | 'Security' | 'Settings' | 'Help';

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** Show this tab first. */
  tab?: TabName;
  /** Or open this screen first. */
  screen?: StackName;
  /** Which element to highlight; none means a centred card. */
  target?: string;
  /** Hidden from people who lack this permission (staff do not see the owner steps). */
  needs?: Permission;
}

/** The id of the pseudo-target that outlines the tab bar. */
export const BOTTOM_BAR = 'bottom-bar';

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    tab: 'Home',
    title: 'Welcome',
    body: 'This takes about two minutes. It shows where the main things are. You can leave at any time, and start it again from More, then Help and manual.',
  },
  {
    id: 'home-actions',
    tab: 'Home',
    target: 'home-actions',
    title: 'Your two daily jobs',
    body: 'Enter sales records what you sold today and takes the ingredients out of stock. Add expense records rent, gas, salaries and so on.',
  },
  {
    id: 'home-alerts',
    tab: 'Home',
    target: 'home-alerts',
    title: 'What needs attention',
    body: 'Low stock, items about to expire and anything unusual appears here, written in words with a symbol so it is easy to read.',
  },
  {
    id: 'tabs',
    tab: 'Home',
    target: BOTTOM_BAR,
    title: 'Five tabs',
    body: 'Home, Stock, Purchases, Sales and More. Everything else is under More.',
  },
  {
    id: 'stock',
    tab: 'Stock',
    target: 'fab-add-item',
    title: 'Your items',
    body: 'Tap + to add an item. Tap any item to see its history, take stock out (Issue), or record waste.',
  },
  {
    id: 'purchases',
    tab: 'Purchases',
    target: 'fab-add-purchase',
    title: 'Stock coming in',
    body: 'Tap + for each delivery: supplier, items, quantity and cost. Leave Paid now blank if you paid in full, or enter 0 for credit.',
  },
  {
    id: 'sales',
    tab: 'Sales',
    target: 'fab-add-sales',
    title: 'Daily sales',
    body: 'Tap + and enter how many portions of each dish you sold. Ingredients come out of stock for you.',
  },
  {
    id: 'more',
    tab: 'More',
    target: 'more-list',
    title: 'Everything else',
    body: 'Forecast and alerts, Reports, Dishes and recipes, Expenses, Cash book, Suppliers, Stock count and Settings are all here.',
  },
  {
    id: 'backup',
    screen: 'Data',
    needs: 'manage',
    title: 'Back up your data',
    body: 'Choose a backup passphrase, write it down, and tap Back up now. The app then backs up by itself every day. Without a backup, a lost phone means lost data.',
  },
  {
    id: 'security',
    screen: 'Security',
    needs: 'manage',
    title: 'PIN lock and staff',
    body: 'Turn on the lock to protect money screens. Staff you add can record stock and sales, but cannot void, adjust or see profit.',
  },
  {
    id: 'updates',
    screen: 'Settings',
    needs: 'manage',
    title: 'Settings and updates',
    body: 'Change the theme and your ordering days here, and tap Check for updates to get new versions of the app.',
  },
  {
    id: 'help',
    screen: 'Help',
    title: 'The manual is always here',
    body: 'Help and manual has a chapter for every part of the app, and can be shared as a PDF. You can also start this tour again from there.',
  },
];

/** The steps this person can use. */
export function stepsFor(can: (p: Permission) => boolean): TourStep[] {
  return TOUR_STEPS.filter(s => !s.needs || can(s.needs));
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

/**
 * The four dark rectangles around a highlighted area, so everything except
 * the target is dimmed and blocks touches. With no target the whole screen is dimmed.
 */
export function dimRects(target: Rect | null, win: Size, pad = 6): Rect[] {
  if (!target) {
    return [{ x: 0, y: 0, w: win.w, h: win.h }];
  }
  const left = Math.max(0, target.x - pad);
  const top = Math.max(0, target.y - pad);
  const right = Math.min(win.w, target.x + target.w + pad);
  const bottom = Math.min(win.h, target.y + target.h + pad);
  return [
    { x: 0, y: 0, w: win.w, h: top },
    { x: 0, y: bottom, w: win.w, h: Math.max(0, win.h - bottom) },
    { x: 0, y: top, w: left, h: Math.max(0, bottom - top) },
    { x: right, y: top, w: Math.max(0, win.w - right), h: Math.max(0, bottom - top) },
  ];
}

export type Placement = { anchor: 'center' } | { anchor: 'top'; offset: number } | { anchor: 'bottom'; offset: number };

/** Put the explanation on the side of the screen with more room. */
export function placement(target: Rect | null, win: Size, pad = 6, gap = 12): Placement {
  if (!target) {
    return { anchor: 'center' };
  }
  const middle = target.y + target.h / 2;
  if (middle < win.h / 2) {
    return { anchor: 'top', offset: Math.min(win.h, target.y + target.h + pad + gap) };
  }
  return { anchor: 'bottom', offset: Math.max(0, win.h - (target.y - pad) + gap) };
}
