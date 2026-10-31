import { connectOneShot } from './db';
import { importLegacy } from './legacy';
const [snapshot, identities] = process.argv.slice(2);
if (!snapshot || !identities) throw new Error('Usage: bun server/import-legacy.ts snapshot.json identity-map.json');
const { db, client } = connectOneShot();
try {
  console.log('Imported row counts:', await importLegacy(db, await Bun.file(snapshot).json(), await Bun.file(identities).json()));
} finally { await client.end(); }
