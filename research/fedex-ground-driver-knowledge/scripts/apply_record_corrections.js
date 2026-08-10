#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RECORDS_PATH = path.join(ROOT, 'knowledge/records.jsonl');
const CORRECTIONS_PATH = path.join(ROOT, 'validation/source_alignment_corrections.json');
const CHANGE_LOG_PATH = path.join(ROOT, 'knowledge/change_log.jsonl');

function checksum(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function main() {
  const records = readJsonLines(RECORDS_PATH);
  const corrections = JSON.parse(fs.readFileSync(CORRECTIONS_PATH, 'utf8'));
  const changeLog = readJsonLines(CHANGE_LOG_PATH);
  const loggedIds = new Set(changeLog.map((item) => item.change_id));
  const recordIndex = new Map(records.map((record, index) => [record.knowledge_id, index]));

  for (const correction of corrections) {
    if (loggedIds.has(correction.change_id)) continue;
    const index = recordIndex.get(correction.knowledge_id);
    if (index === undefined) throw new Error(`${correction.change_id}: unknown knowledge_id`);
    const previousRecord = records[index];
    const previousChecksum = checksum(previousRecord);
    if (previousChecksum !== correction.expected_previous_checksum) {
      throw new Error(`${correction.change_id}: expected ${correction.expected_previous_checksum}, found ${previousChecksum}`);
    }
    const nextRecord = {
      ...previousRecord,
      ...correction.set_fields,
      updated_at: correction.reviewed_at
    };
    const nextChecksum = checksum(nextRecord);
    records[index] = nextRecord;
    changeLog.push({
      change_id: correction.change_id,
      knowledge_id: correction.knowledge_id,
      change_type: 'SOURCE_ALIGNMENT_CORRECTION',
      reason: correction.reason,
      supporting_source_ids: correction.supporting_source_ids,
      changed_fields: Object.keys(correction.set_fields),
      reviewed_at: correction.reviewed_at,
      previous_checksum: previousChecksum,
      new_checksum: nextChecksum,
      previous_record: previousRecord,
      new_record: nextRecord
    });
    loggedIds.add(correction.change_id);
  }

  const recordsTemporary = `${RECORDS_PATH}.tmp`;
  fs.writeFileSync(recordsTemporary, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
  fs.renameSync(recordsTemporary, RECORDS_PATH);
  const logTemporary = `${CHANGE_LOG_PATH}.tmp`;
  fs.writeFileSync(logTemporary, `${changeLog.map((item) => JSON.stringify(item)).join('\n')}\n`);
  fs.renameSync(logTemporary, CHANGE_LOG_PATH);
  process.stdout.write(`applied ${corrections.filter((item) => loggedIds.has(item.change_id)).length} source-alignment corrections; ${changeLog.length} change-log entries\n`);
}

main();
