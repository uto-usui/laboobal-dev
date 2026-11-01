import { getDemos } from '../lib/demos'

// E2E が全デモを開くための一覧。Playwright は Vite を通らないので、ビルドの結果から読む
export const GET = async () => Response.json(await getDemos())
