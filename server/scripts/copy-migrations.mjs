// Copies SQL migrations next to the bundled server (dist/migrations) so `npm start` can apply them.
import fs from 'node:fs';
import path from 'node:path';

const from = path.resolve('src/db/migrations');
const to = path.resolve('dist/migrations');
fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to, { recursive: true });
for (const file of fs.readdirSync(from).filter((f) => f.endsWith('.sql'))) {
  fs.copyFileSync(path.join(from, file), path.join(to, file));
}
console.log(`copied migrations to ${to}`);
