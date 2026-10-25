# Restaurant Inventory App

Offline-only Android app for a small food business: stock, costs, in/out, forecasts. Spec: `Restaurant Inventory App — Development Plan.md` (Downloads). Feature specs live in `specs/`.

## Stack
React Native CLI 0.88 (bare, TypeScript strict, New Architecture, Hermes), Android only. Installed: op-sqlite + Drizzle (sqlite-proxy driver), React Navigation, React Native Paper, Zustand, React Hook Form + Zod, FlashList. Photos: react-native-vision-camera 4 (v5 needs two extra Nitro packages), image-resizer, @dr.pogodin/react-native-fs, plus our Kotlin ML Kit module. Not yet installed: Notifee, Victory. Testing: Jest, React Native Testing Library, Maestro.

**No new dependency without asking.**

## Layout
```
app/navigation/         stacks + tabs; app/screens/ one file per screen
src/domain/             pure TS: ledger, units, purchasing, stock status, photos, schemas (NO react / react-native imports; ESLint enforces)
src/db/                 schema.ts, migrations/ (drizzle-kit), client.ts (proxy driver, migrate, inTransaction), opsqlite.ts (the only native import), testing.ts (better-sqlite3)
src/services/           every write: one transaction each, all stock changes via ledgerService.postMovement
src/features/           hooks (useQuery/useWrite), shared ui, form schemas per module
src/native/             TurboModule specs (codegen); Kotlin in android/app/src/main/java/com/restaurantinventory/cutout/
src/features/photos/    pipeline (pure, injected ports), device ports, camera helpers
src/theme/tokens.ts     the only place colours live (ESLint blocks raw hex elsewhere)
specs/                  one spec per feature
e2e/                    Maestro flows (top level only); e2e-shared/ helper flows
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

## Gotchas (each cost real time)
- Through the proxy driver `db.all(sql...)` returns raw arrays, not objects. Use typed `db.select()`; `migrate()` was broken by this.
- Drizzle's own op-sqlite driver does not await transaction callbacks. Always write via `inTransaction(db, tx => ...)`.
- Schema change = `npm run db:generate` (new migration + bundled `migrations.generated.ts`); CI fails on drift. Never edit a shipped migration.
- Hermes mis-binds large destructured parameter lists in `@react-navigation/*` (render-time ReferenceError). `babel.config.js` compiles that away for that package only.
- Edge-to-edge Android does not resize for the keyboard: screens use `Body` (KeyboardAvoidingView).
- RNTL 14: `render`, `fireEvent`, `unmount` are async; always `await`.
- Restart Metro with `--reset-cache` after installing packages.
- ML Kit cutout needs its model from Google Play services. On an emulator with no Google account it never downloads ("Waiting for the subject segmentation optional module"); the app then keeps the plain photo and offers Retry cutout. Verify real cutouts on a phone with Play services and internet.
- Camera: keep `isActive` true until `takePhoto` returns, or it fails with "Camera is closed".
- Every Maestro flow and subflow needs an `appId` header. A flow that always clears state cannot catch persistence bugs: keep `06-persistence`.

## Commands
```
npm run typecheck      # tsc --noEmit
npm run lint           # eslint, zero warnings allowed
npm test               # jest
npm run test:coverage  # jest + >= 90% gate on src/domain
npm run qa             # typecheck + lint + coverage (same as CI "static + unit")
npm run db:generate    # after editing schema.ts
npm run e2e            # maestro flows against a running emulator (debug build installed)
npm run android        # build + install + run (see Windows notes)
```

## Windows / environment notes
- `C:` is nearly full. Set `GRADLE_USER_HOME=D:\gradle-home` and `TEMP/TMP=D:\tmp`; AVDs live in `D:\Android\avd` (`ANDROID_AVD_HOME`), emulator `RI_Pixel_API34`.
- Maestro 2.11.0 is at `D:\tools\maestro\bin` (add to PATH). Needs the debug build installed, Metro running, `adb reverse tcp:8081 tcp:8081`; create `qa-report/` first for `--output`.
- `react-native run-android` fails to find `gradlew.bat` here. Build with `cd android; .\gradlew.bat app:installDebug -PreactNativeArchitectures=x86_64`, then `adb reverse tcp:8081 tcp:8081` and `npx react-native start`.

## Workflow
Spec first (`specs/<feature>.md`), domain functions and Jest tests before screens, `npm run qa` green before commit.
