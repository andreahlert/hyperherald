// @ts-check
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const distPath = resolve(__dirname, '../../dist/_hyperherald.js');
const pkgPath  = resolve(__dirname, '../../package.json');
const pkgVersion = JSON.parse(readFileSync(pkgPath, 'utf8')).version;

test('bundle exists and loads', async ({ page }) => {
    expect(existsSync(distPath), 'run `npm run build` first').toBe(true);

    const script = readFileSync(distPath, 'utf8');

    const logs = [];
    page.on('console', (msg) => logs.push(msg.text()));

    await page.setContent(`<!doctype html><html><body>
        <script>${script}</script>
    </body></html>`);

    // wait for hyperherald:ready event after DOM ready setTimeout
    await page.waitForFunction(() => !!window._hyperherald, { timeout: 5000 });

    const version = await page.evaluate(() => window._hyperherald.version);
    expect(version).toBe(pkgVersion);

    // give the ready handler a tick
    await page.waitForTimeout(50);
    expect(logs.some(l => l.includes(`_hyperherald ${pkgVersion}`))).toBe(true);
});
