import { defineConfig, devices } from '@playwright/test'

// E2E_BASE_URL があればそこを開く（担当は統合役の dev サーバー http://localhost:4321 に向ける）。
// なければ dist/ を preview で配って開く（CI と統合役の全体の確認）
const port = Number(process.env.E2E_PORT ?? 4322)
const external = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: 'e2e',
  // 担当ごとに --output で分ける（Playwright は実行の始めに出力先を消すため。docs/demo-guide.md の 10 章）
  outputDir: 'test-results/all',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: external ?? `http://localhost:${port}`,
    viewport: { width: 1280, height: 800 },
  },
  webServer: external
    ? undefined
    : {
        // Astro 7.4 はエージェントの環境を検知すると preview を裏に回して終了する。--ignore-lock なら前面のまま動く
        command: `pnpm preview --port ${port} --ignore-lock`,
        url: `http://localhost:${port}/`,
        reuseExistingServer: !process.env.CI,
      },
})
