import { connectOneShot } from './db'
import { importLegacy } from './legacy'
const [snapshot] = process.argv.slice(2)
if (!snapshot)
  throw new Error('Usage: bun server/import-legacy.ts snapshot.json')
const { db, client } = connectOneShot()
try {
  console.log(
    'Imported row counts:',
    await importLegacy(db, await Bun.file(snapshot).json())
  )
} finally {
  await client.end()
}
