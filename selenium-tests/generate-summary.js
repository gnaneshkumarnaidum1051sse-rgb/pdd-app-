import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { buildLoginTestCases } from './tests/login-tests.js';

const outputFile = path.resolve('selenium-tests-summary.xlsx');
const testCases = buildLoginTestCases();

const workbook = new ExcelJS.Workbook();
const summarySheet = workbook.addWorksheet('Summary');
const detailsSheet = workbook.addWorksheet('Details');

summarySheet.columns = [
  { header: 'Metric', key: 'metric', width: 40 },
  { header: 'Value', key: 'value', width: 40 },
];

summarySheet.addRows([
  { metric: 'Project', value: 'PredictDent AI Selenium E2E' },
  { metric: 'Total Test Cases', value: testCases.length },
  { metric: 'Generated On', value: new Date().toISOString() },
  { metric: 'Test File', value: 'selenium-tests/tests/login-tests.js' },
  { metric: 'Notes', value: 'Contains login validation, authentication, and edge-case coverage.' },
]);

summarySheet.getRow(1).font = { bold: true };
summarySheet.getRow(2).font = { bold: true };

summarySheet.addRow({ metric: 'Validation categories covered', value: 'Valid login, invalid email, invalid password, blank field, injection payload, edge-case scenarios' });
summarySheet.addRow({ metric: 'Runner command', value: 'npm --prefix selenium-tests run test' });
summarySheet.addRow({ metric: 'Summary note', value: 'This workbook lists the login test case set used for E2E automation.' });

summarySheet.eachRow((row) => {
  row.alignment = { vertical: 'middle', horizontal: 'left' };
});

const detailColumns = [
  { header: 'Test ID', key: 'id', width: 18 },
  { header: 'Category', key: 'category', width: 28 },
  { header: 'Description', key: 'description', width: 80 },
  { header: 'Email', key: 'email', width: 32 },
  { header: 'Password', key: 'password', width: 32 },
  { header: 'Expected Outcome', key: 'expectedOutcome', width: 18 },
  { header: 'Expected Message', key: 'expectedMessage', width: 30 },
];

detailsSheet.columns = detailColumns;
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

detailsSheet.eachRow((row, rowNumber) => {
  row.alignment = { vertical: 'top', wrapText: true };
  if (rowNumber > 1) {
    row.height = 20;
  }
});

await workbook.xlsx.writeFile(outputFile);
console.log(`Generated summary workbook: ${outputFile}`);
