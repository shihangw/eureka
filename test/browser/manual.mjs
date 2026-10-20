/**
 * Launches the built dist/ extension in a disposable Chromium profile for
 * manual validation, with remote debugging on loopback only.
 *
 * Run: EUREKA_CDP_PORT=4311 node test/browser/manual.mjs
 * Stop with SIGTERM or SIGINT; the browser and its profile are removed.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DIST_DIR, launchExtension } from './extension.mjs';
import { FIXTURE_ORIGIN, FIXTURE_URL } from './server.mjs';

const APPROVED_CDP_PORT = 4311;

const port = Number(process.env.EUREKA_CDP_PORT ?? APPROVED_CDP_PORT);
if (port !== APPROVED_CDP_PORT) {
  console.error(`EUREKA_CDP_PORT must be ${APPROVED_CDP_PORT}; got ${process.env.EUREKA_CDP_PORT}`);
  process.exit(1);
}
if (!existsSync(join(DIST_DIR, 'manifest.json'))) {
  console.error('dist/ is missing; run `npm run build` first.');
  process.exit(1);
}

const extension = await launchExtension({
  args: ['--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`],
});

let closing;
function shutdown() {
  closing ??= extension.close().then(
    () => process.exit(0),
    (error) => {
      console.error('Failed to close the manual browser:', error);
      process.exit(1);
    }
  );
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
extension.context.on('close', shutdown);

const [page = await extension.context.newPage()] = extension.context.pages();
const fixtureHealthy = await fetch(`${FIXTURE_ORIGIN}/health`).then(
  (response) => response.ok,
  () => false
);
if (fixtureHealthy) {
  await page.goto(FIXTURE_URL);
} else {
  console.warn(`Fixture server is not running at ${FIXTURE_ORIGIN}; start it to load the fixture.`);
}

console.log(`Eureka manual browser ready: CDP http://127.0.0.1:${port}`);
console.log(`Extension ID: ${extension.extensionId}`);
console.log(`Popup: ${extension.extensionUrl('popup.html')}`);
console.log(`Options: ${extension.extensionUrl('options.html')}`);
console.log(`Fixture: ${FIXTURE_URL}`);
