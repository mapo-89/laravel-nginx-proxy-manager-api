export * from '../../.release/release.mjs'
import { isMain, main } from '../../.release/release.mjs'
if (isMain(import.meta.url)) {
    try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
