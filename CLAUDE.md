# Restaurant Inventory App

Offline-only Android app for a small food business: stock, costs, in/out, forecasts. Spec: `Restaurant Inventory App — Development Plan.md` (Downloads). Feature specs live in `specs/`.

## Stack
React Native CLI 0.88 (bare, TypeScript strict, New Architecture, Hermes), Android only. Planned (not installed yet): op-sqlite + Drizzle, React Navigation, React Native Paper, Zustand, React Hook Form + Zod, FlashList, Notifee. Testing: Jest, React Native Testing Library, Maestro.

**No new dependency without asking.**

## Layout
```
app/                    screens + navigation
src/domain/             pure TS: ledger, costing, finance, forecast (NO react / react-native imports; ESLint enforces)
src/db/                 Drizzle schema, migrations, repositories (not yet created)
src/features/<module>/  components, hooks, forms per module
src/theme/tokens.ts     the only place colours live (ESLint blocks raw hex elsewhere)
specs/                  one spec per feature
e2e/                    Maestro flows
```

## Data rules
- Money = integer paisa, never floats. Quantities = base units (g, ml, pcs).
- `stock_movements` is an append-only ledger. Never update or delete a row; correct with a reversing entry (`reverse()`).
- Cost = weighted average, recomputed on each IN.
- Every write goes through a domain service inside one transaction. Screens never touch SQL.
- Photos are files, not blobs.

## UI rules
- Colours only from `src/theme/tokens.ts`; contrast >= 4.5:1 in both themes.
- Status is never colour alone: icon/glyph + label (Low, Out, Expiring).
- 8 dp grid, touch targets >= 48 dp (`MIN_TOUCH_TARGET`), tabular figures for money and quantities.
- Every interactive/asserted element gets a `testID` (used by Jest and Maestro).

## Commands
```
npm run typecheck      # tsc --noEmit
npm run lint           # eslint, zero warnings allowed
npm test               # jest
npm run test:coverage  # jest + >= 90% gate on src/domain
npm run qa             # typecheck + lint + coverage (same as CI "static + unit")
npm run e2e            # maestro flows against a running emulator (debug build installed)
npm run android        # build + install + run (see Windows notes)
```

## Windows / environment notes
- `C:` is nearly full. Set `GRADLE_USER_HOME=D:\gradle-home` and `TEMP/TMP=D:\tmp`; AVDs live in `D:\Android\avd` (`ANDROID_AVD_HOME`), emulator `RI_Pixel_API34`.
- Maestro 2.11.0 is at `D:\tools\maestro\bin` (add to PATH). Needs the debug build installed, Metro running, `adb reverse tcp:8081 tcp:8081`; create `qa-report/` first for `--output`.
- `react-native run-android` fails to find `gradlew.bat` here. Build with `cd android; .\gradlew.bat app:installDebug -PreactNativeArchitectures=x86_64`, then `adb reverse tcp:8081 tcp:8081` and `npx react-native start`.

## Workflow
Spec first (`specs/<feature>.md`), domain functions and Jest tests before screens, `npm run qa` green before commit.
