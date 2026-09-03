import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const xlDir = path.resolve(rootDir, 'financeon-xl');
const webhookUrl = process.env.WEBHOOK_URL || 'http://localhost:3000/api/webhook';

console.log('========================================================');
console.log('  Finance-On Excel Importer (using XLSX Engine)');
console.log('========================================================');
console.log('Excel Directory:', xlDir);
console.log('Webhook URL:    ', webhookUrl);
console.log('');

function readXlsxToCsv(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('No sheet found in workbook');
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet ${sheetName} not found`);
  }
  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ',', RS: '\n' });
  return csv;
}

async function postToWebhook(type: string, csvData: string) {
  const lines = csvData.trim().split('\n').filter(l => l.trim().length > 0);
  const rowCount = Math.max(0, lines.length - 1);
  console.log(`📤 Posting ${type} (${rowCount} data rows) to ${webhookUrl}...`);

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'csv',
      type,
      data: csvData,
    }),
  });

  const json: any = await res.json();
  if (res.ok) {
    console.log(`✅ [${type}] SUCCESS:`, json.message);
    if (json.summary) {
      console.log(`   Total: ${json.summary.totalReceived} | Saved: ${json.summary.savedCount} | Failed: ${json.summary.failedCount}`);
      if (json.summary.errors?.length) {
        console.log('   Errors:', json.summary.errors);
      }
    }
  } else {
    console.error(`❌ [${type}] FAILED:`, json);
  }
}

async function run() {
  const files = [
    { file: 'Clientes.xlsx', type: 'clientes' },
    { file: 'Facturas.xlsx', type: 'facturas' },
    { file: 'Proveedores.xlsx', type: 'proveedores' },
    { file: 'Tarifas de artículos.xlsx', type: 'articulos' },
  ];

  for (const { file, type } of files) {
    const fullPath = path.join(xlDir, file);
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️ File not found: ${file}`);
      continue;
    }

    try {
      console.log(`\nReading ${file}...`);
      const csv = readXlsxToCsv(fullPath);
      await postToWebhook(type, csv);
    } catch (err: any) {
      console.error(`❌ Error processing ${file}:`, err.message);
    }
  }

  console.log('\n🎉 Finished importing all Excel files!');
}

run();
