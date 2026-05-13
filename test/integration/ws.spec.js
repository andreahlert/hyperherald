// @ts-check
// Integration: WebSocket transport + envelope + swap dispatcher against ref server.
import { test, expect } from '@playwright/test';

async function publish(request, frame) {
    const res = await request.post('/publish', { data: frame });
    expect(res.ok()).toBeTruthy();
    return res.text();
}

test.beforeEach(async ({ page }) => {
    await page.goto('/test-fixture-ws.html');
    await page.waitForFunction(() => !!window._hyperstream);
    // Wait for WS open + subscribe handshake.
    await page.waitForTimeout(250);
});

test('WS fragment swap (inner)', async ({ page, request }) => {
    await publish(request, {
        channel: 'ws-test:1',
        type: 'fragment',
        target: '#a',
        swap: 'inner',
        html: 'A:ws',
    });
    await expect(page.locator('#a')).toHaveText('A:ws');
});

test('WS multi swap touches multiple targets', async ({ page, request }) => {
    await publish(request, {
        channel: 'ws-test:1',
        type: 'multi',
        fragments: [
            { target: '#a', swap: 'inner', html: 'A:ws-multi' },
            { target: '#b', swap: 'inner', html: 'B:ws-multi' },
        ],
    });
    await expect(page.locator('#a')).toHaveText('A:ws-multi');
    await expect(page.locator('#b')).toHaveText('B:ws-multi');
});

test('WS append swap accumulates list items', async ({ page, request }) => {
    for (let i = 1; i <= 3; i++) {
        await publish(request, {
            channel: 'ws-test:2',
            type: 'fragment',
            target: '#list',
            swap: 'append',
            html: `<li>item ${i}</li>`,
        });
    }
    await expect(page.locator('#list li')).toHaveCount(3);
    await expect(page.locator('#list li').last()).toHaveText('item 3');
});

test('WS replay on reconnect via cursor', async ({ page, request }) => {
    await publish(request, {
        channel: 'ws-test:1',
        type: 'fragment',
        target: '#a',
        swap: 'inner',
        html: 'A:before-ws',
    });
    await expect(page.locator('#a')).toHaveText('A:before-ws');

    await page.context().setOffline(true);
    await page.waitForTimeout(200);
    await publish(request, {
        channel: 'ws-test:1',
        type: 'fragment',
        target: '#a',
        swap: 'inner',
        html: 'A:while-offline-ws',
    });
    await publish(request, {
        channel: 'ws-test:1',
        type: 'fragment',
        target: '#a',
        swap: 'inner',
        html: 'A:after-ws',
    });

    await page.context().setOffline(false);
    await expect(page.locator('#a')).toHaveText('A:after-ws', { timeout: 5000 });
});
