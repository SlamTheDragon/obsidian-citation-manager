import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const distDir = path.resolve('dist');

console.log('[Package] Starting production build...');
execSync('node esbuild.config.mjs production', { stdio: 'inherit' });

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const filesToCopy = ['main.js', 'manifest.json', 'styles.css'];
for (const file of filesToCopy) {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join(distDir, file));
    console.log(`[Package] Copied ${file} -> dist/${file}`);
  } else {
    console.error(`[Package] Error: missing required release file ${file}`);
    process.exit(1);
  }
}

console.log('[Package] Successfully packaged release files in dist/!');
