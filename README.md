# Equipment Finder v8 — Mobile gesture update

This package is based on the uploaded EQUIPMENT-version-8-enhanced.zip.

## Mobile map controls

- Pinch with two fingers on the floor map to zoom in or out.
- Drag the map with one finger to pan horizontally or vertically.
- Use **Fit** to return to an overview and **Fullscreen** to expand the map.
- The separate Zoom + and Zoom − buttons have been removed.
- Equipment tiles remain tappable to view their details.

## Unchanged

- Equipment Data and Edit equipment details remain hidden.
- Search, fullscreen, corrected equipment IDs, map recoloring, and the existing tiles.js remain intact.
- The floor-map.png image and equipment index were not modified.

## GitHub Pages update

For an existing deployment of this uploaded version, replace these four files
in the repository root: `index.html`, `app.js`, `styles.css`, and `sw.js`.
Commit, wait for GitHub Pages to publish, then close and reopen the iPhone PWA
while online. The new service-worker cache key refreshes the installed assets.
# Map tools: missing equipment and positions

Open **Map tools** (above the floor map) and choose **Add missing equipment**. Tap its location, enter the equipment ID and optional second line, choose background/text colors, then save. To move or resize a tile, select it and choose **Move / resize selected**. Drag the cyan box to move; drag the yellow corner to resize; numeric X/Y/Width/Height fields also work.

Edits are kept in this device's browser storage. To publish them to everyone, use **Map tools → Download updated tiles.js** and replace your deployed `tiles.js` file with the downloaded one. Reload the PWA (including its offline cache) if needed. The base `floor-map.png` remains unchanged: moved and newly added equipment are drawn as editable overlay tiles. Original equipment may still be visible at its old position in the underlying screenshot.

The previously hidden **Equipment Data** and **Edit equipment details** panels remain hidden. Mobile one-finger pan and two-finger pinch zoom remain enabled. CSV export includes equipment positions and new equipment; CSV import accepts valid coordinate changes and consecutive new tile numbers.
