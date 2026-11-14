# TurnRiverLab v15 — GitHub Pages

Upload these files directly to the root of your GitHub repository, including
`.nojekyll`. Configure **Settings → Pages → Deploy from a branch → main → /(root)**.

The app runs wholly in your browser using a single Web Worker. It has no
backend, no multicore requirements and no SharedArrayBuffer dependency.
Both CFR+ and QRE remain available, with checkpoint import/export.

v15 safely selects between the original v14 traversal engine and an exact
bounded opponent-reach/showdown cache when the game tree allows reuse.
For accuracy checks and benchmarking, see the separate validated source ZIP.
