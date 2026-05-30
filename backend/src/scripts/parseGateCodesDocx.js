const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { parseGateCodeText } = require('../services/gateCodeImport');

function extractDocxText(filePath) {
  const script = `
from zipfile import ZipFile
import sys
import xml.etree.ElementTree as ET
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
with ZipFile(sys.argv[1]) as z:
    xml=z.read('word/document.xml')
root=ET.fromstring(xml)
for p in root.findall('.//w:p', ns):
    text=''.join(node.text or '' for node in p.findall('.//w:t', ns)).strip()
    if text:
        print(text)
`;

  return execFileSync('python3', ['-c', script, filePath], { encoding: 'utf8' });
}

function main() {
  const [, , inputPath, outputPath] = process.argv;

  if (!inputPath) {
    console.error('Usage: node src/scripts/parseGateCodesDocx.js /path/to/gate-codes.docx [output.json]');
    process.exit(1);
  }

  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    console.error(`File not found: ${resolvedInput}`);
    process.exit(1);
  }

  const text = extractDocxText(resolvedInput);
  const candidates = parseGateCodeText(text);
  const payload = {
    source_file: resolvedInput,
    candidate_count: candidates.length,
    candidates
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;

  if (outputPath) {
    fs.writeFileSync(path.resolve(outputPath), json);
  } else {
    process.stdout.write(json);
  }
}

if (require.main === module) {
  main();
}
