#!/usr/bin/env node
/**
 * Generate QR assets for https://www.maazym.com/
 * Usage: node scripts/generate-maazym-qr.mjs
 * Requires: npm install qrcode (or npm install qrcode --no-save)
 */
import QRCode from 'qrcode'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const URL = 'https://www.maazym.com/'
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../apps/customer/public/qr')

await mkdir(outDir, { recursive: true })

const common = { errorCorrectionLevel: 'H', margin: 2 }

await QRCode.toFile(path.join(outDir, 'maazym-www.png'), URL, { ...common, width: 1024 })
await QRCode.toFile(path.join(outDir, 'maazym-www-print.png'), URL, { ...common, margin: 4, width: 2048 })
await QRCode.toFile(path.join(outDir, 'maazym-www.svg'), URL, { type: 'svg', ...common })

console.log('QR codes written to apps/customer/public/qr/')
console.log('  maazym-www.png       (1024px, web/social)')
console.log('  maazym-www-print.png (2048px, posters/menus)')
console.log('  maazym-www.svg       (vector, print shops)')
