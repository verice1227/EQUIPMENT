# Equipment Finder — L4 PowerPoint map edition

## Simplified interface edition

This copy deliberately hides the **Map tools** toolbar and the entire **Equipment Data** section. Equipment search, fullscreen, mobile pinch zoom, and **Edit Equipment Details** remain available. Edits to labels and colors are stored in the current device's browser, but publishing them through the UI requires the full editor edition (which contains the `tiles.js` download button).

When updating an already deployed L4 PowerPoint map edition, replace `index.html` and `sw.js`. When upgrading from a different floor map, upload all files in this package, including the new `tiles.js` and `floor-map.svg`.

Rebuilt using the shapes in the supplied `L4-MAP.pptx` (one slide, 195 equipment text boxes). The new floor-map background is a clean architectural SVG recreated from the PowerPoint shapes; new equipment positions and IDs are saved in `tiles.js`. The source PPT lists equipment IDs only, so there is no inferred second-line description.

## Features

- Search and highlight equipment by ID, plus quick suggestions and fullscreen search.
- Tap a tile to view details. Equipment Data and Edit Equipment Details are visible.
- Edit equipment labels, tile background and black/white text colors.
- Map tools: add missing equipment; move and resize existing tiles by dragging or entering coordinates.
- One-finger map panning and two-finger pinch zoom, Fit, Fullscreen.
- Save changes locally, CSV import/export and generate an updated `tiles.js` for GitHub.

Equipment tiles now render separately over the map. After moving a tile, it appears only at its new location; the old position is no longer embedded in a screenshot.

## GitHub Pages deployment

**Replace/add these files together:** `index.html`, `app.js`, `styles.css`, `sw.js`, **`tiles.js`**, and **`floor-map.svg`**. The new map cannot work with old `tiles.js` or the old purple `floor-map.png`. Keep `manifest.webmanifest` and the existing `icons/` folder, or use the copies in this package.

The data uses a new device-local storage key to avoid applying corrections from an earlier, geometrically different map. Back up your previously edited `tiles.js` before replacing it; this L4 edition intentionally starts with equipment IDs and positions extracted from the supplied PowerPoint.

If your installed iPhone PWA still shows an older map, close it, reload while online, and reopen after the service worker updates.
