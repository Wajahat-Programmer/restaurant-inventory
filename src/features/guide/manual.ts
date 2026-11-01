// Not named manual.json: Metro would pick that file over manual.ts for `import './manual'`.
import manual from './manualText.json';

export type Block =
  | { type: 'p' | 'h' | 'tip' | 'warn'; text: string }
  | { type: 'steps' | 'list'; items: string[] };

export interface Chapter {
  id: string;
  title: string;
  summary: string;
  blocks: Block[];
}

/** The manual's text: one source for the Help screen, the PDF share and the PDF file in the repository. */
export const MANUAL = manual as Chapter[];
