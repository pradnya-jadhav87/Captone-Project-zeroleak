import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import initSqlJs from 'sql.js';
import { TableToModelMap } from '../server/models/index.ts';

const DB_FILE_PATH = path.join(process.cwd(), 'zeroleak_data.sqlite');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/zeroleak';

async function runMigration() {
  console.log('=====================================================');
  console.log('   ZeroLeak SQLite -> MongoDB Migration Engine       ');
  console.log('=====================================================');
  console.log(`Source SQLite Database: ${DB_FILE_PATH}`);
  console.log(`Target MongoDB Database: ${MONGODB_URI}`);

  if (!fs.existsSync(DB_FILE_PATH)) {
    console.error(`ERROR: Source SQLite database file not found at ${DB_FILE_PATH}`);
    process.exit(1);
  }

  // 1. Connect to MongoDB
  console.log('\n[1/4] Connecting to MongoDB...');
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`✓ Connected to MongoDB database "${mongoose.connection.name}" at ${MONGODB_URI}`);
  } catch (err: any) {
    console.error('✗ Failed to connect to MongoDB:', err.message);
    console.error('Ensure MongoDB Community Server is running on port 27017 and try again.');
    process.exit(1);
  }

  // 2. Load SQLite database into memory
  console.log('\n[2/4] Reading SQLite database...');
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(DB_FILE_PATH);
  const db = new SQL.Database(fileBuffer);
  console.log(`✓ Loaded SQLite database (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

  // 3. Inspect tables in SQLite
  console.log('\n[3/4] Enumerating tables...');
  const tableQuery = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;");
  const tables: string[] = tableQuery[0] ? tableQuery[0].values.map((v) => String(v[0])) : [];
  console.log(`✓ Found ${tables.length} tables in SQLite database.`);

  // 4. Migrate tables to MongoDB
  console.log('\n[4/4] Migrating tables to MongoDB collections (idempotent upsert)...');
  const summary: Array<{ table: string; collection: string; count: number; status: string }> = [];
  let totalRecords = 0;

  for (const tableName of tables) {
    const model = TableToModelMap[tableName];
    if (!model) {
      console.warn(`⚠ Skipping [${tableName}]: No corresponding Mongoose model mapped.`);
      summary.push({ table: tableName, collection: 'NONE', count: 0, status: 'SKIPPED' });
      continue;
    }

    try {
      const selectRes = db.exec(`SELECT * FROM "${tableName}";`);
      if (!selectRes[0] || selectRes[0].values.length === 0) {
        summary.push({ table: tableName, collection: model.collection.name, count: 0, status: 'EMPTY' });
        continue;
      }

      const columns = selectRes[0].columns;
      const rows = selectRes[0].values.map((valArray) => {
        const row: Record<string, any> = {};
        for (let i = 0; i < columns.length; i++) {
          row[columns[i]] = valArray[i];
        }
        return row;
      });

      if (tableName === 'trusted_devices') {
        try {
          await model.collection.dropIndex('device_uuid_1');
        } catch {}
      }

      // Prepare bulk upsert operations
      const bulkOps = rows.map((row) => {
        const primaryId = row.id || row._id || row.setting_key || row.public_id || row.copy_id;
        const doc: Record<string, any> = { ...row, _id: primaryId, id: primaryId };
        if (tableName === 'trusted_devices' && (doc.device_uuid === null || doc.device_uuid === undefined)) {
          delete doc.device_uuid;
        }
        return {
          updateOne: {
            filter: { _id: primaryId },
            update: { $set: doc },
            upsert: true,
          },
        };
      });

      // Execute in chunks of 500 to prevent BSON/memory limits
      const CHUNK_SIZE = 500;
      for (let i = 0; i < bulkOps.length; i += CHUNK_SIZE) {
        const chunk = bulkOps.slice(i, i + CHUNK_SIZE);
        await model.bulkWrite(chunk, { ordered: false });
      }

      totalRecords += rows.length;
      console.log(`  ✓ [${tableName}] -> collection [${model.collection.name}]: ${rows.length} documents upserted.`);
      summary.push({ table: tableName, collection: model.collection.name, count: rows.length, status: 'MIGRATED' });
    } catch (tblErr: any) {
      console.error(`  ✗ Error migrating [${tableName}]:`, tblErr.message);
      summary.push({ table: tableName, collection: model.collection.name, count: 0, status: `ERROR: ${tblErr.message}` });
    }
  }

  console.log('\n=====================================================');
  console.log('             Migration Complete Summary              ');
  console.log('=====================================================');
  console.log(`Total Tables Processed: ${tables.length}`);
  console.log(`Total Records Upserted: ${totalRecords}`);
  console.log('Collections status:');
  for (const s of summary.filter((s) => s.count > 0)) {
    console.log(`  - ${s.table.padEnd(32)} -> ${s.collection.padEnd(32)}: ${s.count} rows`);
  }
  console.log('=====================================================');
  console.log('Note: zeroleak_data.sqlite has been preserved safely.');

  await mongoose.disconnect();
  console.log('✓ Disconnected from MongoDB cleanly.\n');
}

runMigration().catch((err) => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
