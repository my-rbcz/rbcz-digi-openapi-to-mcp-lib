'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// =============================================================================
// HOW TO TRIGGER EACH FIXTURE
// =============================================================================
// Each route picks a fixture based ONLY on real request inputs (path, query
// params, body). There are no special mock headers or mock query params.
//
// -----------------------------------------------------------------------------
// GET /clients
// -----------------------------------------------------------------------------
//   This endpoint has no meaningful input to dispatch on, so it always returns
//   the same fixture: fixtures/clients/default.json
//
//     curl http://127.0.0.1:3000/clients
//
// -----------------------------------------------------------------------------
// GET /user/info?clientId=<N>
// -----------------------------------------------------------------------------
//   clientId=1001  -> fixtures/user-info/default.json     (full user, isClient=true)
//   clientId=2001  -> fixtures/user-info/minimal.json     (minimal fields, no birthDate)
//   clientId=3001  -> fixtures/user-info/non-client.json  (isClient=false)
//   anything else  -> 404 Not Found
//
//     curl 'http://127.0.0.1:3000/user/info?clientId=2001'
//
// -----------------------------------------------------------------------------
// GET /contacts?clientId=<N>
// -----------------------------------------------------------------------------
//   clientId=1001  -> fixtures/contacts/default.json   (multiple addresses, email, 2 phones)
//   clientId=2001  -> fixtures/contacts/minimal.json   (one address, no emails, one phone)
//   clientId=3001  -> fixtures/contacts/empty.json     (all collections empty)
//   anything else  -> 404 Not Found
//
//     curl 'http://127.0.0.1:3000/contacts?clientId=3001&withClientContacts=false&withUserContacts=true'
//
// -----------------------------------------------------------------------------
// POST /catalogs/bulk    body = [ { "catalogCode": "..." }, ... ]
// -----------------------------------------------------------------------------
//   body is []                                  -> fixtures/catalogs-bulk/empty.json
//   body asks ONLY for "Countries"              -> fixtures/catalogs-bulk/single.json
//   anything else (e.g. PRODUCT_TYPE, multiple) -> fixtures/catalogs-bulk/default.json
//
/*
     curl -X POST http://127.0.0.1:3000/catalogs/bulk \
          -H 'Content-Type: application/json' \
          -d '[{"catalogCode":"Countries"}]'
 */
 // =============================================================================

function dispatchClients() {
  return 'default';
}

function dispatchUserInfo(query) {
  switch (String(query.clientId)) {
    case '1001': return 'default';
    case '2001': return 'minimal';
    case '3001': return 'non-client';
    default:     return null;
  }
}

function dispatchContacts(query) {
  switch (String(query.clientId)) {
    case '1001': return 'default';
    case '2001': return 'minimal';
    case '3001': return 'empty';
    default:     return null;
  }
}

function dispatchCatalogsBulk(rawBody) {
  let parsed;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : [];
  } catch {
    parsed = [];
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return 'empty';
  const codes = parsed.map((e) => e && e.catalogCode).filter(Boolean);
  if (codes.length === 1 && codes[0] === 'Countries') return 'single';
  return 'default';
}

const ROUTES = [
  { method: 'GET',  path: '/clients',       fixtureDir: 'clients',       dispatch: (q, body) => dispatchClients() },
  { method: 'GET',  path: '/user/info',     fixtureDir: 'user-info',     dispatch: (q, body) => dispatchUserInfo(q) },
  { method: 'GET',  path: '/contacts',      fixtureDir: 'contacts',      dispatch: (q, body) => dispatchContacts(q) },
  { method: 'POST', path: '/catalogs/bulk', fixtureDir: 'catalogs-bulk', dispatch: (q, body) => dispatchCatalogsBulk(body) },
];

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function drainBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function listAvailableFixtures(fixtureDir) {
  const dir = path.join(FIXTURES_DIR, fixtureDir);
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

function loadFixture(fixtureDir, fixtureName) {
  const file = path.join(FIXTURES_DIR, fixtureDir, `${fixtureName}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function handle(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const route = ROUTES.find((r) => r.method === req.method && r.path === parsedUrl.pathname);

  if (!route) {
    return sendJson(res, 404, {
      error: 'Not Found',
      message: `No mock for ${req.method} ${parsedUrl.pathname}`,
      availableRoutes: ROUTES.map((r) => `${r.method} ${r.path}`),
    });
  }

  let rawBody = '';
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    try {
      rawBody = await drainBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: 'Bad Request', message: err.message });
    }
  }

  const fixtureName = route.dispatch(parsedUrl.query, rawBody);

  if (fixtureName === null) {
    console.log(`[mock] ${req.method} ${req.url} -> 404 (no fixture matches inputs)`);
    return sendJson(res, 404, {
      error: 'Not Found',
      message: `No fixture matches the given inputs for ${req.method} ${route.path}. See dispatch table at top of server.js.`,
    });
  }

  let body;
  try {
    body = loadFixture(route.fixtureDir, fixtureName);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return sendJson(res, 500, {
        error: 'Fixture Missing',
        message: `Fixture "${fixtureName}.json" not found in fixtures/${route.fixtureDir}/`,
        availableFixtures: listAvailableFixtures(route.fixtureDir),
      });
    }
    return sendJson(res, 500, { error: 'Fixture Error', message: err.message });
  }

  console.log(`[mock] ${req.method} ${req.url} -> 200 (${route.fixtureDir}/${fixtureName}.json)`);
  sendJson(res, 200, body);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    sendJson(res, 500, { error: 'Internal Error', message: err.message });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`rbcz-digi-mock-mch listening on http://${HOST}:${PORT}`);
  console.log('Routes:');
  for (const r of ROUTES) {
    const fixtures = listAvailableFixtures(r.fixtureDir).join(', ') || '(none)';
    console.log(`  ${r.method.padEnd(4)} ${r.path.padEnd(18)}  fixtures: ${fixtures}`);
  }
});
