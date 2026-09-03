import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../src/prisma/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const xlDir = path.resolve(__dirname, '../financeon-xl');

console.log('Target Excel Directory:', xlDir);
console.log('Files:', fs.readdirSync(xlDir));
