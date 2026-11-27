// After the installer is signed, its bytes are no longer the ones electron-builder
// hashed: latest.yml and the blockmap would describe the unsigned file, and installed
// copies would reject the update ("sha512 checksum mismatch"). This rebuilds the
// blockmap from the signed installer, the same way electron-builder does, and puts
// the new checksum and size into latest.yml.
//
//   node scripts/signed-update-info.mjs release/Orfeo-Setup-1.5.0.exe
//
// latest.yml is looked for next to the installer.
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const installer = process.argv[2]
if (!installer) {
  console.error('usage: node scripts/signed-update-info.mjs <signed installer .exe>')
  process.exit(1)
}

const require = createRequire(import.meta.url)
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap')

const latestPath = join(dirname(installer), 'latest.yml')
let latest = readFileSync(latestPath, 'utf8')
const name = basename(installer)
if (!latest.includes(`url: ${name}`)) {
  console.error(`${latestPath} doesn't list ${name}:\n${latest}`)
  process.exit(1)
}

const oldSha = latest.match(/^sha512: (\S+)$/m)?.[1]
const oldSize = latest.match(/^ {4}size: (\d+)$/m)?.[1]
if (!oldSha || !oldSize) {
  console.error(`Unexpected latest.yml layout (no sha512 or size):\n${latest}`)
  process.exit(1)
}

// Same call as electron-builder's createBlockmap (no stored-asar regions: Orfeo doesn't use them)
const { sha512, size } = await buildBlockMap(installer, 'gzip', `${installer}.blockmap`)

latest = latest.split(oldSha).join(sha512).replace(/^( {4}size: )\d+$/m, `$1${size}`)
writeFileSync(latestPath, latest)
console.log(`${name}: sha512 ${oldSha.slice(0, 12)}… → ${sha512.slice(0, 12)}…, size ${oldSize} → ${size}`)
console.log(latest)
