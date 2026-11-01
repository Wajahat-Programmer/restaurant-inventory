import { readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Metro tries .json before .ts, so `import './manual'` silently loads manual.json
 * when both exist, and the app crashes on the phone while Jest (which tries .ts
 * first) passes. This test keeps that from happening again.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe('module names', () => {
  it('no .json file shares its name with a .ts or .tsx file next to it', () => {
    const all = [...files(join(__dirname)), ...files(join(__dirname, '..', 'app'))];
    const clashes = all
      .filter(f => f.endsWith('.json'))
      .filter(f => all.includes(f.replace(/\.json$/, '.ts')) || all.includes(f.replace(/\.json$/, '.tsx')) || all.includes(f.replace(/\.json$/, '.js')));
    expect(clashes).toEqual([]);
  });
});
