# Spec: ledger and stock movements (M0 slice)

## User stories
- As the owner, I record stock in, so quantity and value rise.
- As staff, I issue stock to the kitchen, so quantity falls but never below zero.
- As the owner, I correct a mistake with a reversing entry, never an edit.

## Domain (`src/domain/ledger.ts`)
- `applyMovement(level, movement) -> StockLevel` (pure, throws `RangeError` on invalid input)
- `replay(movements) -> StockLevel`, `reverse(movement) -> Movement`, `stockValue(level) -> Paisa`

## Rules
1. IN: qty > 0, unit cost integer paisa >= 0; average = round((q*avg + inQty*cost) / (q + inQty)).
2. ISSUE/WASTE/SALE: qty < 0. ADJUST/COUNT: any non-zero sign.
3. Outflows keep the average. Result quantity may never be negative.
4. `reverse()` flips the sign and sets `isReversal`, which skips the sign-by-type check only; the stock-never-negative rule still applies.
5. `replay(history)` must equal incrementally applying the same history (cache is rebuildable).

## Acceptance (all covered in `ledger.test.ts` and `__tests__/App.test.tsx`)
- Weighted average of 1000 g @ 10 and 1000 g @ 20 is 15.
- Issue greater than stock is rejected with "Insufficient stock".
- Reversal of an ISSUE restores quantity; reversal of an IN after the stock was used is rejected.
- Money must be integer paisa; floats throw.

## Known limits (to settle in the Drizzle/DB spec)
- Reversing an IN leaves the weighted average unchanged; a precise recost needs the full history and is deferred.
- Quantities are plain numbers; decide on integer base units vs decimals before purchase pack conversions land.
