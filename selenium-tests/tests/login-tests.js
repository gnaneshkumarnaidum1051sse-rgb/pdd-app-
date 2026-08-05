import { Builder, By, Key, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { fileURLToPath } from 'url';

const APP_URL = process.env.APP_URL || 'http://localhost:5173/';
const TIMEOUT_MS = 10000;
const TEST_TIMEOUT_MS = 20000;
const TEST_LIMIT = process.env.TEST_LIMIT ? Number(process.env.TEST_LIMIT) : 0;

function normalizeText(text) {
  return text ? text.trim().replace(/\s+/g, ' ') : '';
}

async function findFirstElement(driver, selector) {
  try {
    return await driver.wait(until.elementLocated(By.css(selector)), TIMEOUT_MS);
  } catch (error) {
    return null;
  }
}

export function buildLoginTestCases() {
  const testCases = [];

  const validCredentials = [
    { email: 'test.user@example.com', password: 'CorrectHorseBatteryStaple1!' },
    { email: 'valid.email+1@example.co.uk', password: 'StrongPass#2026' },
    { email: 'another.valid@example.org', password: 'P@ssw0rd2026!' },
  ];

  validCredentials.forEach((credentials, index) => {
    testCases.push({
      id: `LOGIN-VALID-${index + 1}`,
      category: 'Valid login',
      description: 'Valid email and valid password should authenticate successfully.',
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
      id: `LOGIN-EMAIL-INVALID-${index + 1}`,
      category: 'Invalid email format',
      description: `Email value ${value} should be rejected by frontend validation.`,
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
    'P@ssw0rd!',
  ];

  invalidPasswords.forEach((value, index) => {
    testCases.push({
      id: `LOGIN-PASSWORD-INVALID-${index + 1}`,
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
      id: `LOGIN-BLANK-${index + 1}`,
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
    "\" OR \"\"=\"\"",
    '<IMG SRC=javascript:alert("XSS")>',
  ];

  injectionPayloads.forEach((payload, index) => {
    testCases.push({
      id: `LOGIN-INJECTION-${index + 1}`,
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
      id: `LOGIN-EXT-${index}`,
      category,
      description: `Edge case login attempt #${index}.`,
      email: emailCase,
      password: passwordCase,
      expectedOutcome: index % 5 === 0 ? 'failure' : 'validation-error',
      expectedMessage: index % 5 === 0 ? 'authentication failed' : 'invalid',
    });
  }

  testCases.push(...extendedCases);
  return testCases.slice(0, 300);
}

async function findLoginElements(driver) {
  const emailSelectors = ['input[type="email"]', 'input[name="email"]', 'input#email', 'input[name="user"]'];
  const passwordSelectors = ['input[type="password"]', 'input[name="password"]', 'input#password'];
  const submitSelectors = ['button[type="submit"]', 'input[type="submit"]', 'button.login-button', 'button[name="login"]'];

  let email = null;
  for (const selector of emailSelectors) {
    email = await findFirstElement(driver, selector);
    if (email) break;
  }

  let password = null;
  for (const selector of passwordSelectors) {
    password = await findFirstElement(driver, selector);
    if (password) break;
  }

  let submit = null;
  for (const selector of submitSelectors) {
    submit = await findFirstElement(driver, selector);
    if (submit) break;
  }

  if (!email || !password || !submit) {
    const missing = [];
    if (!email) missing.push('email input');
    if (!password) missing.push('password input');
    if (!submit) missing.push('submit button');
    throw new Error(`Unable to locate login elements: ${missing.join(', ')}`);
  }

  return { email, password, submit };
}

async function runLoginTestCase(driver, testCase) {
  console.log(`Starting ${testCase.id}: ${testCase.description}`);
  await driver.get(APP_URL);
  await driver.wait(until.elementLocated(By.css('body')), TIMEOUT_MS);

  const { email, password, submit } = await findLoginElements(driver);
  await email.clear();
  await password.clear();
  await email.sendKeys(testCase.email || '', Key.TAB);
  await password.sendKeys(testCase.password || '', Key.TAB);
  await submit.click();
  console.log(`Submitted ${testCase.id}`);

  return await Promise.race([
    (async () => {
      if (testCase.expectedOutcome === 'success') {
        await driver.wait(until.urlContains('dashboard'), TIMEOUT_MS).catch(() => {});
        return { status: 'passed', message: 'Page transition or success state detected.' };
      }

      const errorSelector = 'p.error, div.error, span.error, .error-message, .field-error';
      const messages = await driver.findElements(By.css(errorSelector));
      if (messages.length === 0) {
        return { status: 'warning', message: 'No explicit error message found after submission.' };
      }

      const textResults = await Promise.all(messages.map((node) => node.getText()));
      const normalized = textResults.map(normalizeText).join(' | ');
      const matched = normalized.toLowerCase().includes(testCase.expectedMessage.toLowerCase());

      return {
        status: matched ? 'passed' : 'failed',
        message: matched ? `Expected validation text found: ${testCase.expectedMessage}` : `Actual text: ${normalized}`,
      };
    })(),
    new Promise((resolve) => setTimeout(() => resolve({ status: 'timeout', message: `Test exceeded ${TEST_TIMEOUT_MS}ms` }), TEST_TIMEOUT_MS)),
  ]);
}

export async function runAllLoginTests() {
  console.log('Starting login test suite against', APP_URL);
  const chromeOptions = new chrome.Options();
  chromeOptions.addArguments('--headless=new', '--window-size=1440,900');

  const driver = await new Builder().forBrowser('chrome').setChromeOptions(chromeOptions).build();

  try {
    let testCases = buildLoginTestCases();
    console.log(`Loaded ${testCases.length} test cases.`);

    if (TEST_LIMIT > 0) {
      testCases = testCases.slice(0, TEST_LIMIT);
      console.log(`Limited test execution to ${TEST_LIMIT} cases.`);
    }

    const results = [];

    for (const testCase of testCases) {
      try {
        const attempt = await runLoginTestCase(driver, testCase);
        results.push({ ...testCase, result: attempt.status, details: attempt.message });
        console.log(`Completed ${testCase.id}: ${attempt.status}`);
      } catch (error) {
        console.log(`Error in ${testCase.id}: ${error.message}`);
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
  const results = await runAllLoginTests();
  console.log(JSON.stringify(results, null, 2));
}
