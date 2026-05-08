// @ts-check
import { defineConfig, devices } from '@playwright/test';

const PORT = 3101;

export default defineConfig({
    testDir: '.',
    testMatch: ['**/*.spec.js'],
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: process.env.CI ? 'line' : 'list',
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: 'on-first-retry',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
    ],
    webServer: {
        command: `node manual/server.js`,
        url: `http://localhost:${PORT}/auction.html`,
        env: { PORT: String(PORT) },
        reuseExistingServer: !process.env.CI,
        timeout: 10_000,
        stdout: 'ignore',
        stderr: 'pipe',
    },
});
