// @ts-check
// Integration: client QoS (coalesce + buffer) keyed by target.
import { test, expect } from '@playwright/test';

async function publish(request, frame) {
    const res = await request.post('/publish', { data: frame });
    expect(res.ok()).toBeTruthy();
    return res.text();
}

test.beforeEach(async ({ page }) => {
    await page.goto('/test-fixture-qos.html');
    await page.waitForFunction(() => !!window._hyperstream);
    await page.waitForTimeout(200);
});

test('coalesce window:last collapses bursts on same target', async ({ page, request }) => {
    for (let i = 1; i <= 5; i++) {
        await publish(request, {
            channel: 'qos:coalesce',
            type: 'fragment',
            target: '#c',
            swap: 'inner',
            html: `C:${i}`,
        });
    }
    // During the coalesce window the DOM should still show initial.
    await expect(page.locator('#c')).toHaveText('C:initial');
    // After the window flushes, only the last frame applies.
    await expect(page.locator('#c')).toHaveText('C:5', { timeout: 1000 });
});

test('coalesce keys by target so distinct targets pass independently', async ({ page, request }) => {
    await publish(request, {
        channel: 'qos:coalesce',
        type: 'fragment',
        target: '#c',
        swap: 'inner',
        html: 'C:once',
    });
    await publish(request, {
        channel: 'qos:coalesce',
        type: 'fragment',
        target: '#cl',
        swap: 'append',
        html: '<li>one</li>',
    });
    await expect(page.locator('#c')).toHaveText('C:once', { timeout: 1000 });
    await expect(page.locator('#cl li')).toHaveCount(1);
});

test('buffer caps queue and drops oldest', async ({ page, request }) => {
    // Pause rAF so the buffer queue can fill before flushing.
    await page.evaluate(() => {
        window.__rafQueue = [];
        window.__origRAF = window.requestAnimationFrame;
        window.requestAnimationFrame = (cb) => {
            window.__rafQueue.push(cb);
            return 0;
        };
    });

    for (let i = 1; i <= 6; i++) {
        await publish(request, {
            channel: 'qos:buffer',
            type: 'fragment',
            target: '#bl',
            swap: 'append',
            html: `<li>b${i}</li>`,
        });
    }
    // Let all SSE messages land in the page.
    await page.waitForTimeout(150);

    // Flush rAF and restore.
    await page.evaluate(() => {
        const q = window.__rafQueue.splice(0);
        window.requestAnimationFrame = window.__origRAF;
        for (const cb of q) cb(performance.now());
    });

    const texts = await page.locator('#bl li').allTextContents();
    expect(texts).toEqual(['b4', 'b5', 'b6']);
});
