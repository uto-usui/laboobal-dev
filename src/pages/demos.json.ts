import { getDemos } from '../lib/demos'

// 全デモの一覧。webmanab の pnpm check:demos が読むので、項目は足すだけにし、名前を変えたり消したりしない
export const GET = async () => Response.json(await getDemos())
