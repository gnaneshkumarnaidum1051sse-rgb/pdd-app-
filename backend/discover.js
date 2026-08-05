import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';

const backendFile = path.resolve('backend/server.js');
const reportDir = path.resolve('Vulnerability Test Results');
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

const content = fs.existsSync(backendFile) ? fs.readFileSync(backendFile, 'utf8') : '';

// Simple route extractor for Express-style `app.METHOD('/path', ...)`
const routeRegex = /app\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g;
const routes = [];
let m;
while ((m = routeRegex.exec(content)) !== null) {
  routes.push({ method: m[1].toUpperCase(), path: m[2], auth: /requireUser/.test(content.substring(m.index, m.index + 300)) ? 'Yes' : 'Unknown', roles: 'N/A', file: 'backend/server.js' });
}

// Fallback: common endpoints
if (routes.length === 0 && content.length) {
  // try to find exported routers
  const routerRegex = /router\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g;
  while ((m = routerRegex.exec(content)) !== null) {
    routes.push({ method: m[1].toUpperCase(), path: m[2], auth: 'Unknown', roles: 'N/A', file: 'backend/server.js' });
  }
}

// Basic static checks for SAST-like findings
const findings = [];
if (/multer/.test(content)) {
  findings.push({ severity: 'Medium', type: 'File upload', file: 'backend/server.js', endpoint: '/api/reports/analyze', description: 'Uses multer for uploads. Ensure file type and size checks are enforced.', impact: 'Upload of malicious files', recommendation: 'Validate content type, scan uploads, and restrict storage access.' });
}
if (/cors\(/.test(content)) {
  const corsLine = content.match(/app\.use\(cors\([^\)]*\)\)/);
  findings.push({ severity: 'Low', type: 'CORS configuration', file: 'backend/server.js', endpoint: 'N/A', description: `CORS middleware configured (${corsLine ? corsLine[0] : 'present'}). Review allowed origins.`, impact: 'Cross-origin requests may be allowed', recommendation: 'Restrict allowed origins to trusted domains.' });
}
if (/admin\.initializeApp/.test(content)) {
  findings.push({ severity: 'Low', type: 'Third-party integration', file: 'backend/server.js', endpoint: 'N/A', description: 'Initializes Firebase Admin SDK. Ensure service account secrets are stored securely in environment.', impact: 'Leak of service account could be severe', recommendation: 'Keep private keys in secret manager and rotate regularly.' });
}
if (!/helmet\(|res.set\(/.test(content)) {
  findings.push({ severity: 'Low', type: 'Security headers', file: 'backend/server.js', endpoint: 'N/A', description: 'No explicit security headers configuration detected.', impact: 'Missing headers can lead to clickjacking, XSS risks', recommendation: 'Add Helmet or equivalent to set CSP, X-Frame-Options, etc.' });
}

// Create endpoint inventory workbook
const workbook = new ExcelJS.Workbook();
const endpointsSheet = workbook.addWorksheet('Endpoint Inventory');
endpointsSheet.columns = [
  { header: 'Endpoint', key: 'endpoint', width: 40 },
  { header: 'HTTP Method', key: 'method', width: 12 },
  { header: 'Authentication Required', key: 'auth', width: 18 },
  { header: 'Expected Roles', key: 'roles', width: 18 },
  { header: 'Controller/File Path', key: 'file', width: 30 },
];
endpointsSheet.addRows(routes.map(r => ({ endpoint: r.path, method: r.method, auth: r.auth, roles: r.roles, file: r.file })));

const findingsSheet = workbook.addWorksheet('Security Findings');
findingsSheet.columns = [
  { header: 'Severity', key: 'severity', width: 12 },
  { header: 'Type', key: 'type', width: 24 },
  { header: 'File Path', key: 'file', width: 40 },
  { header: 'Endpoint', key: 'endpoint', width: 28 },
  { header: 'Description', key: 'description', width: 80 },
  { header: 'Impact', key: 'impact', width: 28 },
  { header: 'Recommendation', key: 'recommendation', width: 80 },
];
findings.forEach(f => findingsSheet.addRow(f));

await workbook.xlsx.writeFile(path.join(reportDir, 'endpoint-inventory.xlsx'));
await workbook.xlsx.writeFile(path.join(reportDir, 'findings.xlsx'));

// Write human-readable markdown summary
const md = [];
md.push('# Backend Inventory');
md.push('');
md.push(`Detected ${routes.length} routes in backend/server.js`);
md.push('');
routes.forEach(r => md.push(`- ${r.method} ${r.path} (auth: ${r.auth}) - ${r.file}`));
md.push('');
md.push('# Findings');
md.push('');
if (findings.length === 0) md.push('No static findings detected by the lightweight scanner.');
else findings.forEach(f => md.push(`- **${f.severity}**: ${f.type} — ${f.description} (File: ${f.file})`));

fs.writeFileSync(path.join(reportDir, 'endpoint-inventory.md'), md.join('\n'));
fs.writeFileSync(path.join(reportDir, 'findings.md'), '# Findings\n\n' + (findings.length ? findings.map(f => `- ${f.severity}: ${f.type} — ${f.description}`).join('\n') : 'No findings'));

console.log('Generated endpoint inventory and findings in', reportDir);
