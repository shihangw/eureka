/**
 * Deterministic HTTP fixture server for the real-browser tests.
 *
 * Run directly: node test/browser/server.mjs --host=127.0.0.1 --port=4310
 * or import startFixtureServer() and the fixture URL constants.
 */
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export const FIXTURE_HOST = '127.0.0.1';
export const FIXTURE_PORT = 4310;
export const FIXTURE_ORIGIN = `http://${FIXTURE_HOST}:${FIXTURE_PORT}`;

/** Path of the page every browser test loads. */
export const FIXTURE_PATH = '/fixture.html';
export const FIXTURE_URL = `${FIXTURE_ORIGIN}${FIXTURE_PATH}`;

/** Link destinations on the fixture page that tests may bookmark. */
export const TARGET_URLS = Object.freeze({
  alpha: `${FIXTURE_ORIGIN}/targets/alpha`,
  beta: `${FIXTURE_ORIGIN}/targets/beta`,
  gamma: `${FIXTURE_ORIGIN}/targets/gamma`,
  control: `${FIXTURE_ORIGIN}/targets/control`,
});

/**
 * Anchor IDs on the fixture page, mapped to the URL the content script looks up.
 * Anchors not listed here (the fragment-only link) are never looked up.
 */
export const FIXTURE_ANCHORS = Object.freeze({
  'alpha-1': TARGET_URLS.alpha,
  'alpha-2': TARGET_URLS.alpha,
  'alpha-data-href': TARGET_URLS.alpha,
  'alpha-query': `${TARGET_URLS.alpha}?variant=1`,
  beta: TARGET_URLS.beta,
  gamma: TARGET_URLS.gamma,
  control: TARGET_URLS.control,
});

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Eureka fixture</title>
    <style>
      body { font: 16px/1.5 sans-serif; color: rgb(20, 20, 20); }
      a { color: rgb(0, 0, 238); }
      .plain { background-color: rgb(240, 240, 240); }
    </style>
  </head>
  <body>
    <h1>Eureka fixture</h1>
    <ul>
      <li><a id="alpha-1" href="/targets/alpha">Alpha link</a></li>
      <li><a id="alpha-2" href="/targets/alpha"><em>Alpha</em> repeated link</a></li>
      <li>
        <a id="alpha-data-href" href="/targets/unlisted" data-href="${TARGET_URLS.alpha}"
          >Alpha via data-href</a
        >
      </li>
      <li><a id="alpha-query" href="/targets/alpha?variant=1">Alpha with query</a></li>
      <li><a id="beta" href="/targets/beta">Beta link</a></li>
      <li><a id="gamma" href="/targets/gamma">Gamma link</a></li>
      <li><a id="control" href="/targets/control">Control link</a></li>
      <li><a id="fragment" href="#alpha-1">Fragment link</a></li>
    </ul>
    <p id="plain" class="plain">Plain text that is not a link.</p>
  </body>
</html>
`;

function targetHtml(name) {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Target ${name}</title></head>
  <body><h1>Target ${name}</h1><a id="back" href="${FIXTURE_PATH}">Back</a></body>
</html>
`;
}

function send(response, status, type, body) {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(body);
}

function handle(request, response) {
  const { pathname } = new URL(request.url ?? '/', FIXTURE_ORIGIN);

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(response, 405, 'text/plain; charset=utf-8', 'Method not allowed\n');
  } else if (pathname === '/health') {
    send(
      response,
      200,
      'application/json; charset=utf-8',
      JSON.stringify({ status: 'ok', service: 'eureka-fixtures' })
    );
  } else if (pathname === '/favicon.ico') {
    // Avoids a browser console error for the automatic favicon request.
    response.writeHead(204, { 'cache-control': 'no-store' });
    response.end();
  } else if (pathname === '/' || pathname === FIXTURE_PATH) {
    send(response, 200, 'text/html; charset=utf-8', FIXTURE_HTML);
  } else if (/^\/targets\/[a-z-]+$/.test(pathname)) {
    send(response, 200, 'text/html; charset=utf-8', targetHtml(pathname.slice(9)));
  } else {
    send(response, 404, 'text/plain; charset=utf-8', 'Not found\n');
  }
}

/**
 * Starts the fixture server. Only loopback hosts are accepted.
 * @param {{ host?: string, port?: number }} [options]
 * @returns {Promise<import('node:http').Server>}
 */
export function startFixtureServer({ host = FIXTURE_HOST, port = FIXTURE_PORT } = {}) {
  if (!LOOPBACK_HOSTS.has(host)) {
    return Promise.reject(new Error(`Refusing to bind non-loopback host ${host}`));
  }
  const server = createServer(handle);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    const match = /^--(host|port)=(.+)$/.exec(arg);
    if (!match) throw new Error(`Unknown argument: ${arg}`);
    options[match[1]] = match[1] === 'port' ? Number(match[2]) : match[2];
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArgs(process.argv.slice(2));
  const server = await startFixtureServer(options);
  const { address, port } = server.address();
  console.log(`Eureka fixtures listening on http://${address}:${port}`);
  const stop = () => server.close(() => process.exit(0));
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
