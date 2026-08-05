import path from 'path';
import ExcelJS from 'exceljs';
import { buildAppiumTestCases } from './tests/login-tests.js';

const outputFile = path.resolve('appium-tests-summary.xlsx');
const testCases = buildAppiumTestCases();

const workbook = new ExcelJS.Workbook();
const summarySheet = workbook.addWorksheet('Summary');
const detailsSheet = workbook.addWorksheet('Details');

summarySheet.columns = [
  { header: 'Metric', key: 'metric', width: 40 },
  { header: 'Value', key: 'value', width: 60 },
];

summarySheet.addRows([
  { metric: 'Project', value: 'PredictDent AI Appium E2E' },
  { metric: 'Total Test Cases', value: testCases.length },
  { metric: 'Generated On', value: new Date().toISOString() },
  { metric: 'Test File', value: 'appium-tests/tests/login-tests.js' },
  { metric: 'Runner command', value: 'npm --prefix appium-tests run test' },
  { metric: 'Notes', value: 'Appium test spreadsheet for app frontend login scenarios.' },
]);

summarySheet.getRow(1).font = { bold: true };
summarySheet.getRow(2).font = { bold: true };

detailsSheet.columns = [
  { header: 'Test ID', key: 'id', width: 18 },
  { header: 'Category', key: 'category', width: 28 },
  { header: 'Description', key: 'description', width: 80 },
  { header: 'Email', key: 'email', width: 32 },
  { header: 'Password', key: 'password', width: 32 },
  { header: 'Expected Outcome', key: 'expectedOutcome', width: 18 },
  { header: 'Expected Message', key: 'expectedMessage', width: 30 },
];

detailsSheet.addRows(testCases.map((testCase) => ({
  id: testCase.id,
  category: testCase.category,
  description: testCase.description,
  email: testCase.email,
  password: testCase.password,
  expectedOutcome: testCase.expectedOutcome,
  expectedMessage: testCase.expectedMessage,
})));

detailsSheet.getRow(1).font = { bold: true };

detailsSheet.eachRow((row) => {
  row.alignment = { vertical: 'top', wrapText: true };
});

await workbook.xlsx.writeFile(outputFile);
console.log(`Generated Appium summary workbook: ${outputFile}`);
