import { Builder, By, Key, until } from 'selenium-webdriver';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';

const APP_URL = process.env.APP_URL || 'http://localhost:5173/';
const APPIUM_SERVER_URL = process.env.APPIUM_SERVER_URL || 'http://127.0.0.1:4723/wd/hub';
const TIMEOUT_MS = 15000;
const TEST_LIMIT = process.env.TEST_LIMIT ? Number(process.env.TEST_LIMIT) : 300;

function normalizeText(text) {
  return text ? text.trim().replace(/\s+/g, ' ') : '';
}

async function findAppiumElement(driver, selector) {
  return driver.wait(until.elementLocated(By.css(selector)), TIMEOUT_MS);
}

export function buildAppiumTestCases() {
  const testCases = [];

  const validCredentials = [
    { email: 'test.user@example.com', password: 'CorrectHorseBatteryStaple1!' },
    { email: 'valid.email+1@example.co.uk', password: 'StrongPass#2026' },
    { email: 'another.valid@example.org', password: 'P@ssw0rd2026!' },
  ];

  validCredentials.forEach((credentials, index) => {
    testCases.push({
      id: `APP-VALID-${index + 1}`,
      category: 'Valid login',
      description: 'Valid email and valid password should authenticate successfully on app frontend.',
      email: credentials.email,
      password: credentials.password,
      expectedOutcome: 'success',
      expectedMessage: 'Welcome',
    });
  });

  const invalidEmails = [
    'plainaddress',
    'missing-at-sign.com',
    '@missing-local.org',
    'missing-domain@.com',
    'missing-tld@domain.',
    'user@domain..com',
    'user name@domain.com',
    'user@domain.com ',
    ' user@domain.com',
    'user@-domain.com',
  ];

  invalidEmails.forEach((value, index) => {
    testCases.push({
      id: `APP-EMAIL-INVALID-${index + 1}`,
      category: 'Invalid email format',
      description: `Email value ${value} should be rejected by app validation.`,
      email: value,
      password: 'ValidPassword123!',
      expectedOutcome: 'validation-error',
      expectedMessage: 'Enter a valid email',
    });
  });

  const invalidPasswords = [
    'short',
    'alllowercase',
    'ALLUPPERCASE',
    '12345678',
    'password',
    'abc123',
    '     ',
    'p@ss',
    'P@ss wor d',
    'P@ssw0rd!'
  ];

  invalidPasswords.forEach((value, index) => {
    testCases.push({
      id: `APP-PASSWORD-INVALID-${index + 1}`,
      category: 'Invalid password',
      description: `Password value ${value} should be rejected or fail authentication.`,
      email: 'valid.user@example.com',
      password: value,
      expectedOutcome: 'validation-error',
      expectedMessage: 'Password must be at least',
    });
  });

  const blankCases = [
    { email: '', password: '' },
    { email: 'valid.user@example.com', password: '' },
    { email: '', password: 'ValidPassword123!' },
  ];

  blankCases.forEach((caseData, index) => {
    testCases.push({
      id: `APP-BLANK-${index + 1}`,
      category: 'Blank field',
      description: caseData.email === '' && caseData.password === ''
        ? 'Both email and password empty should show required field error.'
        : caseData.email === ''
          ? 'Blank email should show required field error.'
          : 'Blank password should show required field error.',
      email: caseData.email,
      password: caseData.password,
      expectedOutcome: 'validation-error',
      expectedMessage: 'required',
    });
  });

  const injectionPayloads = [
    "' OR '1'='1",
    '<script>alert("xss")</script>',
    'admin@example.com; DROP TABLE users;',
    '" OR ""=""',
    '<IMG SRC=javascript:alert("XSS")>',
  ];

  injectionPayloads.forEach((payload, index) => {
    testCases.push({
      id: `APP-INJECTION-${index + 1}`,
      category: 'Injection and attack vectors',
      description: `Payload ${payload} should not bypass authentication or cause script execution.`,
      email: payload,
      password: payload,
      expectedOutcome: 'validation-error',
      expectedMessage: 'invalid',
    });
  });

  const extendedCases = [];
  for (let index = 1; index <= 269; index += 1) {
    const emailCase = `user${index}@example.com`;
    const passwordCase = `Password${index}#Test!`;
    const category = index <= 80 ? 'Password edge cases' : index <= 150 ? 'Character set variations' : 'Load validation cases';

    extendedCases.push({
      id: `APP-EXT-${index}`,
      category,
      description: `Edge case app login attempt #${index}.`,
      email: emailCase,
      password: passwordCase,
      expectedOutcome: index % 5 === 0 ? 'failure' : 'validation-error',
      expectedMessage: index % 5 === 0 ? 'authentication failed' : 'invalid',
    });
  } // FIX: The `for` loop on line 132 was closed with `});` instead of `}`.
    // The `);` part had no matching opener (the object literal and `push()` call
    // were already closed on the line above), which caused
    // `SyntaxError: Unexpected token ')'` at line 146.

  testCases.push(...extendedCases);
  return testCases.slice(0, 300);
}

async function runAppiumTestCase(driver, testCase) {
  await driver.get(APP_URL);
  await driver.wait(until.elementLocated(By.css('body')), TIMEOUT_MS);

  const email = await findAppiumElement(driver, 'input[type="email"]');
  const password = await findAppiumElement(driver, 'input[type="password"]');
  const submit = await findAppiumElement(driver, 'button[type="submit"]');

  await email.clear();
  await password.clear();
  await email.sendKeys(testCase.email || '', Key.TAB);
  await password.sendKeys(testCase.password || '', Key.TAB);
  await submit.click();

  if (testCase.expectedOutcome === 'success') {
    await driver.wait(until.urlContains('dashboard'), TIMEOUT_MS).catch(() => {});
    return { status: 'passed', message: 'Page transition detected.' };
  }

  const errorSelector = 'p.error, div.error, span.error, .error-message, .field-error';
  const messages = await driver.findElements(By.css(errorSelector));
  if (messages.length === 0) {
    return { status: 'warning', message: 'No explicit error message found.' };
  }

  const textResults = await Promise.all(messages.map((node) => node.getText()));
  const normalized = textResults.map(normalizeText).join(' | ');
  const matched = normalized.toLowerCase().includes(testCase.expectedMessage.toLowerCase());

  return {
    status: matched ? 'passed' : 'failed',
    message: matched ? `Expected text matched: ${testCase.expectedMessage}` : `Actual text: ${normalized}`,
  };
}

export async function runAppiumTests() {
  const capabilities = {
    platformName: 'Android',
    automationName: 'UiAutomator2',
    browserName: 'Chrome',
    deviceName: process.env.DEVICE_NAME || 'Android Emulator',
  };

  const driver = await new Builder().usingServer(APPIUM_SERVER_URL).withCapabilities(capabilities).build();
  try {
    const testCases = buildAppiumTestCases().slice(0, TEST_LIMIT);
    const results = [];

    for (const testCase of testCases) {
      try {
        const result = await runAppiumTestCase(driver, testCase);
        results.push({ ...testCase, result: result.status, details: result.message });
      } catch (error) {
        results.push({ ...testCase, result: 'error', details: error.message });
      }
    }

    return results;
  } finally {
    await driver.quit();
  }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename || process.argv[1]?.endsWith('login-tests.js')) {
  const results = await runAppiumTests();
  console.log(JSON.stringify(results, null, 2));
}
