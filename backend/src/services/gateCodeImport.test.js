const assert = require('node:assert/strict');
const test = require('node:test');

const { parseGateCodeText, splitGateCodeLine } = require('./gateCodeImport');

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
