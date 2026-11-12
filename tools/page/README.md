# Page artwork

Source of every image in `assets/` and of the framed copies in `docs/screenshots/framed/`.
The style follows the plugin: charcoal glass with a crimson-to-emerald edge, and Cairo SemiBold for all text —
the same font used on the pages of every Ultra plugin, so the family reads as one.

```sh
npm i playwright && npx playwright install chromium   # once
node tools/page/build.js            # hero, headings, buttons, features, steps, family cards, colophon
node tools/page/build.js art hero   # only outputs whose name contains "hero"
node tools/page/build.js shots      # frame every docs/screenshots/NN_name.jpg into docs/screenshots/framed/
```

New screenshots: add them to `docs/screenshots/` with the next number (`23_…jpg`), run `shots`, and reference
the framed copy from the README. Original screenshots are never modified or removed.
