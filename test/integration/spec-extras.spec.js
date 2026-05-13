// @ts-check
// Integration: hh-partial (suspense) + hh-close (gone) semantics.
import { test, expect } from '@playwright/test';

async function publish(request, frame) {
    const res = await request.post('/publish', { data: frame });
    expect(res.ok()).toBeTruthy();
    return res.text();
}

test.beforeEach(async ({ page }) => {
    await page.goto('/test-fixture-extras.html');
    await page.waitForFunction(() => !!window._hyperherald);
    await page.waitForTimeout(200);
});

test('suspense: chunks accumulate and final fires done event', async ({ page, request }) => {
    await page.evaluate(() => {
        window.__suspenseDone = null;
        document.addEventListener('hyperherald:suspense:done', (e) => {
            window.__suspenseDone = e.detail;
        });
    });

    await publish(request, {
        channel: 'extras:1',
        type: 'partial',
        target: '#a',
        suspense_id: 's-acc',
        chunk: 'Hello, ',
    });
    await publish(request, {
        channel: 'extras:1',
        type: 'partial',
        target: '#a',
        suspense_id: 's-acc',
        chunk: 'world',
    });
    await publish(request, {
        channel: 'extras:1',
        type: 'partial',
        target: '#a',
        suspense_id: 's-acc',
        chunk: '!',
        final: true,
    });

    await expect(page.locator('#a')).toContainText('Hello, world!');
    const detail = await page.evaluate(() => window.__suspenseDone);
    expect(detail).toBeTruthy();
    expect(detail.suspense_id).toBe('s-acc');
});

test('suspense: sealed slot ignores further chunks', async ({ page, request }) => {
    await publish(request, {
        channel: 'extras:1',
        type: 'partial',
        target: '#b',
        suspense_id: 's-seal',
        chunk: 'KEEP',
        final: true,
    });
    await expect(page.locator('#b')).toContainText('KEEP');

    await publish(request, {
        channel: 'extras:1',
        type: 'partial',
        target: '#b',
        suspense_id: 's-seal',
        chunk: 'IGNORED',
    });
    await page.waitForTimeout(150);
    await expect(page.locator('#b')).not.toContainText('IGNORED');
});

test('gone: hh-close code 4001 dispatches hyperherald:gone', async ({ page, request }) => {
    await page.evaluate(() => {
        window.__gone = null;
        document.addEventListener('hyperherald:gone', (e) => {
            window.__gone = e.detail;
        });
    });

    await publish(request, {
        channel: 'extras:1',
        type: 'close',
        code: 4001,
        reason: 'cursor expired',
    });

    await page.waitForFunction(() => window.__gone !== null, null, { timeout: 3000 });
    const detail = await page.evaluate(() => window.__gone);
    expect(detail.code).toBe(4001);
    expect(detail.reason).toBe('cursor expired');
    expect(detail.channel).toBe('extras:1');
});
