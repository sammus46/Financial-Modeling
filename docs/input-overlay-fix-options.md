# Input Text Behind Sticky Header/Card — Fix Options

## Observed issue
When the left panel scrolls, text from focused/visible inputs can appear visually behind or through the sticky header (`.panel-top-card`) and section headers.

Relevant current styles:
- `.inputs-panel` is sticky and scrollable (`position: sticky; overflow-y: auto; isolation: isolate;`).
- `.panel-top-card` is sticky with `z-index: 10`.
- `.input-grid` has `position: relative; z-index: 1`.

## Option 1 (recommended): Add an explicit opaque occlusion layer under sticky card
Use a pseudo-element on `.panel-top-card` that extends slightly below the card and paints solid background.

Why:
- Eliminates any anti-aliased glyph bleed while scrolling beneath sticky element.
- Keeps current layout/behavior and is low-risk.

Tradeoffs:
- Needs careful height tuning so it doesn't hide first field labels.

## Option 2: Remove explicit z-index from `.input-grid`
Let the form remain in normal stacking context below sticky card.

Why:
- Avoids accidental stacking interactions where children may composite unexpectedly above/beside sticky siblings.

Tradeoffs:
- If any downstream feature depended on `.input-grid` layering, it may need a targeted replacement.

## Option 3: Add `overflow: clip` (or `hidden`) to sticky card wrapper
Clip anything that intersects sticky card bounds and optional buffer region.

Why:
- Strong visual guarantee that text can’t paint “through” the sticky region.

Tradeoffs:
- Might clip focus rings / shadows unless additional padding is added.

## Option 4: Convert top card to `position: sticky` + dedicated spacer/mask row
Structure panel as:
- sticky row (header card)
- non-sticky content row with top padding equal to sticky height

Why:
- Most robust architecture for long forms and keyboard focus.

Tradeoffs:
- Slightly more refactor work.

## Option 5: Force own compositing layer on sticky card and reduce transform effects below
Apply:
- `will-change: transform; transform: translateZ(0);` on sticky card
- avoid/limit `filter/backdrop-filter` interactions below if possible

Why:
- Can resolve GPU/compositor paint artifacts in some browsers.

Tradeoffs:
- Browser-specific; less deterministic than an occlusion mask.

## Suggested rollout order
1. Option 1 + Option 2 together (fast, low risk).
2. If still visible in Safari/iOS, try Option 5.
3. If issue persists across browsers, perform Option 4 refactor.
