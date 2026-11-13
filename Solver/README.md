# TurnRiverLab v12 — GitHub Pages edition

A static, browser-based poker solver built from **TurnRiverLab v12**, before the v13/v14 multicore traversal changes. The numerical engine is unchanged.

## Publish to GitHub Pages

1. Create a GitHub repository, for example `TurnRiverLab`.
2. **Extract the release ZIP** and upload **all of its contents**, including the hidden `.nojekyll` file, to the repository **root**. The `index.html` file must be at the root, not inside another folder.
3. Open your repository's **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/(root)`, and click **Save**.
4. Open `https://YOUR-USERNAME.github.io/TurnRiverLab/` after publishing finishes. Substitute your actual GitHub username and repository name (case-sensitive).

No Node.js, server, build pipeline or GitHub Actions workflow is required. The site uses relative asset paths and works under a repository subdirectory. GitHub Pages serves it over HTTPS.

## What is included

- CFR+, experimental GTO algorithms, and entropy-regularized QRE.
- Turn and river solving, the existing configurable flop solving mode, and exact suit-isomorphism support where valid.
- Compiled WebAssembly traversal with a scalar fallback, and a single solver Web Worker (or a cooperative main-thread fallback).
- On-demand strategy details, JSON export, saved solutions, and `.trlc` checkpoint import/export.
- The built-in flop library.

**No v13/v14 multicore traversal** is included. V12 has no shared-memory WebAssembly requirement, so GitHub Pages' default headers are sufficient. `wasm-kernel-data.js` contains the WASM binaries already embedded as JavaScript data; separate `.wasm` files and a compiler are not required to run the site.

## Privacy and limitations

The solver performs its calculations locally in your browser. This package does not require accounts, external APIs, or a server-side solver. **Everything committed to a public GitHub repository becomes publicly accessible**, including any range files or solution JSON you decide to publish. Do not commit private hands, checkpoints or personal data. Browser-saved solutions use the website's origin and will not automatically migrate from `file://` or another domain. Export/import them as files if needed.

The default flop mode **samples future cards**; it is not an exact full-flop game until all turn and river outcomes are explicitly selected. Turn and river solves still use their configured betting abstractions and exact chance enumeration. Phones may throttle or suspend long-running tabs. Physical-device testing is not included.

## Test locally

Open `index.html` directly, or run the following in the extracted directory if Python is installed:

```bash
python3 -m http.server 8000
```

Then browse to `http://localhost:8000/`. Nothing needs to be installed to run the published GitHub Pages site.

This is a **static deployment bundle**, not the development and regression-test repository. The original v12 source release retains the C compiler inputs, validation gate, and benchmarks.
