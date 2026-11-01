/*
 * The words, pictures and callouts of the user manual.
 * `h` is the set of page helpers from scripts/build-user-manual.js.
 * Pin positions are percentages of each screenshot (x across, y down).
 */
module.exports = (h, { version }) => {
  /* ---------- diagrams ---------- */
  const box = (x, y, w, hgt, fill, stroke, title, sub, tc = '#1c1b1a', sc = '#5f5b57') =>
    `<rect x="${x}" y="${y}" width="${w}" height="${hgt}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="2"/>` +
    `<text x="${x + w / 2}" y="${y + (sub ? hgt / 2 - 4 : hgt / 2 + 5)}" text-anchor="middle" font-size="15" font-weight="700" fill="${tc}">${title}</text>` +
    (sub ? `<text x="${x + w / 2}" y="${y + hgt / 2 + 14}" text-anchor="middle" font-size="11.5" fill="${sc}">${sub}</text>` : '');
  const arrow = (x1, y1, x2, y2, col = '#1b5e3b') =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="2.4" marker-end="url(#a${col.slice(1)})"/>`;
  const defs = col => `<marker id="a${col.slice(1)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="${col}"/></marker>`;

  const flow = h.svg(`<svg viewBox="0 0 760 330" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial, sans-serif"><defs>${defs('#1b5e3b')}${defs('#c62828')}${defs('#9a5b00')}</defs>
    ${box(10, 120, 130, 70, '#fff', '#1b5e3b', 'Suppliers', 'who you buy from')}
    ${box(185, 120, 130, 70, '#eef3ef', '#1b5e3b', 'Purchases', 'stock comes in')}
    ${box(360, 105, 150, 100, '#1b5e3b', '#1b5e3b', 'STOCK', 'what is on your shelves', '#fff', '#d7e8de')}
    ${box(560, 40, 190, 70, '#fff', '#1b5e3b', 'Dishes', 'recipes use ingredients')}
    ${box(560, 215, 190, 70, '#eef3ef', '#1b5e3b', 'Sales', 'portions sold each day')}
    ${box(360, 250, 150, 62, '#fff5e5', '#9a5b00', 'Waste and counts', 'what was lost')}
    ${box(185, 250, 130, 62, '#fff5e5', '#9a5b00', 'Expenses', 'rent, gas, salaries')}
    ${box(185, 15, 325, 60, '#edf6ef', '#2e7d32', 'Reports: profit, stock value, forecast', 'built from everything you record', '#2e7d32')}
    ${arrow(140, 155, 183, 155)}${arrow(315, 155, 358, 155)}
    ${arrow(510, 140, 558, 90)}${arrow(655, 112, 655, 213)}
    ${arrow(560, 250, 512, 190, '#1b5e3b')}
    ${arrow(435, 250, 435, 207, '#9a5b00')}
    ${arrow(315, 281, 358, 281, '#9a5b00')}
    ${arrow(435, 105, 435, 77, '#2e7d32')}
    <text x="595" y="165" font-size="11.5" fill="#1b5e3b">ingredients</text><text x="595" y="179" font-size="11.5" fill="#1b5e3b">leave stock</text>
  </svg>`);

  const rhythm = h.svg(`<svg viewBox="0 0 760 170" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial, sans-serif">
    <line x1="40" y1="60" x2="720" y2="60" stroke="#c5d5ca" stroke-width="4"/>
    ${[
      [60, 'Morning', 'Look at Home:', 'what needs attention?'],
      [215, 'Deliveries', 'Record each', 'purchase when it arrives'],
      [370, 'Service', 'Issue or waste', 'anything unusual'],
      [525, 'Closing', 'Enter the day\'s sales', 'and any expenses'],
      [680, 'Weekly', 'Count the shelves,', 'check the forecast'],
    ]
      .map(
        ([x, t, a, b]) =>
          `<circle cx="${x}" cy="60" r="15" fill="#1b5e3b"/><circle cx="${x}" cy="60" r="6" fill="#e09f1f"/>` +
          `<text x="${x}" y="30" text-anchor="middle" font-size="15" font-weight="700" fill="#1b5e3b">${t}</text>` +
          `<text x="${x}" y="100" text-anchor="middle" font-size="12" fill="#1c1b1a">${a}</text><text x="${x}" y="116" text-anchor="middle" font-size="12" fill="#1c1b1a">${b}</text>`,
      )
      .join('')}
    <text x="380" y="153" text-anchor="middle" font-size="12.5" fill="#5f5b57">Once a month: look at Reports, and make sure there is a fresh backup.</text>
  </svg>`);

  const copies = h.svg(`<svg viewBox="0 0 760 190" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial, sans-serif"><defs>${defs('#1b5e3b')}</defs>
    ${box(10, 55, 150, 80, '#1b5e3b', '#1b5e3b', 'Your phone', 'the live data', '#fff')}
    ${box(230, 55, 170, 80, '#eef3ef', '#1b5e3b', 'Backup file', 'locked with your passphrase')}
    ${box(500, 5, 250, 52, '#fff', '#2e7d32', 'Google Drive', 'if set up for your app', '#2e7d32')}
    ${box(500, 69, 250, 52, '#fff', '#1b5e3b', 'WhatsApp / email to yourself', 'Share button', '#1b5e3b')}
    ${box(500, 133, 250, 52, '#fff', '#1b5e3b', 'Your computer (USB cable)', 'copy the .rimbak file', '#1b5e3b')}
    ${arrow(160, 95, 228, 95)}${arrow(400, 80, 498, 31)}${arrow(400, 95, 498, 95)}${arrow(400, 110, 498, 159)}
  </svg>`);

  const chips = h.table(
    ['What you see', 'Means', 'What to do'],
    [
      ['**✓ In stock**', 'More than the reorder point is on the shelf.', 'Nothing.'],
      ['**⚠ Low**', 'At or below the reorder point.', 'Put it on the next order.'],
      ['**✖ Out**', 'None left.', 'Order now, and do not promise dishes that use it.'],
    ],
  );

  const chapters = [];
  const chapter = (title, summary, ...parts) => chapters.push({ title, summary, html: parts.join('') });

  /* ===================================================== 1 */
  chapter(
    'Welcome',
    'What the app does, and the five ideas that make it work.',
    h.p('Restaurant Inventory keeps track of your kitchen store. It knows what you have, what it cost, what you used, what you threw away, and what to buy next. It also works out what each dish costs and what you earn from it, so at the end of the month you can see your real profit.'),
    h.p('It runs on your Android phone and **needs no internet** for everyday work. Your records stay on your phone. There is no account to create and no monthly fee. The habit that makes it work is simple: record what arrives, record what you sell, and note what is thrown away. A few minutes at closing time gives you reliable numbers all month.'),
    h.h3('How everything fits together'),
    flow,
    h.p('Read the picture from left to right. Goods arrive from **suppliers** as **purchases** and become **stock**. When you sell a **dish**, the ingredients in its recipe leave the stock automatically. Waste and stock counts also take stock away, and **expenses** such as rent are added in. **Reports** and the **forecast** are made from all of it.'),
    h.h3('Five ideas to remember'),
    h.table(
      ['Idea', 'What it means for you'],
      [
        ['**Stock only changes when you record something**', 'You never type a new stock number over the old one. You record a purchase, a sale, waste or a count, and the stock follows. That is why you can always see what happened.'],
        ['**Mistakes are voided, not erased**', 'If you enter something wrongly, you void it. The app puts the stock and money back, and keeps the record that it happened.'],
        ['**Stock can never go below zero**', 'If you try to sell or use more than you have, the app tells you which ingredient is short. Record the missing purchase first.'],
        ['**Everything is counted in small units**', 'Grams (g) for things you weigh, millilitres (ml) for liquids, pieces (pcs) for things you count. Large numbers are shown as kg or litres for you.'],
        ['**Money is in rupees**', 'Amounts are in Rs and exact to the paisa, so nothing is rounded away.'],
      ],
    ),
  );

  /* ===================================================== 2 */
  chapter(
    'Installing the app',
    'Getting the app onto a phone, and allowing notifications.',
    h.p('You need an Android phone with **Android 7.0 or newer**. The app is about 51 MB. It works on ordinary phones and tablets, with a 64-bit or 32-bit processor.'),
    h.h3('Install it'),
    h.steps([
      'On the phone, open the download page in the browser: `github.com/Wajahat-Programmer/restaurant-inventory/releases/latest`.',
      'Under **Assets**, tap the file called `restaurant-inventory-v1.1.0.apk` (the exact version number may be higher). Do not download the `.sha256` file; it is only a checksum.',
      'Wait until the download finishes. Use Wi-Fi if you can. A half-finished download cannot be installed.',
      'Open the downloaded file from the browser\'s download list or from the Files app.',
      'If Android says installing from this source is blocked, tap **Settings**, switch on **Allow from this source**, then go back.',
      'Tap **Install**. When it finishes, tap **Open**.',
    ]),
    h.warn('If Android says **"App not installed as package appears to be invalid"**, the file was damaged during the download. Delete it and download again on a steady connection, or copy the file to the phone with a USB cable.'),
    h.tip('Google Play Protect may show a message because the app does not come from the Play Store. Choose **Install anyway** (under "More details"). This is normal for apps shared directly.'),
    h.h3('Allow notifications'),
    h.p('The first time the app opens, Android asks whether it may send notifications. Tap **Allow**. The app uses notifications for only three things: a daily note of what needs attention, a warning if backups keep failing, and a message when a new version is ready. Nothing is ever sent to another person.'),
    h.figure('00-notification-prompt', [{ x: 50, y: 53.5 }], ['Tap **Allow** to receive the daily alerts. If you tap "Don’t allow", the app still works, but you will not be told about low stock unless you open it.'], 'Android asks once.'),
    h.h3('If you installed a test version before'),
    h.p('An earlier test copy may have been signed differently. Android then refuses to install the real one over it. **Make a backup first** (chapter 12), uninstall the test copy, install the real app, then restore the backup.'),
  );

  /* ===================================================== 3 */
  chapter(
    'Your first day: quick start',
    'Seven steps from an empty app to a working shop.',
    h.steps([
      '**Take the two-minute tour** (the card on Home), or skip it and come back later from `More` → `Help and manual`.',
      '**Add your suppliers.** `More` → `Suppliers` → `+ Supplier`. Name and phone number are enough.',
      '**Add your items.** `Stock` tab → `+ Item`. Give each ingredient a name, a unit (g, ml or pcs), a par level and a reorder point. Enter what you have today as the opening stock (chapter 5). Many items at once? Import them from a spreadsheet (chapter 13).',
      '**Record your next delivery.** `Purchases` tab → `+ Purchase` (chapter 7). From now on every delivery goes in.',
      '**Add your dishes.** `More` → `Dishes and recipes` → `+ Dish`. List what goes into one portion (chapter 8). The app shows the cost and your margin at once.',
      '**Enter the day\'s sales** each evening: `Home` → `Enter sales`.',
      '**Turn on backups.** `More` → `Settings` → `Export, import, backup`. Choose a passphrase, write it down, and tap `Back up now` (chapter 12).',
    ]),
    h.h3('A normal day'),
    rhythm,
    h.rule('You do not have to be perfect on day one. Start with your most expensive and most-used ingredients. The numbers get more useful every week you keep going.'),
    h.h3('What a good first week looks like'),
    h.table(
      ['Day', 'Do this'],
      [
        ['Day 1', 'Add suppliers, items with opening stock, and your 5 best-selling dishes.'],
        ['Days 2–6', 'Record each delivery. Enter sales every evening. Note any waste.'],
        ['Day 7', 'Count the shelves (`More` → `Stock count`). Look at `Reports` for the week. Make your first backup.'],
        ['After 2 weeks', 'The forecast starts to suggest what to order (chapter 10).'],
      ],
    ),
  );

  /* ===================================================== 4 */
  chapter(
    'Home, tabs and the More menu',
    'Finding your way around.',
    h.p('The app has five tabs along the bottom: **Home**, **Stock**, **Purchases**, **Sales** and **More**. Home is your dashboard.'),
    h.figure(
      '01-home',
      [{ x: 4, y: 12.5 }, { x: 3.5, y: 19 }, { x: 3.5, y: 40.5 }, { x: 3.5, y: 56 }, { x: 3.5, y: 79.5 }, { x: 50, y: 93.2 }],
      [
        '**Enter sales** and **Add expense**: your two daily jobs, one tap away.',
        '**Needs attention**: low stock, items about to expire, and anything unusual. Tap `Forecast and ordering` for more.',
        '**Today**: sales so far, what the ingredients cost, and what is left after expenses.',
        '**This month**: sales, gross profit, food cost, wastage and net profit for the month so far.',
        '**Right now**: the value of your stock, how many items are low or out, what you owe suppliers, and your cash balance.',
        'The five **tabs**. The one you are on is highlighted.',
      ],
      'The Home screen.',
    ),
    h.p('Staff members who sign in with a PIN see a simpler Home without money figures (chapter 11).'),
    h.h3('The two-minute tour'),
    h.p('The first time you open the app, a card at the top of Home offers a guided tour. Tap `Start the tour`. The app walks through the main screens, dims everything except the thing it is explaining, and says what it is for. `Next` and `Back` move through the steps, and `Skip tour` leaves at any time. `Not now` hides the card for good; you can start the tour again whenever you like from `Help and manual`.'),
    h.gallery([
      { name: '41-tour-offer', pins: [{ x: 4, y: 13 }, { x: 8, y: 22 }, { x: 45, y: 22.5 }], caption: '**1** The offer. **2** `Start the tour`. **3** `Not now`.' },
      { name: '42b-tour-highlight', pins: [{ x: 3, y: 28.5 }, { x: 6, y: 37.5 }, { x: 6, y: 45.5 }, { x: 73, y: 51 }], caption: '**1** What is being explained is outlined. **2** Where you are in the tour. **3** What it is for. **4** `Next`.' },
    ]),
    h.h3('The More menu'),
    h.figure(
      '11-more',
      [{ x: 3, y: 14.5 }, { x: 3, y: 27 }, { x: 3, y: 39.5 }, { x: 3, y: 51.5 }, { x: 3, y: 63.5 }, { x: 3, y: 75 }, { x: 3, y: 86 }],
      [
        '**Forecast and alerts**: what to order and what runs out (chapter 10).',
        '**Reports**: profit and loss, stock value, supplier spend (chapter 9).',
        '**Dishes and recipes**: what goes into each dish (chapter 8).',
        '**Expenses**: rent, salaries, gas, utilities.',
        '**Cash book**: money in and out, with balances (chapter 9).',
        '**Suppliers**: who you buy from and what you owe (chapter 7).',
        '**Stock count**: count the shelves and fix differences (chapter 6).',
      ],
      'The More menu. Staff see only the items they may use.',
    ),
    h.p('Scroll down for the last two entries:'),
    h.figure(
      '11b-more-lower',
      [{ x: 3, y: 66 }, { x: 3, y: 77.5 }],
      [
        '**Settings**: appearance, 3D photos, ordering days, PIN lock, backup, import and export, updates (chapters 11 to 14).',
        '**Help and manual**: the guided tour and this manual inside the app.',
      ],
      'The bottom of the More menu.',
    ),
    h.h3('Help and manual, inside the app'),
    h.p('Everything in this manual is also in the app, without internet. Open `More`, then `Help and manual`.'),
    h.figure(
      '40-help',
      [{ x: 6, y: 23.5 }, { x: 6, y: 41 }, { x: 3.5, y: 53.5 }, { x: 93, y: 54 }],
      [
        '`Start the guided tour` runs the tour again.',
        '`Share the manual as PDF` makes a PDF of the in-app manual and opens the share sheet.',
        'A chapter. Tap its title...',
        '...and it opens in place. Tap again to close it.',
      ],
      'Help and manual.',
    ),
  );

  /* ===================================================== 5 (items) */
  chapter(
    'Items and stock',
    'Adding ingredients, reading the stock list, and the item page.',
    h.h3('Add an item'),
    h.p('Go to the **Stock** tab and tap `+ Item`. This is the form, filled in for a vegetable you buy often:'),
    h.figure(
      '06c-item-form-filled',
      [{ x: 4.5, y: 12.5 }, { x: 4.5, y: 21 }, { x: 4.5, y: 30 }, { x: 4.5, y: 40 }, { x: 52, y: 40 }, { x: 4.5, y: 50 }, { x: 4.5, y: 68 }, { x: 4.5, y: 77 }, { x: 4.5, y: 90 }],
      [
        '**Name**: what you call it. Each name can be used once.',
        '**Base unit**: **g** for things you weigh, **ml** for liquids, **pcs** for things you count. Choose with care: this cannot be changed later.',
        '**Category** (optional): Grains, Meat, Vegetables... It groups the stock value report.',
        '**Par level**: how much you like to have on the shelf when fully stocked (here 5,000 g = 5 kg).',
        '**Reorder point**: when stock falls to this, the item shows as Low.',
        '**Shelf life (days)** (optional): the app warns you before it expires.',
        '**Pack sizes** (optional): lets you buy by the bag or carton, for example "25 kg bag = 25000". You then type 2 bags and the app does the sum.',
        '**Opening stock** (optional): what you have today and what it cost in total.',
        'Tap **Add item**.',
      ],
      'Adding an item.',
    ),
    h.tip('Not sure of the par level or reorder point? Leave them at 0 and set them after a week, when you can see how fast the item is used. You can change them any time with `Edit`.'),
    h.h3('Read the stock list'),
    h.figure(
      '02-stock-list',
      [{ x: 6, y: 14 }, { x: 3.5, y: 19.8 }, { x: 3.5, y: 25.5 }, { x: 94, y: 26.5 }, { x: 83, y: 55 }, { x: 78, y: 85 }],
      [
        '**Search** by name or barcode.',
        'The summary: how many items, the **total stock value**, and how many need attention.',
        'One card per item, with its category.',
        'On the right: the **quantity on hand** and its **value** in rupees.',
        'The **status** is written in words with a symbol, never by colour alone.',
        '**+ Item** adds a new one.',
      ],
      'The Stock tab.',
    ),
    chips,
    h.h3('Barcodes'),
    h.p('Items that come in a packet usually have a barcode. Give an item its barcode once, and from then on you can find it by pointing the camera at the packet.'),
    h.steps([
      'In the item form, tap `Scan the barcode` (or type the number into **Barcode**). The scanned number fills the field and what you typed is kept.',
      'To find an item later: on the **Stock** tab, tap the barcode icon at the left of the search bar, and hold the barcode of the packet inside the frame. The item opens as soon as it is read.',
      'Barcode damaged or hard to read? Type the number in the box under the camera and tap `Go`.',
      'If no item has that barcode, the app says so and offers `Add a new item with this barcode`, with the number already filled in.',
    ]),
    h.figure(
      '02b-stock-scan-icon',
      [{ x: 6, y: 14.5 }, { x: 8, y: 40 }],
      [
        'The **barcode icon** in the search bar opens the scanner. You can still type a name or a number in the bar.',
        'Items with a cut-out photo show it here instead of the grey picture.',
      ],
      'The Stock tab.',
    ),
    h.gallery([
      { name: '43-scan', pins: [{ x: 22, y: 50 }, { x: 15, y: 63.5 }, { x: 40, y: 94.5 }], caption: '**1** The frame: hold the barcode here. **2** The hint. **3** Or type the number and tap `Go`. (The camera picture is hidden here.)' },
      { name: '43b-scan-unknown', pins: [{ x: 3.5, y: 85.5 }, { x: 8, y: 90.5 }], caption: '**1** Nothing matches the number. **2** `Add a new item with this barcode`.' },
      { name: '44-item-form-barcode', pins: [{ x: 4, y: 60.5 }, { x: 48, y: 70 }], caption: '**1** The barcode field. **2** `Scan the barcode`.' },
    ]),
    h.tip('The same product can be printed as a 12-digit UPC or a 13-digit EAN (the same number with a 0 in front). The app treats both as one, so you never need to worry which your scanner reads.'),
    h.h3('The item page'),
    h.p('Tap any item to see everything about it.'),
    h.figure(
      '03-item-detail',
      [{ x: 4, y: 13 }, { x: 4, y: 27.5 }, { x: 4, y: 36 }, { x: 4, y: 51.5 }, { x: 4, y: 60.5 }, { x: 4, y: 65.5 }, { x: 4, y: 71.8 }],
      [
        'How much you have, and the status.',
        'The **value**, the **average cost** per gram (or ml, or piece), and the par and reorder levels.',
        'The **photo** (chapter 6 of this manual explains photos).',
        '**Issue**, **Waste** and **Adjust**: the three ways to take stock out (chapter 6).',
        '**Edit** changes the details. **Deactivate** hides an item you no longer use without losing its history.',
        '**Supplier prices**: the last price you paid each supplier.',
        '**Stock history**: every purchase, sale, waste and count, newest first, with the date and value.',
      ],
      'An item page.',
    ),
    h.rule('The **average cost** is recalculated every time stock comes in. If you buy 10 kg at Rs 100 per kg and later 10 kg at Rs 120 per kg, the average is Rs 110 per kg. Dish costs use this average, so they follow the market.'),
  );

  /* ===================================================== 6 (photos, stock out, count) */
  chapter(
    'Photos, using stock, waste and counts',
    'Take pictures of items, record what leaves the shelf, and check the shelves.',
    h.h3('Item photos'),
    h.p('A photo makes the list easier to read. Open the item and tap `Add photo`.'),
    h.figure(
      '28-camera',
      [{ x: 16, y: 35 }, { x: 6, y: 69.5 }, { x: 4, y: 89.5 }],
      [
        'The **dotted frame** shows where to place the item.',
        'The hint: put **one item on a plain surface**. Items that touch merge into one.',
        '**Take photo**.',
      ],
      'The camera. (The preview is empty here only because this picture was taken on a computer; on your phone you see the live camera.)',
    ),
    h.p('The app keeps the full photo and a small version for lists. On a phone with Google Play services and internet, it also tries to **cut the item out of its background**. The first time, the phone downloads a small model for this.'),
    h.figure(
      '29-photo-added',
      [{ x: 4, y: 35 }, { x: 47, y: 32.5 }, { x: 47, y: 40 }, { x: 58, y: 48.5 }, { x: 34, y: 54.6 }, { x: 4, y: 61 }],
      [
        'The photo you took (this one is a test picture).',
        '**Add another photo**. The newest becomes the main one, or use `Make main` on another.',
        'If the cutout is not ready, you see this message and the plain photo is kept. Nothing is lost.',
        '**Retry cutout** tries again when you have internet.',
        '**Delete main photo** removes it.',
        'Photos are stored on your phone and included in backups.',
      ],
    ),
    h.h3('The 3D look'),
    h.p('A cut-out photo does not sit flat on the page. It floats above it, with a soft shadow in the shape of the item, and turns a little as you tilt the phone. It is only for looks and costs nothing: it works on the item page, only while that page is open.'),
    h.gallery([
      { name: '45-item-25d', pins: [{ x: 22, y: 45 }, { x: 36, y: 82 }], caption: '**1** The cut-out. **2** Its shadow. Phone held still.' },
      { name: '45b-item-25d-tilted', pins: [{ x: 22, y: 45 }, { x: 36, y: 82 }], caption: 'The phone leaned to the right: the item turns and the shadow slides the other way.' },
    ]),
    h.p('If you prefer flat photos, switch off **Give item photos a 3D look** in `Settings`. It is also off by itself if your phone is set to reduce motion or remove animations. An item without a cut-out, such as one photographed with no internet, shows the plain photo.'),
    h.h3('Taking stock out'),
    h.p('There are three buttons on the item page. Stock never changes by typing a new number over the old one; you record why it left.'),
    h.table(
      ['Button', 'Use it when', 'Who can'],
      [
        ['**Issue**', 'Stock was used in the kitchen but not through a dish, for example for a staff meal you do not want to list as waste.', 'Everyone'],
        ['**Waste**', 'Food was thrown away: spoiled, expired, burnt, or eaten as a staff meal. Waste is counted in your reports.', 'Everyone'],
        ['**Adjust**', 'The real amount is different and you cannot say why. The difference is recorded as an adjustment.', 'Owner only'],
      ],
    ),
    h.gallery([
      { name: '04-issue', pins: [{ x: 3.5, y: 21.5 }, { x: 3.5, y: 28 }, { x: 3.5, y: 34 }], caption: '**1** Quantity (in grams here) **2** Note **3** Save' },
      { name: '05-waste', pins: [{ x: 3.5, y: 21.5 }, { x: 3.5, y: 28 }, { x: 3.5, y: 33.5 }, { x: 3.5, y: 39.5 }], caption: '**1** Quantity **2** Reason **3** Note **4** Save' },
    ]),
    h.p('Waste reasons are **spoiled**, **expired**, **burnt** and **staff meal**. Choosing the right one helps you see where money is being lost.'),
    h.h3('Count the shelves'),
    h.p('A stock count compares what the app thinks you have with what is really there. Do one every week or month. It is the best way to find leaks: waste nobody wrote down, over-large portions, or theft.'),
    h.steps([
      '`More` → `Stock count` → `Start a stock count`.',
      'Walk the shelves. For each item, type the real quantity in its **Counted** box.',
      'You can stop and come back later; what you typed is kept.',
      'When you have counted everything, tap `Post count and adjust stock`. Each difference becomes an adjustment, and the value of any loss shows up in your profit and loss.',
    ]),
    h.figure(
      '22-count',
      [{ x: 3, y: 11.7 }, { x: 4, y: 19.5 }, { x: 62, y: 17.5 }],
      [
        'How many of the items you have counted so far.',
        'The item and what the app **thinks** is there ("System").',
        'Type what you **really** counted here, in the unit shown.',
      ],
      'A stock count in progress.',
    ),
  );

  /* ===================================================== 5b purchases */
  chapter(
    'Suppliers and purchases',
    'Recording deliveries, paying suppliers, and undoing a mistake.',
    h.h3('Record a delivery'),
    h.p('Open the **Purchases** tab and tap `+ Purchase`. Record every delivery the day it arrives.'),
    h.figure(
      '08b-purchase-filled',
      [{ x: 4.5, y: 13.5 }, { x: 4.5, y: 20.5 }, { x: 10, y: 27.5 }, { x: 9, y: 33 }, { x: 56, y: 33 }, { x: 36, y: 43.5 }, { x: 4, y: 48 }, { x: 4, y: 53.5 }, { x: 4, y: 70 }],
      [
        '**Choose supplier**: tap and pick from your list.',
        '**Date**: today unless the delivery came earlier.',
        '**Choose item**: the ingredient that arrived.',
        '**Qty**: how much, in the item\'s unit (here grams). If the item has pack sizes you can switch to bags or cartons.',
        '**Rs per unit**: the price for one gram (or ml, or piece). The app works out the line total.',
        '**Add another item** for every other line on the same bill.',
        '**Total**: the whole bill.',
        '**Paid now**: leave it **blank** if you paid in full, type **0** if you bought on credit, or type the part you paid.',
        '**Save purchase (stock in)**. Stock and average cost update at once.',
      ],
      'Recording a delivery from Fresh Farms.',
    ),
    h.table(
      ['"Paid now" says', 'The purchase shows as', 'The supplier is owed'],
      [
        ['(blank)', '✓ Paid', 'Nothing'],
        ['0', '⚠ On credit', 'The whole bill'],
        ['An amount smaller than the total', '⚠ Part paid', 'The rest'],
      ],
    ),
    h.h3('The purchases list'),
    h.figure(
      '07-purchases',
      [{ x: 3, y: 13 }, { x: 3, y: 76 }, { x: 3, y: 82.5 }, { x: 38, y: 90 }, { x: 66, y: 84.5 }],
      [
        'One card per delivery: the **supplier** and the **bill total**.',
        'How it stands now: **Paid**, **Part paid** or **On credit**. It changes as you pay the supplier: payments settle the oldest debt first, so this always agrees with the supplier screen.',
        'The **items** and what each cost.',
        '**Void purchase** cancels a mistake (see below).',
        '**+ Purchase** records a new one.',
      ],
      'The Purchases tab.',
    ),
    h.h3('Suppliers and paying them'),
    h.p('Add suppliers under `More` → `Suppliers`. Tap a supplier to see what you owe them and every purchase from them.'),
    h.figure(
      '13-supplier-detail',
      [{ x: 4, y: 13.5 }, { x: 4, y: 21 }, { x: 4, y: 28.5 }, { x: 4, y: 35 }, { x: 4, y: 41 }, { x: 4, y: 52 }],
      [
        'The supplier\'s name and phone number.',
        '**What you owe** them right now (opening balance plus purchases, minus payments).',
        '**Pay supplier (Rs)**: type the amount you are paying.',
        '**Record payment**. It cannot be more than what you owe, and it appears in the cash book.',
        '**Pay all** fills in the whole amount owed in one tap.',
        'Every purchase from this supplier, with its total and what was paid when it was recorded.',
      ],
      'A supplier with an unpaid balance.',
    ),
    h.h3('Undo a wrong purchase'),
    h.p('Tap **Void purchase** on the card. The stock that purchase added is taken out again, and its money is reversed. The purchase stays in the list marked **Void**, so the history is complete.'),
    h.warn('If you already **used** some of that stock (for example in sales), the app refuses to void, because stock cannot go below zero. Void the sales first, or record the correct purchase instead.'),
  );

  /* ===================================================== 7 dishes and sales */
  chapter(
    'Dishes, recipes and sales',
    'Costing a dish, and entering the day\'s sales.',
    h.h3('Create a dish'),
    h.p('A dish is what you sell, such as Chicken Biryani. Its recipe lists the ingredients in **one portion**. Go to `More` → `Dishes and recipes` → `+ Dish`.'),
    h.figure(
      '15-recipe-form',
      [{ x: 4, y: 13.5 }, { x: 4, y: 21 }, { x: 4, y: 26 }, { x: 10, y: 32 }, { x: 10, y: 38.5 }, { x: 36, y: 45.5 }],
      [
        '**Dish name**.',
        '**Selling price per portion (Rs)**: what your customer pays.',
        '**Ingredients per portion**: the list below.',
        '**Choose ingredient**: tap and pick from your stock items.',
        '**Amount per portion**: how much goes in one portion, in the item\'s unit (150 g of rice).',
        '**Remove ingredient** takes a line out.',
      ],
      'Chicken Biryani, priced at Rs 450.',
    ),
    h.figure(
      '15b-recipe-cost',
      [{ x: 36, y: 64 }, { x: 4, y: 71 }, { x: 4, y: 74 }, { x: 4, y: 81 }, { x: 36, y: 87 }],
      [
        '**Add ingredient** for each further item.',
        '**Cost per portion**: worked out from your current average costs.',
        '**Margin**: the money left per portion and the percentage. A low or negative margin means the price is too low or an ingredient has become expensive.',
        '**Save changes**.',
        '**Take off the menu** hides a dish you no longer sell. Its past sales stay in the reports.',
      ],
      'Cost and margin, updated as you type.',
    ),
    h.tip('Check your margins every month. When the price of chicken or oil rises, the **cost per portion** here rises with it, and you can see at once which dishes need a price change.'),
    h.h3('Enter the day\'s sales'),
    h.p('Do this at closing time. Tap `Enter sales` on Home, or `+ Sales` on the Sales tab.'),
    h.figure(
      '10b-sales-filled',
      [{ x: 4.5, y: 13.7 }, { x: 9, y: 21.8 }, { x: 9, y: 29 }, { x: 35, y: 66 }, { x: 4, y: 70.5 }, { x: 96, y: 76 }, { x: 4, y: 83 }],
      [
        '**Date**: today unless you are catching up.',
        '**Choose dish**.',
        '**Portions sold**: how many you sold today.',
        '**Add another dish** for each other dish sold.',
        '**Total sales** for the day.',
        'A **stock warning**: the ingredients that are not available, and how much is short. The app will not save until the stock is recorded.',
        '**Save sales**. The ingredients leave your stock and the money is added to the cash book.',
      ],
      'Entering sales. The warning shows what is missing.',
    ),
    h.rule('Saving sales takes every ingredient out of stock for you, at today\'s average cost. That is how the app knows your real cost of food. If it says you are short of something, you probably forgot to record a delivery: record that purchase and try again.'),
    h.h3('Look back at sales'),
    h.figure(
      '09-sales',
      [{ x: 3, y: 13.5 }, { x: 3, y: 19.3 }, { x: 3, y: 25.5 }, { x: 3, y: 38.5 }, { x: 38, y: 46 }, { x: 66, y: 84.5 }],
      [
        'Look by **Day**, **Week** or **Month**.',
        '**Back** and **Next** move to the previous or next period.',
        'The summary: portions sold, **sales**, **ingredient cost** and **gross profit**.',
        'Each line: a dish, how many, the money, and what the ingredients cost.',
        '**Void sale** cancels a line. The ingredients go back into stock.',
        '**+ Sales** adds more.',
      ],
      'The Sales tab.',
    ),
  );

  /* ===================================================== 8 expenses, cash book, reports */
  chapter(
    'Expenses, cash book and reports',
    'Where the money went, and how much you really earned.',
    h.h3('Record an expense'),
    h.p('Rent, salaries, gas and electricity are not stock, so you record them as **expenses**. Tap `Add expense` on Home, or open `More` → `Expenses` and tap `+ Expense`.'),
    h.figure(
      '17b-expense-filled',
      [{ x: 4.5, y: 13.5 }, { x: 4.5, y: 22 }, { x: 4.5, y: 33 }, { x: 4.5, y: 42 }, { x: 4.5, y: 50 }, { x: 4.5, y: 57 }],
      [
        '**Date**.',
        '**What is it for?** rent, salaries, gas, utilities, maintenance or other.',
        '**Amount (Rs)**.',
        '**Paid by**: cash, bank or other.',
        '**Note** (optional): "LPG cylinders", "Fryer repair"...',
        '**Save expense**.',
      ],
      'Recording a gas bill.',
    ),
    h.figure(
      '16-expenses',
      [{ x: 3, y: 13.5 }, { x: 3, y: 18.5 }, { x: 3, y: 25.5 }, { x: 3, y: 33 }, { x: 36, y: 39.3 }, { x: 66, y: 92.5 }],
      [
        'Look by day, week or month.',
        '**Back** and **Next** change the period.',
        '**Total expenses** for the period.',
        'Each expense: category, date, how paid, note, amount.',
        '**Void expense** cancels it.',
        '**+ Expense** adds one.',
      ],
      'The expense list for October.',
    ),
    h.h3('The cash book'),
    h.p('`More` → `Cash book` shows the money that moved: sales coming in, purchases and expenses going out, and supplier payments. It is filled in for you as you work.'),
    h.figure(
      '18-cashbook',
      [{ x: 3.5, y: 12.5 }, { x: 3.5, y: 24.8 }, { x: 3.5, y: 39 }, { x: 3.5, y: 45.5 }, { x: 3.5, y: 52 }, { x: 3.5, y: 63.5 }, { x: 3.5, y: 67.8 }],
      [
        'Day, week or month.',
        '**Opening balance**, **money in**, **money out** and **closing balance** for the period.',
        'For money that is not a sale or an expense, such as putting cash in or taking it out...',
        '...choose **Money in** or **Money out**.',
        'Type the **amount** and a **note**. The note is required, so you can always say why.',
        '**Add entry**.',
        'Every entry, newest first.',
      ],
      'The cash book for one week.',
    ),
    h.h3('Reports'),
    h.p('`More` → `Reports` (owner only when the PIN lock is on). Use **Back** and **Next** to change the day, week or month.'),
    h.figure(
      '19-reports',
      [{ x: 4, y: 13 }, { x: 3, y: 27.8 }, { x: 3, y: 33.8 }, { x: 3, y: 42.8 }, { x: 3, y: 60.8 }, { x: 3, y: 70 }, { x: 3, y: 83 }],
      [
        'The period.',
        '**Sales**: money from dishes sold.',
        '**Gross profit** = sales minus the **ingredient cost** of the food you sold. It is what is left to pay everything else.',
        '**Expenses** and losses (wastage and count differences) are taken off...',
        '...to give **Net profit**: the money you actually earned, shown with ✓ for a profit or ✖ for a loss.',
        '**Cost control**: **food cost %** is ingredients divided by sales (many restaurants aim for 25–35%). **Wastage %** is how much of the stock used was thrown away.',
        '**Stock valuation**: what the stock on your shelves is worth now, by category.',
      ],
      'Profit and loss for October.',
    ),
    h.rule('Buying stock is **not** an expense until the stock is sold or lost. That is why profit uses the ingredient cost of what you sold, not the size of your deliveries. A big delivery does not make a month look bad.'),
    h.figure(
      '19d-reports-deeper',
      [{ x: 3, y: 14 }, { x: 3, y: 33 }, { x: 3, y: 51 }, { x: 3, y: 74.4 }],
      [
        '**Stock valuation** by category, with the total.',
        '**Dig deeper**: **Dish performance** and **Wastage details**, explained just below.',
        '**Share as PDF**: **Profit and loss**, **Stock valuation** and **Wastage**. The app makes an A4 PDF and opens the Android share sheet, so you can send it by WhatsApp or email, or save it.',
        '**Supplier spend**: how much you bought from each supplier in the period, and how many purchases.',
      ],
      'Stock value, deeper reports, PDF sharing and supplier spend.',
    ),
    h.h3('Dish performance: which dishes earn their place'),
    h.p('`Reports` → `Dish performance`. For the period you chose, every dish is shown with how many portions sold, the sales, and the **profit per portion** (what is left after the ingredients). The app also puts each dish in one of four groups, the way restaurant consultants do:'),
    h.table(
      ['Group', 'It means', 'What to do'],
      [
        ['**★ Star**', 'Sells well and earns well.', 'Keep it and show it first on the menu.'],
        ['**▲ Plowhorse**', 'Sells well but each portion earns little.', 'Try a small price rise or cheaper ingredients. If the profit is already a healthy share of the price (a cup of tea), the app tells you to keep it.'],
        ['**? Puzzle**', 'Earns well but sells slowly.', 'Show it more, or ask the staff to suggest it.'],
        ['**▼ Dog**', 'Sells slowly and earns little.', 'Think about dropping it.'],
      ],
    ),
    h.figure(
      '46-dish-performance',
      [{ x: 4, y: 12.7 }, { x: 3.5, y: 33.3 }, { x: 3.5, y: 44.9 }, { x: 3.5, y: 53 }],
      [
        'The period. Use **Back** and **Next**, or **Day**, **Week** and **Month**.',
        'Each dish with its group on the right. Dishes that sold most come first; dishes that did not sell at all come last and have no group.',
        '**Profit per portion** in rupees and as a percent of the price.',
        '**Price tip**: the price that would give a 65% profit. It appears only for dishes that earn less than that now. It is a suggestion; nothing changes until you edit the dish yourself.',
      ],
      'Dish performance for October.',
    ),
    h.tip('Groups are worked out only when at least two dishes sold in the period. A dish counts as selling well if it sold at least 70% of an even share of all portions. It counts as earning well if each portion earns at least the average over everything sold.'),
    h.h3('Wastage details: where the money was thrown away'),
    h.p('`Reports` → `Wastage details`. The total thrown away and the wastage %, then the same money added up **by reason** and **by item**, biggest first, each with its share of the total. The bottom card lists every time something was thrown away.'),
    h.figure(
      '47-wastage-details',
      [{ x: 4, y: 12.7 }, { x: 3.5, y: 25 }, { x: 3.5, y: 38 }, { x: 3.5, y: 57 }, { x: 3.5, y: 76 }],
      [
        'The period.',
        '**Thrown away**: the total value and the wastage %.',
        '**By reason**: spoiled, expired, burnt or staff meal. A big expired share means you are buying too much of something.',
        '**By item**: which ingredients lose you the most money.',
        '**Every time**, newest first, with the date and the note you typed.',
      ],
      'Wastage details for October.',
    ),
  );

  /* ===================================================== 9 forecast */
  chapter(
    'Forecast and alerts',
    'What to order, what will run out, and what looks unusual.',
    h.p('Open `More` → `Forecast and alerts`. The app learns from your own sales and usage, so it gets better the longer you use it.'),
    h.figure(
      '20-forecast',
      [{ x: 3.5, y: 13.5 }, { x: 3.5, y: 46.9 }, { x: 3.5, y: 60.3 }, { x: 3.5, y: 75.7 }, { x: 3.5, y: 79.9 }, { x: 3.5, y: 89 }, { x: 3.5, y: 93.9 }],
      [
        '**Needs attention**: everything that wants your eyes. Each line says what is wrong, with a symbol: ✖ for serious (already expired), ⚠ for a warning.',
        'A **price alert**: the last purchase of this item cost clearly more than usual. See the table below.',
        '**Suggested order**: how much to buy to last until the next delivery, plus a safety margin.',
        'One card **per supplier**: each item is listed under the supplier you bought it from most recently. Items you have never bought are grouped under **No supplier yet**.',
        'A **tick box**, the suggested **quantity** and the **estimated cost** (at the last price paid) for each item. Untick what you do not want to order.',
        '**Estimated cost** of the ticked items for this supplier. If some item has no price yet it says **at least**.',
        '**Share with** the supplier sends only that supplier\'s ticked items, for example on WhatsApp. The message has the quantities and asks the supplier to confirm what is available and the price.',
      ],
      'The forecast screen: alerts, then the order split by supplier.',
    ),
    h.p('Below the orders, **Money outlook** shows expected sales and expenses. It appears after a full month of records. If another supplier charged at least 10% less for an item last time, a line under that item names them, for example "Metro Cash & Carry charged 13% less last time".'),
    h.h3('What the alerts mean'),
    h.table(
      ['The app says', 'What it means'],
      [
        ['**…has expired / expires within 2 days**', 'Based on the shelf life you set and how long the oldest stock has been there.'],
        ['**…will run out in about N days**', 'At the recent rate of use, this item will be gone in about N days. "0 days" means today.'],
        ['**…is low (… left)**', 'At or below the reorder point.'],
        ['**Chicken now costs 13% more than usual**', 'The last purchase of this item cost at least 10% more per kilo (or litre, or piece) than the usual price, which is the middle of your last five purchases. It shows for two weeks after the purchase, so a one-off bargain or a one-off spike does not fool it. A purchase you cancelled is ignored.'],
        ['**Wastage this week is 8.5× the usual**', 'You threw away much more than normal. Look at what is being thrown away.'],
        ['**Usage is unusually high**', 'One day used far more than normal. Check for a recording mistake, over-portioning, or theft.'],
      ],
    ),
    h.h3('How the forecast works, and when it stays quiet'),
    h.p('For each item the app compares two ways of predicting use: a plain 7-day average and a weekly pattern (busier Fridays, quieter Mondays). It tests both on your own past days and keeps the better one. A forecast is shown only when there are at least **14 days** of history **and** it has been accurate enough.'),
    h.p('When it is not accurate enough, the item shows **"Forecast hidden: usage is too uneven to predict"**. This is honest, not an error: a wrong forecast would be worse than none. The more regularly you record, the more items get a forecast.'),
    h.h3('Ordering days'),
    h.p('In `Settings` you tell the app **Days for a delivery to arrive** and **Days between orders**. The suggested order covers both, plus a safety margin.'),
    h.tip('Once a day the app also sends the main alerts as a phone notification, so you do not have to open it to hear about low stock.'),
  );

  /* ===================================================== 10 PIN and staff (screens captured later) */
  chapter(
    'PIN lock and staff',
    'Protecting your money screens and giving staff only what they need.',
    h.p('By default anyone who opens the app can do everything. If staff use the same phone, turn on the **PIN lock**. Then the app asks who you are, and **staff** can record stock and sales but cannot see profit or cancel anything.'),
    h.h3('Turn on the lock'),
    h.figure(
      '24-security',
      [{ x: 3.5, y: 25.8 }, { x: 3.5, y: 32.8 }, { x: 3.5, y: 39.8 }, { x: 3.5, y: 47 }, { x: 3.5, y: 54 }, { x: 3.5, y: 59.5 }, { x: 3.5, y: 64.8 }],
      [
        '**Your name**. You become the **owner**.',
        '**Choose a PIN** of 4 to 6 digits.',
        '**Type the PIN again**.',
        '**Recovery passphrase** of at least 8 characters. This is how you get back in if you forget your PIN.',
        '**Type it again**.',
        'The warning is serious: there is **no server** and nobody who can reset your PIN for you.',
        '**Turn on the lock**.',
      ],
      '`More` → `Settings` → `PIN lock and people`.',
    ),
    h.warn('**Write the recovery passphrase on paper** and keep it somewhere safe, away from the phone. If you lose both the PIN and the passphrase, the lock cannot be opened.'),
    h.h3('Add staff'),
    h.p('Back on the same screen, under **Add a staff member**, type a name and a PIN of 4–6 digits and tap `Add staff`. Remove a person from the **People** list when they leave. Each person has their own PIN.'),
    h.table(
      ['', 'Owner', 'Staff'],
      [
        ['Record purchases, waste, issues, counts and sales', '✓', '✓'],
        ['See alerts, forecast and suppliers', '✓', '✓'],
        ['See profit, reports, expenses, cash book', '✓', '—'],
        ['Void purchases, sales and expenses', '✓', '—'],
        ['Adjust stock by hand', '✓', '—'],
        ['Change dishes and prices', '✓', '—'],
        ['Settings, backup, import, PIN and people', '✓', '—'],
      ],
    ),
    h.h3('Signing in'),
    h.gallery([
      { name: '31-lock-screen', pins: [{ x: 14, y: 12.5 }, { x: 36, y: 70.5 }], caption: '**1** Tap your name. **2** `Forgot PIN?`' },
      { name: '32-lock-pin', pins: [{ x: 26, y: 22.4 }, { x: 50, y: 40 }, { x: 36, y: 63 }], caption: '**1** The dots show digits typed. **2** The number pad. **3** `Unlock`.' },
      { name: '33-lock-wrong', pins: [{ x: 17, y: 62.5 }], caption: '**1** A wrong PIN says how many tries are left.' },
    ]),
    h.p('After **5 wrong PINs** the app makes you wait, and the wait grows with each further mistake (30 seconds, then 1, 5 and 15 minutes). This stops someone guessing.'),
    h.h3('What staff see'),
    h.gallery([
      { name: '34-staff-home', pins: [{ x: 14, y: 13 }, { x: 3.5, y: 20.5 }], caption: '**1** Only `Enter sales`: no money figures. **2** Stock alerts.' },
      { name: '35-staff-more', pins: [{ x: 3.5, y: 14 }, { x: 3.5, y: 26 }, { x: 3.5, y: 37 }], caption: '**1 2 3** Only Forecast, Suppliers and Stock count.' },
      { name: '36-forgot-pin', pins: [{ x: 3.5, y: 13.5 }, { x: 3.5, y: 21 }, { x: 3.5, y: 28 }], caption: '**1** Recovery passphrase **2** New PIN **3** `Reset PIN`.' },
    ]),
    h.h3('Locking, fingerprint and forgotten PINs'),
    h.list([
      '**Auto-lock**: the app locks again after you leave it for the time you choose (at once, 1, 5 or 15 minutes).',
      '**Fingerprint**: turn on **Unlock with my fingerprint** in `PIN lock and people` to open the app with your finger instead of typing the PIN.',
      '**Forgot your PIN?** On the lock screen tap `Forgot PIN?`, type the recovery passphrase (the third picture above), and choose a new PIN. Your data is untouched. Wrong recovery passphrases make you wait too, just like wrong PINs, so nobody can guess their way in.',
      '**Change my PIN**: in `PIN lock and people`, type the current PIN and a new one.',
      '**Turn the lock off**: needs the owner PIN. This removes all staff.',
    ]),
    h.h3('Who did what'),
    h.p('`More` → `Settings` → `Who did what` is a log of important actions with the person and the time: sales voided, purchases cancelled, logins, backups, imports. It cannot be edited.'),
    h.gallery([{ name: '26-audit', pins: [], caption: 'The log of actions.' }]),
  );

  /* ===================================================== 11 backup */
  chapter(
    'Backup and restore',
    'Protect your records. This is the most important chapter.',
    h.p('All your records live on this one phone. If it is lost, stolen or broken, **everything is gone** unless you have a backup. A backup is one file ending in **.rimbak** that holds items, stock, sales, money and photos. It is **locked with your passphrase**, so even if someone gets the file they cannot read it.'),
    copies,
    h.h3('Set up your backups'),
    h.steps([
      '`More` → `Settings` → `Export, import, backup`. Scroll to **Backup and restore**.',
      'Type a **backup passphrase** of at least 8 characters, twice. This is not the PIN.',
      'Tap `Save passphrase`.',
      'Tap `Back up now`. It takes a few seconds.',
    ]),
    h.figure(
      '25d-backup-passphrase',
      [{ x: 3.5, y: 62 }, { x: 3.5, y: 68 }, { x: 3.5, y: 76 }, { x: 3.5, y: 80.3 }],
      [
        'The **passphrase** (it is hidden as you type).',
        'Type it **again** to be sure.',
        'The warning says it all: **write it down**.',
        '`Save passphrase`. After this the buttons for backing up appear.',
      ],
      'Choosing the backup passphrase.',
    ),
    h.warn('Without the passphrase a backup **cannot be opened by anyone**, including us. Write it on paper and keep it with your recovery passphrase.'),
    h.h3('Automatic backups'),
    h.p('After this, the app backs up **once a day by itself** when you open it. It keeps the newest backup of each of the last 7 days and one for each of the last 4 weeks, and removes older ones. If backups fail for two days in a row, you get a notification.'),
    h.figure(
      '25g-backup-last',
      [{ x: 3.5, y: 75.5 }, { x: 3.5, y: 80 }, { x: 5, y: 86 }],
      [
        '**Last good backup**: the date and time of the newest one. It updates as soon as a backup finishes.',
        '**Back up now** makes one immediately. Do this before a big change.',
        '**Include photos in backups**: switch it off for smaller, faster backups. They still hold every record; the photos stay on this phone. With many photos the backup file can get large, so this is the answer when backups are slow or fail for lack of space.',
      ],
      'The backup section.',
    ),
    h.p('Below the buttons, **Show backups on this phone** lists the backups, newest first. **Share** beside a backup sends a copy anywhere, **Restore** brings one back, and `Add a backup file from elsewhere` is for a file you copied from another phone or computer.'),
    h.h3('Keep a copy off the phone'),
    h.p('A backup that only lives on the phone is lost with the phone. After a backup, tap **Share** beside it and send the file to yourself on WhatsApp or email, or copy it to a computer with a USB cable. Do this at least once a week. If your copy of the app is set up for **Google Drive**, you can also connect your Google account in the same screen, and the app sends each daily backup to a hidden folder only this app can see.'),
    h.h3('Restore'),
    h.p('Restore replaces **everything** on the phone with what is in the backup. Use it to move to a new phone, or after a problem.'),
    h.steps([
      'Install the app on the new phone. Open `Export, import, backup`.',
      'If the backup file is on another device, copy it to this phone and tap `Add a backup file from elsewhere`.',
      'Tap `Show backups on this phone`, then `Restore` beside the backup you want.',
      'Type the **passphrase of that backup**, then tap `Replace my data`.',
    ]),
    h.figure(
      '25f-restore-panel',
      [{ x: 3.5, y: 75.5 }, { x: 3.5, y: 89.5 }, { x: 13, y: 95.2 }, { x: 31, y: 95.2 }],
      [
        'The panel asks you to confirm. It lists the file being restored and warns that everything on the phone will be replaced.',
        'The **passphrase of this backup**.',
        '**Cancel** if you changed your mind.',
        '**Replace my data**. The app first saves a safety copy of what is on the phone now. If anything goes wrong, it puts your old data back.',
      ],
      'The restore confirmation.',
    ),
    h.tip('Practise a restore once, on an old phone or tablet, before you ever need it. Then you know the passphrase works.'),
  );

  /* ===================================================== 12 import export */
  chapter(
    'Import and export',
    'Get data in from a spreadsheet, and out to one.',
    h.p('If you already list your items in Excel or Google Sheets, import them in one go instead of typing each one. You can also export your records to a spreadsheet.'),
    h.figure(
      '25-data-export',
      [{ x: 4.5, y: 18.5 }, { x: 4.5, y: 24.7 }, { x: 4.5, y: 44.5 }, { x: 6, y: 50.7 }, { x: 36, y: 49 }],
      [
        'Choose **what to export**: items and stock, purchases, sales and so on. Some ask for a From and To date.',
        '**Export and share** makes a CSV file and opens the share sheet. Open it in Excel or Google Sheets.',
        'Choose **what to import**: items with opening stock, suppliers, or dishes and recipes.',
        '**Get template** shares an empty spreadsheet with the right column names.',
        '**Choose file** opens the file you filled in (saved as CSV).',
      ],
      '`Export, import, backup` → export and import.',
    ),
    h.h3('Importing, step by step'),
    h.steps([
      'Choose what to import and tap `Get template`. Send it to yourself and open it in Excel or Sheets.',
      'Fill in one row per item. Keep the column names exactly as they are. For items, the columns are Name, Base unit, Category, Par level, Reorder point, Shelf life days, Barcode, Opening quantity, Opening value Rs.',
      'Save as **CSV** (Comma separated values).',
      'Tap `Choose file` and pick it.',
      'The app **shows you the result before anything is added**: how many rows are ready, and every problem with its line number.',
      'Tap `Import` to add the good rows. Fix the others in the spreadsheet and import them again.',
    ]),
    h.tip('Leave the opening quantity blank for items you do not have in stock. Do not type a quantity without a value: the app needs both to know the average cost.'),
  );

  /* ===================================================== 13 settings and updates */
  chapter(
    'Settings and updates',
    'Appearance, ordering days, and getting new versions.',
    h.figure(
      '23-settings',
      [{ x: 4, y: 13.5 }, { x: 4, y: 26 }, { x: 4, y: 43.5 }, { x: 4, y: 53.5 }, { x: 4, y: 71.5 }, { x: 4, y: 78 }, { x: 4, y: 84.5 }, { x: 4, y: 93 }],
      [
        '**Appearance**: **Phone** follows your phone setting, or choose **Light** or **Dark**.',
        '**Item photos**: the switch for the 3D look of cut-out photos (chapter 6). It is off by itself when your phone is set to reduce motion.',
        '**Ordering suggestions**: how the forecast decides how much to order...',
        '...using **Days for a delivery to arrive** and **Days between orders**. Use the minus and plus buttons.',
        '**PIN lock and people** (chapter 11).',
        '**Export, import, backup** (chapters 12 and 13).',
        '**Who did what**: the log of actions.',
        '**App updates**: the installed version, `Check for updates`, and the switch that checks by itself (at most every 6 hours). Scroll down to see them.',
      ],
      'The Settings screen.',
    ),
    h.h3('Getting a new version'),
    h.p('When a new version is published, a banner appears on Home and the phone shows one notification. Then:'),
    h.figure(
      '30b-home-update-banner',
      [{ x: 3.5, y: 13.5 }, { x: 3.5, y: 18.5 }],
      ['The banner on **Home** tells you a new version is ready.', '`See and install` takes you to the update screen.'],
      'The Home banner.',
    ),
    h.figure(
      '30-update-available',
      [{ x: 3.5, y: 74.5 }, { x: 3.5, y: 80.5 }, { x: 3.5, y: 85 }, { x: 3.5, y: 91.5 }],
      [
        '`Check for updates` looks right now.',
        'The new **version**, the version you have, and the **size** of the download.',
        '**What is new**: what changed (the words written by the person who published it).',
        '`Download and install`: downloads the file, checks it, and hands it to Android.',
      ],
      'An update is available (an example).',
    ),
    h.steps([
      'Open `More` → `Settings`. Under **App updates**, tap `Check for updates` if the banner is not showing.',
      'Read what is new, then tap the install button. The app downloads the file and **checks it is exactly the file that was published**. If not, it deletes it and does not install.',
      'Android asks you to confirm. Tap **Update**. The first time, Android may ask you to allow this app to install updates: switch on **Allow from this source** and go back.',
      'Your data is kept. For extra care, tap `Back up now` first.',
    ]),
    h.tip('Updates only work if the new file is signed with the same key as your installed app. That is checked by Android itself, so a fake update cannot replace your app.'),
  );

  /* ===================================================== 14 troubleshooting */
  chapter(
    'Troubleshooting and questions',
    'Quick answers to common problems.',
    h.table(
      ['Problem', 'What to do'],
      [
        ['**"There is not enough stock" when I enter sales**', 'Stock cannot go below zero. A delivery was probably not recorded: record that purchase first. If the shelf really has the food, do a stock count so the app agrees.'],
        ['**The numbers look wrong for a day**', 'Open `Settings` → `Who did what` to see what was entered and by whom. Fix a mistake by voiding the entry and entering it again.'],
        ['**I entered something twice**', 'Void the extra one (**Void sale**, **Void purchase** or **Void expense**). The stock and money go back.'],
        ['**I forgot my PIN**', 'On the lock screen tap `Forgot PIN?` and use your recovery passphrase. Five wrong guesses make you wait, so type it carefully.'],
        ['**The barcode scan does nothing**', 'Hold the barcode flat inside the frame in good light, not too close. If it still will not read, type the number in the box under the camera.'],
        ['**A photo looks flat, not 3D**', 'Only cut-out photos float. Check that `Settings` → **Give item photos a 3D look** is on, and that your phone is not set to remove animations.'],
        ['**Backups are slow or too big**', 'Switch off **Include photos in backups** under `Export, import, backup`. The backup still holds all your records.'],
        ['**I forgot the recovery passphrase and the PIN**', 'It cannot be reset. Restore a backup on a freshly installed app to continue; your records in the backup are intact.'],
        ['**"Wrong passphrase, or the file is damaged"** when restoring', 'The passphrase is case-sensitive and spaces count. If you are sure it is right, try another backup in the list: the file may have been damaged while copying.'],
        ['**Backups say failed**', 'Most often the phone is out of free space. Free some space and tap `Back up now`.'],
        ['**The photo cutout does not work**', 'It needs a phone with Google Play services and internet the first time. The plain photo is kept; tap `Retry cutout` later.'],
        ['**The update will not install**', 'Allow the app to install updates when Android asks. Check your internet and free space. If it says the checksum does not match, do not install: try again later.'],
        ['**The app says a forecast is hidden**', 'Usage is too uneven to predict reliably, or there are fewer than 14 days of records. Keep recording.'],
        ['**I changed phones**', 'Make a backup on the old phone, copy the file, install the app on the new one, and restore (chapter 12).'],
      ],
    ),
    h.h3('Questions people ask'),
    h.p('**Does it need internet?** Not for everyday work. It uses the internet only to check for updates, to download the photo cutout model once, and for Google Drive if you connect it.'),
    h.p('**Where is my data?** Only on your phone, inside the app. There is no account and no server. That is why backups matter.'),
    h.p('**Can two phones share one stock?** No. The app is for one phone. If staff use it, they use the same phone with their own PIN.'),
    h.p('**Can I change an item\'s unit later?** No, to protect your history. Make a new item and set the old one inactive.'),
    h.p('**Can I delete an item?** You can deactivate it. Its history stays, so reports stay correct.'),
  );

  /* ===================================================== 15 glossary + checklist */
  chapter(
    'Glossary and checklists',
    'The words used in the app, and a one-page routine.',
    h.table(
      ['Word', 'Meaning'],
      [
        ['**Base unit**', 'g, ml or pcs: what quantities are stored in.'],
        ['**Par level**', 'How much you want on the shelf when fully stocked.'],
        ['**Reorder point**', 'When stock falls to this, the item is Low.'],
        ['**Average cost**', 'The weighted average price of the stock you hold.'],
        ['**Gross profit**', 'Sales minus the ingredient cost of what you sold.'],
        ['**Net profit**', 'Gross profit minus wastage, count losses and expenses.'],
        ['**Food cost %**', 'Ingredient cost divided by sales.'],
        ['**Margin**', 'Selling price minus cost per portion.'],
        ['**Void**', 'Cancel an entry by recording its opposite. The original stays in the history.'],
        ['**Adjustment**', 'A correction from a stock count or by the owner.'],
        ['**Lead days**', 'How long a delivery takes after you order.'],
        ['**Passphrase**', 'The secret words that lock backups (not the PIN).'],
        ['**.rimbak**', 'A backup file.'],
      ],
    ),
    h.h3('Daily'),
    h.list(['Record every delivery.', 'Record waste and anything issued.', 'Enter the day\'s sales and expenses.', 'Look at **Needs attention** on Home.']),
    h.h3('Weekly'),
    h.list(['Count the shelves (`Stock count`).', 'Look at the forecast and send the shopping list.', 'Share the latest backup to WhatsApp, email or your computer.']),
    h.h3('Monthly'),
    h.list(['Read **Reports**: net profit, food cost %, wastage %.', 'Check dish margins and prices.', 'Pay supplier balances.', 'Check for app updates.']),
  );

  return { chapters, intro: '' };
};
