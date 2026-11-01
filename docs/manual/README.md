# User manual

`docs/Restaurant-Inventory-User-Manual.pdf` is the illustrated manual for the people who use the app.

## Rebuild it

```
python scripts/prepare-manual-images.py     # shots/*.png -> web/*.jpg (with crops.json)
node scripts/build-user-manual.js           # content.js + web/*.jpg -> the PDF (needs Edge or Chrome)
```

The words, numbered callouts and pin positions are in `content.js`. Pin positions are percentages of each picture.

## Retake the screenshots

1. Create the demo restaurant: copy `seed-demo.ts.txt` to `__tests__/zz-seed-demo.test.ts`, run `npx jest __tests__/zz-seed-demo`, then delete it again. It writes `D:/tmp/demo/restaurant.db` (and a copy with the PIN lock on).
2. Debug build on the emulator with Metro running. Set the emulator clock to Saturday 24 Oct 2026 so the dates in the pictures match (`adb root`, `settings put global auto_time 0`, `date 102414302026.00`).
3. Load the database: `adb push` it, then copy it over `/data/data/com.restaurantinventory/databases/restaurant.db` (`chown` to the app user).
4. `maestro test docs/manual/shoot-a.yaml --test-output-dir <dir>` for each of `shoot-a` to `shoot-e`, and copy the `takeScreenshot/*.png` files into `docs/manual/shots/`. Part D needs a fake update feed (see `e2e/13-app-update.yaml`); part E needs the locked database.
