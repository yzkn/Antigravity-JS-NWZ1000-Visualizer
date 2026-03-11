# Walkman NW-Z1000 Visualizer Themes Reproduction

The visualizer app has been fully updated to support modern Web APIs implementing logic inspired by the 12-Tone Analysis Walkman visualizers.

## Completed Features
- **Preparation & Refactoring:**
  - Integrated `Three.js` for 3D rendering.
  - Extracted fast Fourier transform (`analyser.getByteFrequencyData`) into specific frequency bands (bass, mid, treble) for accurate beat detection.
  - Implemented an extensible, multi-layer rendering orchestration (`Canvas2D`, `Three.js`, and `DOM CSS3D`).

- **Theme 1: Gate** (`Three.js`)
  - Displays a warp tunnel with geometric shapes navigating forward.
  - Camera FOV pulses to simulate intense screen shake upon detecting strong kick drum/bass hits.

- **Theme 2: Balloon** (`Canvas 2D`)
  - Colored orbs bounce realistically using a simple 2D collision physics engine.
  - Bass impacts gravity and treble creates trembling/vibration effects on individual balloons.

- **Theme 3: Glow** (`Canvas 2D`)
  - Smooth sine wave fluid lines drawn with screen-blending additions.
  - Modulates color palette organically based on the dominant frequency spectrum ratios.

- **Theme 4: Animal** (`Canvas 2D`)
  - Draws dynamic grassy plain silhouettes. 
  - A deer jumps in sync with strong rhythmic beats, and flocks of birds scatter across the screen during energetic crescendos.

- **Theme 5: Albums** (`CSS 3D Transforms`)
  - Places loaded playlist cover arts within a 3D perspective circle slowly revolving around the current track's artwork.
  - Uses CSS filters to generate dropping shadows and scaling that reacts live to audio amplitude.

- **Theme 6: Graffiti** (`Canvas 2D Particle System`)
  - Splash particles are spawned rapidly on snare drops.
  - Splats drip downwards imitating wet ink; drip speed accelerates on heavy hits.

- **Theme 7: Ink** (`Canvas 2D + SVG Gooey Filter`)
  - Features organic color droplet explosions that blur and combine like liquid metaballs.
  - Circles swirl outwards from the center on heavy drops.

- **Theme 8: Random** (`Auto-Switcher Lifecycle`)
  - Routinely selects between Themes 1-7.
  - Will preemptively drop into a new visualizer theme if a massive drop in bass energy is detected (e.g., entering a chorus).

## How to Verify
1. Open up [index.html](file:///c:/Users/y/Documents/GitHub/Antigravity-JS-NWZ1000-Visualizer/app/index.html) in a modern browser (e.g. Chrome, Edge).
   - *Note:* If you run into strict CORS issues with `Three.js` importing local files directly via `file://`, simply start a local static server like `npx http-server .` in the app directory and open `http://localhost:8080`.
2. Drag and drop a few `.mp3` files (with embedded cover art, if possible) onto the page.
3. Click play. Ensure your speakers are on, and use the top dropdown menu to cycle through all 8 themes. 
4. Select [Random](file:///c:/Users/y/Documents/GitHub/Antigravity-JS-NWZ1000-Visualizer/app/app.js#1192-1216) mode to test the automatic theme transition logic!
