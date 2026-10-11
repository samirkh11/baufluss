// Responsive end-to-end test: the app must be usable on phones and tablets (site crews).
// Drives Chromium with phone (390x844, touch) and tablet (820x1180) viewports and checks that
// every page fits the screen width, the navigation drawer works and dialogs fit. Screenshots go to
// e2e/shots/. Run after `npm run seed` (see README).
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { deflateSync } from 'zlib';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const shots = new URL('./shots/', import.meta.url).pathname;
mkdirSync(shots, { recursive: true });

function png() {
  const crc = (buf) => { let c, crc = 0xffffffff; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: 8 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(24, 90)])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const TEST_IMAGE = join(mkdtempSync(join(tmpdir(), 'meisterwerk-e2e-')), 'test.png');
writeFileSync(TEST_IMAGE, png());

const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

const browser = await chromium.launch();
const errors = [];

async function newPage(viewport, touch) {
  const context = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  return page;
}

async function login(page, email) {
  await page.goto(BASE + '/login');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort').fill('demo12345');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.waitForURL(BASE + '/');
}

// No horizontal page scrolling: the document must not be wider than the viewport.
async function fitsWidth(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

async function visit(page, label, url, tag, waitFor) {
  await page.goto(BASE + url);
  await page.waitForSelector(waitFor ?? 'main, .ant-layout-content', { timeout: 15000 });
  await page.waitForTimeout(500);
  const ok = await fitsWidth(page);
  const width = await page.evaluate(() => `${document.documentElement.scrollWidth}/${window.innerWidth}`);
  check(`${tag} ${label}: fits the screen width`, ok, ok ? '' : `(scrollWidth/innerWidth ${width})`);
  await page.screenshot({ path: shots + `r-${tag}-${label.replace(/\W+/g, '-')}.png` });
}

for (const [tag, viewport, touch] of [['phone', { width: 390, height: 844 }, true], ['tablet', { width: 820, height: 1180 }, true]]) {
  const page = await newPage(viewport, touch);
  await login(page, 'demo@meisterwerk.local');

  // navigation: drawer instead of the fixed sidebar
  check(`${tag}: no fixed sidebar`, (await page.locator('.ant-layout-sider').count()) === 0);
  await page.getByRole('button', { name: 'Menü' }).click();
  await page.getByRole('menuitem', { name: 'Projekte' }).click();
  await page.waitForURL(BASE + '/projects');
  await page.waitForSelector('tbody tr.ant-table-row');
  await page.waitForTimeout(400);
  check(`${tag}: drawer closes after navigating`, (await page.locator('.ant-drawer-open').count()) === 0);
  check(`${tag} projects: fits the screen width`, await fitsWidth(page));
  await page.screenshot({ path: shots + `r-${tag}-projects.png` });
  if (tag === 'phone') {
    check('phone projects: secondary columns hidden', (await page.locator('thead th', { hasText: 'Baustelle' }).count()) === 0);
  } else {
    check('tablet projects: all columns shown', (await page.locator('thead th', { hasText: 'Baustelle' }).count()) === 1);
  }

  await visit(page, 'dashboard', '/', tag);
  await visit(page, 'reports', '/reports', tag, 'tbody tr.ant-table-row');
  await visit(page, 'quotes', '/quotes', tag, 'tbody tr.ant-table-row');
  await visit(page, 'orders', '/orders', tag, 'tbody tr.ant-table-row');
  await visit(page, 'invoices', '/invoices', tag, 'tbody tr.ant-table-row');
  await visit(page, 'contacts', '/contacts', tag, 'tbody tr.ant-table-row');
  await visit(page, 'catalog', '/catalog', tag, 'tbody tr.ant-table-row');
  await visit(page, 'time', '/time?week=2026-10-05', tag, '[data-testid=week-total]');
  await page.getByRole('tab', { name: 'Auswertung' }).click();
  await page.waitForSelector('text=Stunden je Projekt');
  await page.waitForTimeout(500);
  check(`${tag} time evaluation: fits the screen width`, await fitsWidth(page));
  await page.screenshot({ path: shots + `r-${tag}-time-report.png` });
  await visit(page, 'company', '/company', tag, 'form');
  await visit(page, 'users', '/users', tag, 'tbody tr.ant-table-row');

  // project detail + issued quote + draft editor
  await page.goto(BASE + '/projects');
  await page.waitForSelector('tbody tr.ant-table-row');
  await page.getByRole('link', { name: 'Dachsanierung MFH Hirschstraße 14' }).click();
  await page.waitForSelector('h3');
  await page.waitForTimeout(600);
  check(`${tag} project detail: fits the screen width`, await fitsWidth(page));
  await page.screenshot({ path: shots + `r-${tag}-project-detail.png` });

  await page.goto(BASE + '/quotes');
  await page.waitForSelector('tbody tr.ant-table-row');
  await page.getByRole('link', { name: 'AN-00002' }).click();
  await page.waitForSelector('text=Dieses Dokument ist ausgestellt und gesperrt');
  await page.waitForTimeout(600);
  check(`${tag} quote editor (issued): fits the screen width`, await fitsWidth(page));
  if (tag === 'phone') {
    check('phone quote editor: lines shown as cards', (await page.locator('.ant-card-small').count()) >= 12 && (await page.locator('.ant-table-tbody tr.ant-table-row').count()) === 0);
  }
  await page.screenshot({ path: shots + `r-${tag}-quote-locked.png`, fullPage: true });
  await page.getByRole('button', { name: 'Duplizieren' }).click();
  await page.waitForSelector('h3:has-text("Entwurf")');
  await page.waitForTimeout(600);
  check(`${tag} quote editor (draft): fits the screen width`, await fitsWidth(page));
  await page.screenshot({ path: shots + `r-${tag}-quote-draft.png`, fullPage: true });
  await page.getByRole('button', { name: 'Löschen' }).click();
  await page.locator('.ant-popover:visible').getByRole('button', { name: 'OK' }).click();
  await page.waitForURL(/\/projects\/.+/);

  // dialogs must fit into the viewport
  await page.goto(BASE + '/contacts');
  await page.waitForSelector('tbody tr.ant-table-row');
  await page.getByRole('button', { name: 'Neuer Kontakt' }).click();
  const box = await page.locator('.ant-modal:visible .ant-modal-content').boundingBox();
  check(`${tag} contact dialog fits the screen`, !!box && box.x >= 0 && box.x + box.width <= viewport.width + 1, JSON.stringify(box && { x: box.x, w: box.width }));
  await page.screenshot({ path: shots + `r-${tag}-contact-dialog.png` });
  await page.context().close();
}

// phone: a worker writes a site report with a photo
{
  const page = await newPage({ width: 390, height: 844 }, true);
  await login(page, 'l.bauer@dachdecker-schmidt.example');
  await page.getByRole('button', { name: 'Menü' }).click();
  check('worker (phone): no document entries in the menu', (await page.getByRole('menuitem', { name: /Angebote|Aufträge|Rechnungen/ }).count()) === 0);
  await page.getByRole('menuitem', { name: 'Projekte' }).click();
  await page.waitForSelector('tbody tr.ant-table-row');
  await page.getByRole('link', { name: 'Neueindeckung EFH Familie Becker' }).click();
  await page.waitForSelector('h3');
  check('worker (phone): project page has no Angebote tab', (await page.getByRole('tab', { name: /Angebote/ }).count()) === 0);
  await page.getByRole('button', { name: 'Neuer Bericht' }).click();
  const modal = page.locator('.ant-modal:visible');
  await modal.getByLabel('Titel').fill('Mobil: Tagesbericht');
  await modal.getByLabel('Wetter').fill('Regen, 8 °C');
  await modal.getByLabel('Durchgeführte Arbeiten').fill('Material angeliefert und gesichert.');
  await page.screenshot({ path: shots + 'r-phone-report-dialog.png' });
  await modal.getByRole('button', { name: 'OK' }).click();
  await page.waitForSelector('text=Mobil: Tagesbericht');
  await page.getByText('Mobil: Tagesbericht').first().click();
  await page.locator('.ant-modal:visible input[type=file]').setInputFiles(TEST_IMAGE);
  await page.waitForSelector('.ant-modal:visible .ant-image img');
  check('worker (phone): created a report and attached a photo', true);
  await page.screenshot({ path: shots + 'r-phone-report-photo.png' });
  check('worker (phone): report dialog fits the screen', await page.evaluate(() => { const r = document.querySelector('.ant-modal-content').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1; }));
  await page.context().close();
}

// phone: a worker uses the stopwatch and books time manually
{
  const page = await newPage({ width: 390, height: 844 }, true);
  await login(page, 'm.yilmaz@dachdecker-schmidt.example');
  await page.getByRole('button', { name: 'Menü' }).click();
  await page.getByRole('menuitem', { name: 'Zeiten' }).click();
  await page.waitForSelector('[data-testid=week-total]');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.waitForSelector('text=Zeiterfassung läuft');
  check('worker (phone): stopwatch started', true);
  check('worker (phone): time page fits the screen width', await fitsWidth(page));
  await page.screenshot({ path: shots + 'r-phone-timer.png' });
  await page.getByRole('button', { name: 'Stopp' }).click();
  await page.waitForSelector('.ant-message-success:has-text("Gestoppt")');
  await page.getByRole('button', { name: 'Zeit erfassen' }).click();
  await page.waitForSelector('.ant-modal:visible');
  const box = await page.locator('.ant-modal:visible .ant-modal-content').boundingBox();
  check('worker (phone): time dialog fits the screen', !!box && box.x >= 0 && box.x + box.width <= 391);
  await page.screenshot({ path: shots + 'r-phone-time-dialog.png' });
  await page.context().close();
}

const real = errors.filter((e) => !/favicon|DevTools/i.test(e));
check('no browser console errors', real.length === 0, real.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
