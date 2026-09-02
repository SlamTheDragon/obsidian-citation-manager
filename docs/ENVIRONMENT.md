# Development & Runtime Environment

This project is built and verified with modern JavaScript/TypeScript tooling using **Bun** and **Node.js LTS (v26.7.0 / v22.x)**.

---

## Tooling & Runtime Matrix

| Runtime / Tool | Version | Purpose |
| :--- | :--- | :--- |
| **Node.js** | `v26.7.0` (or `v22.x` LTS) | JavaScript runtime & ecosystem support |
| **NVM** | `1.2.x+` (Windows) / `0.40.x+` | Node Version Manager (`.nvmrc` targets `26.7.0`) |
| **Bun** | `1.3.x+` | Primary high-performance test runner, bundler & script executor |
| **Dart Sass (`sass`)**| `1.103.x+` | Modular SCSS compiler (`src/styles/main.scss` $\to$ `public/styles.css`) |
| **esbuild** | `0.24.x+` | Production TypeScript bundling & tree-shaking |

---

## Environment Setup with NVM

If using NVM:

```bash
# Switch to the configured Node version
nvm use 26.7.0

# Verify active version
node -v
```

---

## Unified Development & Build Pipeline

All workflows are orchestrated via **Bun**:

```bash
# Install dependencies
bun install

# Run all 27 automated test suites (750+ assertions)
bun run test:all

# Compile modular Sass stylesheets
bun run build:css

# Build for development / production & sync to test vault
bun run build

# Package distribution files (dist/main.js, dist/manifest.json, dist/styles.css)
bun run package
```

---

## Architecture Conventions

1. **State Truth**: Plugin settings are managed via standard Obsidian `data.json` lifecycle methods (`loadData()` / `saveData()`). Literature reference notes are preserved locally as markdown in `.references/<citekey>.md` and attachments in `.references/attachments/<citekey>.pdf`.
2. **Modular Sass Architecture**: Styles are co-located as `.module.scss` alongside their respective view components in `src/views/` and compiled into `public/styles.css`.
3. **Surfing Integration**: Opening citation PDFs checks for the Surfing plugin to open inside a Surfing view leaf with graceful fallback to Obsidian's default tab leaf PDF viewer.
