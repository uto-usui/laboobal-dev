import { defineConfig, devices } from '@playwright/test'

// 複数の担当が同時に回すときは E2E_PORT で分ける
const port = Number(process.env.E2E_PORT ?? 4322)

export default defineConfig({
  testDir: 'e2e',
  // 担当ごとに --output で分ける（Playwright は実行の始めに出力先を消すため。docs/plan.md の 5 章）
  outputDir: 'test-results/all',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    // Astro 7.4 はエージェントの環境を検知すると preview を裏に回して終了する。--ignore-lock なら前面のまま動く
    command: `pnpm preview --port ${port} --ignore-lock`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
  },
})
