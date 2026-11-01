# Restaurant Inventory App

Offline-only Android app for a small food business: stock, costs, in/out, forecasts. Spec: `Restaurant Inventory App — Development Plan.md` (Downloads). Feature specs live in `specs/`.

## Stack
React Native CLI 0.88 (bare, TypeScript strict, New Architecture, Hermes), Android only. Installed: op-sqlite + Drizzle (sqlite-proxy driver), React Navigation, React Native Paper, Zustand, React Hook Form + Zod, FlashList. Photos: react-native-vision-camera 4 (v5 needs two extra Nitro packages), image-resizer, @dr.pogodin/react-native-fs, plus our Kotlin ML Kit module. Also installed: Keychain, biometrics, zip-archive, share, documents-picker, html-to-pdf, Notifee, background-fetch, Google Sign-In (Drive). Victory is not used. Testing: Jest, React Native Testing Library, Maestro.

**No new dependency without asking.**

## Layout
```
app/navigation/         stacks + tabs; app/screens/ one file per screen
src/domain/             pure TS: ledger, units, purchasing, stock status, photos, schemas (NO react / react-native imports; ESLint enforces)
src/db/                 schema.ts, migrations/ (drizzle-kit), client.ts (proxy driver, migrate, inTransaction), opsqlite.ts (the only native import), testing.ts (better-sqlite3)
src/services/           every write: one transaction each, all stock changes via ledgerService.postMovement
src/features/           hooks (useQuery/useWrite), shared ui, form schemas per module
src/native/             TurboModule specs (codegen); Kotlin in android/app/src/main/java/com/restaurantinventory/{cutout,update,kdf,tilt}/
src/features/backup/    encrypted .rimbak backup/restore (staged, reversible), daily run, retention
src/features/drive/     Google Drive upload/list/download (config.ts holds the OAuth web client id; empty = off)
src/features/update/    GitHub Releases update check, download, checksum, install; dev-feed.txt test hook (debug only)
src/features/guide/     guided tour (TourProvider/TourTarget, no library) and the manual (manualText.json is the in-app manual's text)
src/features/scan/      barcode scan store; app/screens/ScanScreen.tsx (find an item, or fill the item form's barcode)
src/features/reports/   PDF pages for reports (pdfHtml) and sharing (pdfDevice)
scripts/                release.js (signed APK + checksum + publish), build-manual.js (manual PDF), build-migrations.js
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
- PBKDF2 (PINs, backup keys) runs in Kotlin (`NativeKdf`) via `setKdf`; pure JS took ~60 s per backup on a phone and froze the app. Crypto functions are async for that reason. The JS version is the fallback and the test reference.
- Reads wait for queued writes (`writesIdle`) and VACUUM runs through `exclusive`: one connection, so a read mid-transaction sees half a write. Never `await` a read inside `exclusive`/`inTransaction`.
- 2.5D photos (`Photo25D`): the shadow is the same cut-out tinted black and blurred; the tilt comes from our own accelerometer module (`NativeTilt`, device event "tilt"). Off with the Settings switch or reduce motion.
- Barcode scanning needs `VisionCamera_enableCodeScanner=true` in android/gradle.properties (a native rebuild). Barcodes are stored normalised (`normalizeBarcode`); UPC-A and EAN-13 spellings match each other.
- Ordering and insight maths is pure and tested in `src/domain`: `priceTrend` (price-rise alert: last price vs median of the 5 before, 10%, fresh for 14 days), `ordering` (shopping list per supplier: the usual supplier is the most recent one; a cheaper one is named at 10% or more), `menu` (star/plowhorse/puzzle/dog by 70% popularity and average profit per portion; price for a target margin), `waste` (by reason and item). Services: `forecastService` (priceAlerts, supplierPrices), `reportService` (dishPerformance, finance-gated). Screens: DishPerformance and Wastage, opened from Reports.
- Purchase status (Paid / Part paid / On credit) is worked out now, with supplier payments settling the oldest debt first (`settle`), so it agrees with the supplier screen.
- A safety backup made before a restore must not prune the file being restored (`keep`), or retention deletes the chosen backup. Regression-tested.
- Maestro on Windows mangles non-ASCII glyphs (match with `.*`), only sees on-screen text (notes above the scroll position are invisible), and needs waits after PIN/backup actions.
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
npm run release        # QA gate, signed release APK, sha256, key check (add --publish to tag, push and create the GitHub release)
node scripts/build-user-manual.js   # the illustrated user manual PDF (see docs/manual/README.md)
npm run android        # build + install + run (see Windows notes)
```

## Windows / environment notes
- `C:` is nearly full. Set `GRADLE_USER_HOME=D:\gradle-home` and `TEMP/TMP=D:\tmp`; AVDs live in `D:\Android\avd` (`ANDROID_AVD_HOME`), emulator `RI_Pixel_API34`.
- Maestro 2.11.0 is at `D:\tools\maestro\bin` (add to PATH). Needs the debug build installed, Metro running, `adb reverse tcp:8081 tcp:8081`; create `qa-report/` first for `--output`.
- `react-native run-android` fails to find `gradlew.bat` here. Build with `cd android; .\gradlew.bat app:installDebug -PreactNativeArchitectures=x86_64`, then `adb reverse tcp:8081 tcp:8081` and `npx react-native start`.

## Releasing
1. Everything committed, `npm run qa` green. Bump the version: `node scripts/release.js 1.0.1` (package.json is the only version; versionCode = major*10000+minor*100+patch).
2. The release key is NOT in the repo: `RI_KEYSTORE_*` in `GRADLE_USER_HOME\gradle.properties`, keystore at `D:\Android\keys\`. Never print or commit it; losing it means installed phones cannot update.
3. `node scripts/release.js --publish` builds arm64+armv7, verifies it is not debug-signed, writes `release/restaurant-inventory-vX.Y.Z.apk` + `.sha256`, builds the manual PDF, tags, pushes and runs `gh release create`. The app finds updates from the latest GitHub release and refuses any APK without a matching sha256.
4. Test an update locally: serve latest.json + an APK on :8099, `adb reverse tcp:8099 tcp:8099`, write `dev-feed.txt` (see `e2e/13-app-update.yaml`).

## Workflow
Spec first (`specs/<feature>.md`), domain functions and Jest tests before screens, `npm run qa` green before commit.
