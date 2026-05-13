// @ts-check
// Integration: SSE transport + envelope + swap dispatcher against ref server.
import { test, expect } from '@playwright/test';

async function publish(request, frame) {
    const res = await request.post('/publish', { data: frame });
    expect(res.ok()).toBeTruthy();
    return res.text();
}

test.beforeEach(async ({ page }) => {
    await page.goto('/test-fixture.html');
    await page.waitForFunction(() => !!window._hyperherald);
    // Give SSE one tick to connect + send subscribe-ack.
    await page.waitForTimeout(200);
});

test('fragment swap (inner)', async ({ page, request }) => {
    await publish(request, {
        channel: 'test:1',
        type: 'fragment',
        target: '#a',
        swap: 'inner',
        html: 'A:updated',
    });
    await expect(page.locator('#a')).toHaveText('A:updated');
});

test('multi swap touches multiple targets', async ({ page, request }) => {
    await publish(request, {
        channel: 'test:1',
        type: 'multi',
        fragments: [
            { target: '#a', swap: 'inner', html: 'A:multi' },
            { target: '#b', swap: 'inner', html: 'B:multi' },
        ],
    });
    await expect(page.locator('#a')).toHaveText('A:multi');
    await expect(page.locator('#b')).toHaveText('B:multi');
});

test('atomic swap applies inside one frame', async ({ page, request }) => {
    await publish(request, {
        channel: 'test:1',
        type: 'atomic',
        fragments: [
            { target: '#a', swap: 'inner', html: 'A:atomic' },
            { target: '#b', swap: 'inner', html: 'B:atomic' },
        ],
    });
    await expect(page.locator('#a')).toHaveText('A:atomic');
    await expect(page.locator('#b')).toHaveText('B:atomic');
});

test('append swap accumulates list items', async ({ page, request }) => {
    for (let i = 1; i <= 3; i++) {
        await publish(request, {
            channel: 'test:2',
            type: 'fragment',
            target: '#list',
            swap: 'append',
            html: `<li>item ${i}</li>`,
        });
    }
    await expect(page.locator('#list li')).toHaveCount(3);
    await expect(page.locator('#list li').last()).toHaveText('item 3');
});

test('replay on reconnect via cursor', async ({ page, request }) => {
    // Publish first message, client receives it.
    await publish(request, {
        channel: 'test:1',
        type: 'fragment',
        target: '#a',
        swap: 'inner',
        html: 'A:before',
    });
    await expect(page.locator('#a')).toHaveText('A:before');

    // Drop the network and publish more events while disconnected.
    await page.context().setOffline(true);
    await page.waitForTimeout(150);
    await publish(request, {
        channel: 'test:1',
        type: 'fragment',
        target: '#a',
        swap: 'inner',
        html: 'A:while-offline',
    });
    await publish(request, {
        channel: 'test:1',
        type: 'fragment',
        target: '#a',
        swap: 'inner',
        html: 'A:after',
    });

    // Reconnect — replay should deliver missed envelopes (Last-Event-ID).
    await page.context().setOffline(false);
    await expect(page.locator('#a')).toHaveText('A:after', { timeout: 5000 });
});
