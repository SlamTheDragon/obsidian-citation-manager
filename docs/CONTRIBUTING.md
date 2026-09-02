# Contributing to Obsidian Citation Manager

Thank you for contributing to Obsidian Citation Manager! Follow these guidelines to ensure code quality and seamless releases.

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

## 2. Building & Testing

```bash
# Run all 26 comprehensive test suites
bun run test:all

# Build production bundle
bun run build

# Development watch mode
bun run dev
```

To test directly against an active Obsidian vault, set the `OBSIDIAN_VAULT_DIR` environment variable:
```bash
# Linux/macOS
export OBSIDIAN_VAULT_DIR="/path/to/vault/.obsidian/plugins/citation-manager"
bun run build

# Windows PowerShell
$env:OBSIDIAN_VAULT_DIR="C:\\path\\to\\vault\\.obsidian\\plugins\\citation-manager"
bun run build
```

---

## 3. Invariants & Code Standards

1. **Zero Unicode Emojis Policy**: Do NOT introduce Unicode emojis into UI buttons, status messages, notices, or logs. Use Lucide SVG icons exclusively (`setIcon(el, 'icon-name')`).
2. **Strict CSL Compliance**: Any formatting change to APA 7, IEEE, Harvard, Chicago, or Vancouver must be backed by unit tests in `tests/`.
3. **Markdown-Native Storage**: Do not store critical literature metadata in binary blobs or external proprietary formats.
4. **Clean PR Submissions**: Ensure all 26 test suites pass (`bun run test:all`) with zero regression errors before submitting pull requests.
