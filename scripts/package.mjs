import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const distDir = path.resolve('dist');

console.log('[Package] Starting production build with Bun...');
execSync('bun esbuild.config.mjs production', { stdio: 'inherit' });

const requiredFiles = ['main.js', 'manifest.json', 'styles.css'];

for (const file of requiredFiles) {
  const filePath = path.join(distDir, file);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
    console.log(`[Package] Verified dist/${file} (${fs.statSync(filePath).size} bytes)`);
  } else {
    console.error(`[Package] Error: missing or empty required release file dist/${file}`);
    process.exit(1);
  }
}

console.log('[Package] Successfully built and verified all release files in dist/!');
