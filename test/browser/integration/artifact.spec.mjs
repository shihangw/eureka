import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import {
  DIST_DIR,
  expect,
  highlightedIds,
  loadFixture,
  openExtensionApi,
  test,
} from '../extension.mjs';
import { TARGET_URLS } from '../server.mjs';

const EXPECTED_FILES = [
  '_locales/en/messages.json',
  'images/icon_128.png',
  'images/icon_16.png',
  'images/icon_19.png',
  'images/icon_38.png',
  'manifest.json',
  'options.html',
  'popup.html',
  'scripts/background.js',
  'scripts/contentscript.js',
  'scripts/options.js',
  'scripts/popup.js',
  'styles/content.css',
  'styles/main.css',
];

const SCRIPTS = EXPECTED_FILES.filter((file) => file.endsWith('.js'));
const ICON_SIZES = {
  'images/icon_16.png': 16,
  'images/icon_19.png': 19,
  'images/icon_38.png': 38,
  'images/icon_128.png': 128,
};

/** Permission and injection scope of the extension at baseline 18b12af. */
const BASELINE = {
  permissions: ['bookmarks', 'storage'],
  background: { service_worker: 'scripts/background.js' },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      css: ['styles/content.css'],
      js: ['scripts/contentscript.js'],
      run_at: 'document_end',
      all_frames: false,
    },
  ],
  options_page: 'options.html',
  default_popup: 'popup.html',
};

async function listFiles(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(DIST_DIR, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .sort();
}

const readDist = (file) => readFile(join(DIST_DIR, file), 'utf8');

test('dist contains exactly the complete extension with baseline scope', async () => {
  expect(await listFiles(DIST_DIR)).toEqual(EXPECTED_FILES);

  const manifest = JSON.parse(await readDist('manifest.json'));
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions).toEqual(BASELINE.permissions);
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.optional_permissions).toBeUndefined();
  expect(manifest.background).toEqual(BASELINE.background);
  expect(manifest.content_scripts).toEqual(BASELINE.content_scripts);
  expect(manifest.options_page).toBe(BASELINE.options_page);
  expect(manifest.action.default_popup).toBe(BASELINE.default_popup);
  expect(manifest.content_security_policy).toBeUndefined();

  const referenced = [
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_page,
    ...manifest.content_scripts.flatMap((script) => [...script.css, ...script.js]),
    `_locales/${manifest.default_locale}/messages.json`,
  ];
  for (const page of ['popup.html', 'options.html']) {
    const html = await readDist(page);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts.length, `${page} scripts`).toBeGreaterThan(0);
    for (const [, attributes, body] of scripts) {
      expect(body.trim(), `${page} inline script`).toBe('');
      expect(attributes, `${page} module script`).not.toMatch(/type=/);
    }
    expect(html, `${page} inline handler`).not.toMatch(/\son[a-z]+=/i);
    referenced.push(...[...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((match) => match[1]));
  }
  for (const file of referenced) {
    expect(EXPECTED_FILES, `referenced ${file}`).toContain(file);
  }

  for (const file of SCRIPTS) {
    const source = await readDist(file);
    expect(source, `${file} is an IIFE`).toMatch(/^(?:"use strict";\s*)?\(\(\) => \{/);
    expect(source, `${file} module syntax`).not.toMatch(/^\s*(?:import|export)\b/m);
    expect(source, `${file} dynamic code`).not.toMatch(
      /\beval\s*\(|new Function\b|\bimport\s*\(|importScripts/
    );
    expect(source, `${file} remote URL`).not.toMatch(/https?:\/\//);
  }
});

test('Chromium loads the worker, pages, styles, icons, locale and content script from dist', async ({
  extension,
}) => {
  const problems = [];
  const track = (page) => {
    page.on('pageerror', (error) => problems.push(`${page.url()} pageerror: ${error.message}`));
    page.on('requestfailed', (request) => problems.push(`request failed: ${request.url()}`));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`${page.url()} console: ${message.text()}`);
    });
  };
  extension.context.on('page', track);
  extension.context.pages().forEach(track);

  expect(extension.worker.url()).toBe(extension.extensionUrl('scripts/background.js'));

  const api = await openExtensionApi(extension);
  const messages = JSON.parse(await readDist('_locales/en/messages.json'));
  const loaded = await api.page.evaluate(
    async ({ files, icons }) => {
      const fetched = {};
      for (const file of files) {
        fetched[file] = (await fetch(chrome.runtime.getURL(file))).status;
      }
      const iconWidths = {};
      for (const icon of icons) {
        const image = new Image();
        image.src = chrome.runtime.getURL(icon);
        await image.decode();
        iconWidths[icon] = image.naturalWidth;
      }
      const manifest = chrome.runtime.getManifest();
      return {
        fetched,
        iconWidths,
        appName: chrome.i18n.getMessage('appName'),
        appDescription: chrome.i18n.getMessage('appDescription'),
        permissions: manifest.permissions,
        matches: manifest.content_scripts?.[0]?.matches,
      };
    },
    { files: EXPECTED_FILES, icons: Object.keys(ICON_SIZES) }
  );
  expect(loaded.fetched).toEqual(Object.fromEntries(EXPECTED_FILES.map((file) => [file, 200])));
  expect(loaded.iconWidths).toEqual(ICON_SIZES);
  expect(loaded.appName).toBe(messages.appName.message);
  expect(loaded.appDescription).toBe(messages.appDescription.message);
  expect(loaded.permissions).toEqual(BASELINE.permissions);
  expect(loaded.matches).toEqual(BASELINE.content_scripts[0].matches);

  const stylesheetRules = (page) =>
    page.evaluate(() =>
      [...document.styleSheets].map((sheet) => [
        new URL(sheet.href).pathname,
        sheet.cssRules.length > 0,
      ])
    );

  await expect(api.page.locator('#bookmark-count')).toHaveText(/^\d+$/);
  expect(await stylesheetRules(api.page)).toEqual([['/styles/main.css', true]]);

  const options = await extension.context.newPage();
  await options.goto(extension.extensionUrl('options.html'));
  await expect(options.locator('input[name="highlight-style"]')).toHaveCount(3);
  await expect(options.locator('input[name="highlight-style"]:checked')).toHaveValue('yellow');
  expect(await stylesheetRules(options)).toEqual([['/styles/main.css', true]]);

  const folder = await api.createBookmark({ title: 'Eureka artifact fixture' });
  await api.createBookmark({ parentId: folder.id, title: 'A', url: TARGET_URLS.alpha });
  await expect
    .poll(async () => (await api.lookup([TARGET_URLS.alpha])).bookmarkedUrls)
    .toEqual([TARGET_URLS.alpha]);
  const fixture = await extension.context.newPage();
  const { anchors } = await loadFixture(fixture);
  expect(highlightedIds(anchors)).toEqual(['alpha-1', 'alpha-2', 'alpha-data-href']);
  const background = await fixture
    .locator('#alpha-1 span.eureka-highlight-yellow')
    .evaluate((span) => getComputedStyle(span).backgroundColor);
  expect(background).toBe('rgb(255, 242, 58)');
  await api.removeTree(folder.id);

  expect(problems).toEqual([]);
});
