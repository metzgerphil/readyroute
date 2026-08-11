import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [inputPath, outputDirectory] = process.argv.slice(2);

if (!inputPath || !outputDirectory) {
  throw new Error("Usage: inspect_source_workbook.mjs <input.xlsx> <render-directory>");
}

await fs.mkdir(outputDirectory, { recursive: true });

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const overview = await workbook.inspect({
  kind: "workbook,sheet,table,region",
  maxChars: 20000,
  tableMaxRows: 40,
  tableMaxCols: 20,
  tableMaxCellChars: 300,
});

const sheetInspection = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 10000,
});

const sheetRecords = String(sheetInspection.ndjson || "")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const sheetNames = sheetRecords
  .map((record) => record.name || record.sheetName)
  .filter(Boolean);

for (const sheetName of sheetNames) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1.5,
    format: "png",
  });
  const safeName = sheetName.replace(/[^a-zA-Z0-9_-]+/g, "_");
  await fs.writeFile(
    `${outputDirectory}/${safeName}.png`,
    new Uint8Array(await preview.arrayBuffer()),
  );
}

process.stdout.write(JSON.stringify({
  sheetNames,
  overview: overview.ndjson,
  sheetInspection: sheetInspection.ndjson,
}, null, 2));
