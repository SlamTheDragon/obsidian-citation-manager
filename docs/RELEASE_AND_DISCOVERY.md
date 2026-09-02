# Obsidian Plugin Release & Discovery Guide

This guide gives the steps to publish releases and submit **Citation Manager** to the official Obsidian Community Plugins directory.

---

## 1. Plugin Discovery Architecture

The Obsidian plugin discovery and update system uses three synchronized root files:

1. **`manifest.json`**: Contains the plugin ID, name, current version, minimum supported Obsidian version, and device flags.
2. **`versions.json`**: Maps each published plugin version to its required `minAppVersion`. Obsidian uses this file to make sure users receive compatible updates:
   ```json
   {
     "1.0.0": "0.15.0"
   }
   ```
3. **`package.json`**: Keeps npm package version metadata in sync with `manifest.json`.

---

## 2. Automated Version Bumping & Release

### Step 1: Bump Version
Run one of these commands to increment the version across `package.json`, `manifest.json`, and `versions.json`:

```bash
# For bugfixes (1.0.0 -> 1.0.1)
bun run version:patch

# For new features (1.0.0 -> 1.1.0)
bun run version:minor

# For major changes (1.0.0 -> 2.0.0)
bun run version:major
```

### Step 2: Commit & Push Git Tag
```bash
git add .
git commit -m "chore(release): bump version to 1.0.0"
git tag 1.0.0
git push origin main --tags
```

### Step 3: GitHub Actions Release
When you push the tag, GitHub Actions runs automatically:
1. Builds the production bundle and runs all 26 test suites.
2. Packages `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, and `citation-manager.zip`.
3. Creates a GitHub Release and attaches the release assets.

---

## 3. Submitting to Obsidian Community Plugins Directory

To add Citation Manager to the Obsidian Community Plugins directory:

### Step 1: Fork and Clone `obsidianmd/obsidian-releases`
1. Open [github.com/obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases).
2. Click **Fork**.
3. Clone your fork to your computer.

### Step 2: Add Entry to `community-plugins.json`
Add this entry in alphabetical order by `id`:

```json
  {
    "id": "citation-manager",
    "name": "Citation Manager",
    "author": "SlamTheDragon",
    "description": "Project-centric, local-first academic reference manager, live citation indexer, linter, and bibliography studio with .references folder integration.",
    "repo": "SlamTheDragon/obsidian-citation-manager"
  }
```

### Step 3: Open Pull Request
1. Commit the change:
   ```bash
   git commit -am "Add Citation Manager plugin"
   git push origin main
   ```
2. Open a Pull Request on [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases).
3. The Obsidian team will review your plugin. When they merge the request, your plugin appears in the Obsidian app directory.
