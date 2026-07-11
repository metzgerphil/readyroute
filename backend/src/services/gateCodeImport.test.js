const assert = require('node:assert/strict');
const test = require('node:test');

const { parseGateCodeText, splitGateCodeLine } = require('./gateCodeImport');
const { parseAccessCodeImportRows } = require('./resourceImport');

test('splitGateCodeLine parses explicit and compact access code lines', () => {
  assert.deepEqual(splitGateCodeLine('702-706 N Fig#7526'), {
    address_hint: '702-706 N Fig',
    access_code: '#7526',
    access_note: null,
    confidence: 'high'
  });

  assert.deepEqual(splitGateCodeLine('Zlatibor Ranch1420'), {
    address_hint: 'Zlatibor Ranch',
    access_code: '1420',
    access_note: null,
    confidence: 'medium'
  });

  assert.deepEqual(splitGateCodeLine('19090 via ambiente- 1st gate:29137'), {
    address_hint: '19090 via ambiente',
    access_code: '29137',
    access_note: null,
    confidence: 'medium'
  });
});

test('parseGateCodeText carries work area context onto candidates', () => {
  const candidates = parseGateCodeText(`
GATE CODE
WA 829/ 835/823
Royal Crest Court#7295 (right side call box)
WA 817
508 E Mission             *0817
`);

  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates[0].work_area_codes, ['829', '835', '823']);
  assert.equal(candidates[0].address_hint, 'Royal Crest Court');
  assert.equal(candidates[0].access_code, '#7295');
  assert.equal(candidates[0].access_note, '(right side call box)');
  assert.deepEqual(candidates[1].work_area_codes, ['817']);
});

test('parseAccessCodeImportRows reads ReadyRoute CSV template columns', () => {
  const csv = [
    'Address,Access Code,Entry Note,Driver Note,Property Name,Building,Property Type,Parking Note,Shared Note',
    '"250 W 15th Ave, Escondido, CA",#1357,"Use left call box",Helpful driver note,Fifteenth Apartments,Building A,apartment,Visitor parking,Shared detail'
  ].join('\n');

  const rows = parseAccessCodeImportRows({
    originalname: 'readyroute-access-code-template.csv',
    buffer: Buffer.from(csv)
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].row_number, 2);
  assert.equal(rows[0].display_address, '250 W 15th Ave, Escondido, CA');
  assert.equal(rows[0].access_code, '#1357');
  assert.equal(rows[0].entry_note, 'Use left call box');
  assert.equal(rows[0].access_note, 'Helpful driver note');
  assert.equal(rows[0].property_name, 'Fifteenth Apartments');
  assert.equal(rows[0].building, 'Building A');
});
