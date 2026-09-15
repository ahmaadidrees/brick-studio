# Consistent selection outline

Released product e80c3c9 to brickgineers.com and virtual-legos.vercel.app.
Deployment dpl_9kpgCqod38a7mxbjsqfAkHa5om1m, https://virtual-legos-lgb76glns-ahmaadidrees-projects.vercel.app.
Both aliases confirmed /assets/index-DGY49lz5.js. Backend unchanged.

All selected bricks use the same 2px blue edge with a 4px pale casing. Depth testing preserved; no hidden-edge x-ray. No changes to selected IDs, hover, color, editing, persistence or networking. Adds one edge draw per selected brick; no full-screen postprocessing.

TypeScript/Vite builds passed. Local screenshot verifies multiselection on white, blue and dark bricks. Public desktop harness passed at 1024x600,1280x720,1366x768,1920x1080 with no page errors, including placement, selection, recolor/rotate/raise, exact export and cold reload. Evidence in public/.
Rollback frontend: dpl_tSUvRHwoWWY4THm5c77Gqek4bcQW.
