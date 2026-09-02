# Contributing to Obsidian Citation Manager

Thank you for contributing to Obsidian Citation Manager! Obey these guidelines to make sure code quality remains high.

---

## 1. Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Bun](https://bun.sh/) (v1.1+)

### Installation
```bash
# Clone the repository
git clone https://github.com/SlamTheDragon/obsidian-citation-manager.git
cd obsidian-citation-manager

# Install dependencies
bun install
```

---

## 2. Building and Testing

```bash
# Run all 26 test suites
bun run test:all

# Build production bundle
bun run build

# Development watch mode
bun run dev
```

To test directly with a local Obsidian vault, set the `OBSIDIAN_VAULT_DIR` environment variable:
```bash
# Linux/macOS
export OBSIDIAN_VAULT_DIR="/path/to/vault/.obsidian/plugins/citation-manager"
bun run build

# Windows PowerShell
$env:OBSIDIAN_VAULT_DIR="C:\\path\\to\\vault\\.obsidian\\plugins\\citation-manager"
bun run build
```

---

## 3. Code Standards

1. **Zero Unicode Emojis**: Do not add Unicode emojis into UI buttons, status messages, notices, or logs. Use Lucide SVG icons (`setIcon(el, 'icon-name')`).
2. **CSL Compliance**: Add unit tests in `tests/` for any formatting change to APA 7, IEEE, Harvard, Chicago, or Vancouver.
3. **Markdown Storage**: Do not store citation metadata in binary files or external formats.
4. **Pull Requests**: Make sure all 26 test suites pass (`bun run test:all`) before you submit pull requests.
