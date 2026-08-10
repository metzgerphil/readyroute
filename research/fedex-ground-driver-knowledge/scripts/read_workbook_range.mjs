import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [inputPath, sheetName, rangeAddress] = process.argv.slice(2);

if (!inputPath || !sheetName || !rangeAddress) {
  throw new Error(
    "Usage: read_workbook_range.mjs <input.xlsx> <sheet-name> <range>",
  );
}

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem(sheetName);
const range = sheet.getRange(rangeAddress);

process.stdout.write(JSON.stringify({
  sheetName,
  rangeAddress,
  values: range.values,
  formulas: range.formulas,
}, null, 2));
