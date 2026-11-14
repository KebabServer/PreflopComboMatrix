# TurnRiverLab v16 — Single-Core GitHub Pages

The public site is static. Extract `TurnRiverLab-v16-Single-Core-GitHub-Pages.zip`
and upload **all files** into the root of your GitHub repository, including
`.nojekyll`. Under GitHub **Settings → Pages**, choose **Deploy from a branch**,
`main`, and `/(root)`.

Your site will appear at `https://USERNAME.github.io/REPOSITORY/` after GitHub
Pages deploys. The solver runs locally in **one Web Worker**, using built-in
scalar/SIMD WebAssembly as available. No server backend, secret keys,
SharedArrayBuffer, multicore threads, or special security headers are needed.

The lean v16 WebAssembly engine handles ordinary river and turn games, while
its bounded showdown/reach-cache sibling runs only when the game structure
permits exact reuse. The Blob Worker includes both kernels and their scalar
fallbacks. CFR+, DCFR-family algorithms and QRE remain available. Read
`PERFORMANCE-V16-SINGLECORE.md` in the source archive for numerical tests,
benchmarks and limitations.

The clean GitHub Pages ZIP omits tests and development tooling. Do not upload
the full source archive unless you specifically want those files in GitHub.


## v16.1 audit hardening
This build fixes Workerless initialization error recovery, validates full-game
node budgets in the core, and rejects malformed imported solution records.
The numerical CFR+/QRE solvers and WASM binaries are unchanged from v16.
See `CODE-REVIEW-V16.1.md` in the separate audited source package.
