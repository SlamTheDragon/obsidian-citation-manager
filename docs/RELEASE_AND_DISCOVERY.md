# Obsidian Plugin Release & Discovery Guide

This guide details the complete protocol for publishing releases and submitting **Citation Manager** to the official Obsidian Community Plugins directory.

---

## 1. Plugin Discovery Architecture

Obsidian's plugin discovery and update system relies on three synchronized root files:

1. **`manifest.json`**: Describes the plugin ID, name, current version, minimum supported Obsidian version, and desktop/mobile flags.
2. **`versions.json`**: Maps each published plugin version to its required `minAppVersion`. Obsidian uses this file to ensure users only receive updates compatible with their installed Obsidian build:
   \`\`\`json
   {
     "1.0.0": "0.15.0"
   }
   \`\`\`
3. **`package.json`**: Keeps npm build metadata in sync with `manifest.json`.

---

## 2. Automated Version Bumping & Release

### Step 1: Bump Version
Run one of the following commands to bump semantic versions and automatically synchronize `package.json`, `manifest.json`, and `versions.json`:

\`\`\`bash
# For bugfixes & minor UI tweaks (1.0.0 -> 1.0.1)
bun run version:patch

# For new features & standards (1.0.0 -> 1.1.0)
bun run version:minor

# For major structural changes (1.0.0 -> 2.0.0)
bun run version:major
\`\`\`

### Step 2: Commit & Push Git Tag
\`\`\`bash
git add .
git commit -m "chore(release): bump version to 1.0.0"
git tag 1.0.0
git push origin main --tags
\`\`\`

### Step 3: Automated GitHub Actions Release
Once the tag is pushed:
1. GitHub Actions (`.github/workflows/release.yml`) automatically triggers.
2. It builds the production bundle and runs all 26 test suites.
3. It packages `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, and `citation-manager.zip`.
4. It creates a GitHub Release with all assets attached.

---

## 3. Submitting to Obsidian Community Plugins Directory

To list Citation Manager in Obsidian's in-app Community Plugins directory:

### Step 1: Fork & Clone `obsidianmd/obsidian-releases`
1. Visit [github.com/obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases).
2. Click **Fork**.
3. Clone your fork locally.

### Step 2: Add Entry to `community-plugins.json`
Add the following entry in alphabetical order by `id`:

\`\`\`json
  {
    "id": "citation-manager",
    "name": "Citation Manager",
    "author": "SlamTheDragon",
    "description": "Project-centric, local-first academic reference manager, live citation indexer, linter, and bibliography studio with .references folder integration.",
    "repo": "SlamTheDragon/obsidian-citation-manager"
  }
\`\`\`

### Step 3: Open Pull Request
1. Commit the change:
   \`\`\`bash
   git commit -am "Add Citation Manager plugin"
   git push origin main
   \`\`\`
2. Open a Pull Request on [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases).
3. The Obsidian team will review the plugin against their developer policies (local-first data, zero-tracking, non-destructive file handling). Once approved and merged, your plugin appears in the Obsidian app for all users!
