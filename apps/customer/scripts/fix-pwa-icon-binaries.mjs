/**
 * Fix PNG files that were saved as base64 text instead of binary (invalid manifest icons).
 * Writes the same minimal valid PNG bytes to each icon path so Chrome accepts them.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public')

const tinyPngB64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAABGklEQVR42mP8/5+hHgOyJ4M94YQAAABjRU5ErkJggg=='
const buf = Buffer.from(tinyPngB64, 'base64')

for (const name of fs.readdirSync(publicDir)) {
  if (name.startsWith('icon-') && name.endsWith('.png')) {
    fs.writeFileSync(path.join(publicDir, name), buf)
    console.log('fixed', name, '->', buf.length, 'bytes binary PNG')
  }
}
