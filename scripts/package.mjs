import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const distDir = path.resolve('dist');

console.log('[Package] Starting production build...');
execSync('node esbuild.config.mjs production', { stdio: 'inherit' });

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const filesToPackage = [
  { src: 'main.js', dest: 'main.js' },
  { src: 'public/manifest.json', dest: 'manifest.json' },
  { src: 'public/styles.css', dest: 'styles.css' }
];

for (const item of filesToPackage) {
  if (fs.existsSync(item.src)) {
    fs.copyFileSync(item.src, path.join(distDir, item.dest));
    console.log(`[Package] Copied ${item.src} -> dist/${item.dest}`);
  } else {
    console.error(`[Package] Error: missing required release file ${item.src}`);
    process.exit(1);
  }
}

console.log('[Package] Successfully packaged release files in dist/!');
