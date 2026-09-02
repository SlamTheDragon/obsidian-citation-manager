import fs from 'fs';
import path from 'path';

const tag = process.env.GITHUB_REF_NAME || process.argv[2] || '1.0.1';
const cleanTag = tag.replace(/^v/, '');
const changelogPath = path.resolve('CHANGELOG.md');

if (!fs.existsSync(changelogPath)) {
  console.error('CHANGELOG.md not found');
  process.exit(1);
}

const text = fs.readFileSync(changelogPath, 'utf8');
const regex = new RegExp(`## \\[${cleanTag.replace(/\./g, '\\.')}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
const match = text.match(regex);

const distDir = path.resolve('dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const notes = match ? match[1].trim() : `Obsidian Citation Manager release v${cleanTag}`;
const output = `## Obsidian Citation Manager v${cleanTag}\n\n${notes}\n`;

const outputPath = path.join(distDir, 'RELEASE_NOTES.md');
fs.writeFileSync(outputPath, output, 'utf8');
console.log(`[Release Notes] Successfully extracted notes for v${cleanTag} to ${outputPath}`);
