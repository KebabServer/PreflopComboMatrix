# TurnRiverLab v16.10 — GitHub Pages upload

This is the **static production application**. The complete development source,
WebAssembly C kernels, tests and benchmarks are provided in the separate Full
Source and Tests ZIP.

## Upload to GitHub Pages

1. Extract this ZIP on your computer.
2. Create a public GitHub repository and upload **the extracted files** to the
   repository root. Do not upload the ZIP as one file or nest the files inside
   another folder; `index.html` must be in the selected Pages root.
3. In repository **Settings → Pages**, under Build and deployment, choose
   **Deploy from a branch**, `main`, `/(root)`, and Save.
4. Open `https://USERNAME.github.io/REPOSITORY/` after deployment completes.
   Hard-refresh after updates if a prior version appears cached.

Runs entirely in a browser; no server, keys, dependencies or build step.
Embedded scalar/SIMD WebAssembly remains bundled in `wasm-kernel-data.js`.

## v16.10 improvements

- Established DCFR remains default, with a 0.35% of pot target exploitability.
- Policy updates are fused into native traversal for eligible DCFR solves.
- Time-budgeted iteration batches and faster cost-aware exact stopping checks.
- Persistent Web Worker reuses compiled WASM across independent runs.
- CFR+ remains selectable under Legacy algorithms; all other GTO variants,
  QRE, all-street donking, exact symmetries, action culling, benchmarks,
  saved configurations and exports remain available.

The source release was validated with 46/46 required numerical/browser suites.
GitHub-hosted behavior still depends on browser features and local resources.
