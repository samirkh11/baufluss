// End-to-end smoke test: drives the real UI in headless Chromium against the running dev stack
// (docker compose up -d, backend on :3000, frontend on :5173) and the seeded demo data.
// Run `npm run seed` in backend/ first, then `npm test` here. Screenshots go to e2e/shots/.
// Extend this file (or add *.e2e.mjs files) with every new feature.
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const shots = new URL('./shots/', import.meta.url).pathname;
mkdirSync(shots, { recursive: true });

// 8x8 PNG for upload tests
import { deflateSync } from 'zlib';
function png() {
  const crc = (buf) => { let c, crc = 0xffffffff; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: 8 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(24, 120)])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const TEST_IMAGE = join(mkdtempSync(join(tmpdir(), 'meisterwerk-e2e-')), 'test.png');
writeFileSync(TEST_IMAGE, png());

const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

async function pickOption(label, optionText) {
  const dialog = page.locator('.ant-modal:visible');
  await dialog.getByLabel(label, { exact: true }).click({ force: true });
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: optionText }).first().click();
}

async function closeModal() {
  await page.locator('.ant-modal:visible .ant-modal-close').click();
  await page.waitForSelector('.ant-modal-wrap', { state: 'hidden' });
}

// ---- login
await page.goto(BASE + '/login');
await page.getByLabel('E-Mail').fill('demo@meisterwerk.local');
await page.getByLabel('Passwort').fill('demo12345');
await page.getByRole('button', { name: 'Anmelden' }).click();
await page.waitForURL(BASE + '/');
check('login redirects to dashboard', await page.getByText('Willkommen, Thomas').isVisible());
for (const item of ['Projekte', 'Berichte', 'Kontakte', 'Leistungen & Artikel', 'Firmenprofil', 'Nutzer & Rollen']) {
  check(`menu item "${item}"`, await page.getByRole('menuitem', { name: item }).isVisible());
}

// ---- dashboard (Block 9)
await page.waitForSelector('[data-testid=widget-open-items] .ant-statistic');
await page.waitForTimeout(800);
for (const id of ['open-items', 'liquidity', 'incoming', 'dunning', 'quotes', 'unbilled', 'projects', 'time-approvals', 'timer']) {
  check(`dashboard widget "${id}" is shown`, await page.getByTestId('widget-' + id).isVisible());
}
check('widget "Offene Posten" shows 20.383,56 € open', (await page.getByTestId('widget-open-items').innerText()).includes('20.383,56'));
check('widget "Mahnvorschlag" shows 1 invoice', (await page.getByTestId('widget-dunning').innerText()).includes('1'));
check('widget "Liquidität" has week rows', (await page.getByTestId('liquidity-row').count()) >= 2);
check('widget "Angebote" shows the acceptance rate', (await page.getByTestId('widget-quotes').innerText()).includes('75'));
await page.screenshot({ path: shots + '00-dashboard.png', fullPage: true });
await page.getByTestId('dashboard-edit').click();
await page.getByRole('button', { name: 'Mahnvorschlag ausblenden' }).click();
await page.getByRole('button', { name: 'Zeiten zur Freigabe ausblenden' }).click();
check('widget can be hidden in edit mode', (await page.getByTestId('widget-dunning').count()) === 0);
await page.getByTestId('dashboard-save').click();
await page.waitForSelector('.ant-message-success');
await page.reload();
await page.waitForSelector('[data-testid=widget-open-items] .ant-statistic');
check('hidden widgets stay hidden after reload (layout saved per user)', (await page.getByTestId('widget-dunning').count()) === 0 && (await page.getByTestId('widget-time-approvals').count()) === 0);
await page.getByTestId('dashboard-edit').click();
await page.getByTestId('dashboard-add').click();
await page.getByRole('menuitem', { name: 'Mahnvorschlag' }).click();
check('hidden widget can be added again', (await page.getByTestId('widget-dunning').count()) === 1);
await page.getByRole('button', { name: 'Standard' }).click();
await page.waitForSelector('[data-testid=widget-time-approvals]');
check('"Standard" restores the default arrangement', (await page.getByTestId('widget-time-approvals').count()) === 1 && (await page.getByTestId('dashboard-edit').count()) === 1);

// ---- projects list
await page.getByRole('menuitem', { name: 'Projekte' }).click();
await page.waitForSelector('tbody tr.ant-table-row');
check('project list shows 5 seed projects', (await page.locator('tbody tr.ant-table-row').count()) === 5);
await page.screenshot({ path: shots + '01-projects.png' });
await page.getByRole('tab', { name: 'Pausiert' }).click();
await page.waitForTimeout(600);
check('status filter "Pausiert" -> 1 project', (await page.locator('tbody tr.ant-table-row').count()) === 1);
await page.getByRole('tab', { name: 'Alle' }).click();
await page.getByPlaceholder('Suchen (Name, Nr., Kunde, Ort)').fill('Becker');
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
check('search "Becker" -> 1 project', (await page.locator('tbody tr.ant-table-row').count()) === 1);
await page.getByPlaceholder('Suchen (Name, Nr., Kunde, Ort)').fill('');
await page.keyboard.press('Enter');
await page.waitForTimeout(600);

// ---- project detail
await page.getByRole('link', { name: 'Dachsanierung MFH Hirschstraße 14' }).click();
await page.getByRole('tab', { name: /Berichte \(4\)/ }).click();
await page.waitForSelector('.ant-tabs-tabpane-active tbody tr.ant-table-row');
check('detail shows header + 4 reports', (await page.locator('.ant-tabs-tabpane-active tbody tr.ant-table-row').count()) === 4);
await page.screenshot({ path: shots + '02-project-detail.png' });

// ---- edit project
await page.getByRole('button', { name: 'Bearbeiten' }).click();
const modal = page.locator('.ant-modal:visible');
await modal.getByLabel('Projektname').fill('Dachsanierung MFH Hirschstraße 14 (Test)');
await modal.getByRole('button', { name: 'OK' }).click();
await page.waitForSelector('text=Hirschstraße 14 (Test)');
check('project edit saved', true);
await page.getByRole('button', { name: 'Bearbeiten' }).click();
await page.locator('.ant-modal:visible').getByLabel('Projektname').fill('Dachsanierung MFH Hirschstraße 14');
await page.locator('.ant-modal:visible').getByRole('button', { name: 'OK' }).click();
await page.waitForSelector('.ant-modal', { state: 'hidden' });

// ---- new report in project (with photo)
await page.getByRole('button', { name: 'Neuer Bericht' }).click();
await modal.getByLabel('Titel').fill('E2E Tagesbericht');
await modal.getByLabel('Wetter').fill('Nebel, 9 °C');
await modal.getByLabel('Durchgeführte Arbeiten').fill('Südseite abgedeckt');
await modal.getByRole('button', { name: 'OK' }).click();
await page.waitForSelector('text=Berichte (5)');
check('report created (count 5)', true);
await page.getByRole('link', { name: 'E2E Tagesbericht' }).or(page.getByText('E2E Tagesbericht')).first().click();
await page.locator('.ant-modal:visible input[type=file]').setInputFiles(TEST_IMAGE);
await page.waitForSelector('.ant-modal:visible .ant-image img');
check('report photo uploaded + visible', (await page.locator('.ant-modal:visible .ant-image img').count()) === 1);
await page.screenshot({ path: shots + '03-report-modal.png' });
await closeModal();

// ---- global reports page
await page.getByRole('menuitem', { name: 'Berichte' }).click();
await page.waitForSelector('tbody tr.ant-table-row');
check('reports page lists 9 reports', (await page.locator('tbody tr.ant-table-row').count()) === 9);
await page.locator('.ant-select').first().click();
await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: 'Mängelbericht' }).click();
await page.waitForTimeout(600);
check('type filter Mängelbericht -> 1', (await page.locator('tbody tr.ant-table-row').count()) === 1);
// new report from global page requires project
await page.getByRole('button', { name: 'Neuer Bericht' }).click();
await modal.getByLabel('Titel').fill('Globaler Bericht');
await modal.getByRole('button', { name: 'OK' }).click();
await page.waitForTimeout(400);
check('global report requires project (validation)', await page.getByText('Bitte ein Projekt wählen').isVisible());
await closeModal();

// ---- new project from list
await page.getByRole('menuitem', { name: 'Projekte' }).click();
await page.getByRole('button', { name: 'Neues Projekt' }).click();
await modal.getByLabel('Projektname').fill('E2E Neubau Carport');
await pickOption('Kunde', 'Gemeinde Blaustein');
await modal.getByLabel('Ort').fill('Blaustein');
await pickOption('Projektleiter', 'Thomas Schmidt');
await modal.getByRole('button', { name: 'OK' }).click();
await page.waitForURL(/\/projects\/.+/);
await page.waitForSelector('h3');
check('new project -> detail with auto number P-0006', await page.locator('h3', { hasText: 'P-0006' }).isVisible());
await page.screenshot({ path: shots + '04-new-project.png' });
// delete it again
await page.getByRole('button', { name: 'Löschen' }).click();
await page.getByRole('button', { name: 'OK' }).click();
await page.waitForURL(BASE + '/projects');
check('project deleted', true);

// ---- contacts: image
await page.getByRole('menuitem', { name: 'Kontakte' }).click();
await page.waitForSelector('tbody tr.ant-table-row');
await page.locator('tbody a', { hasText: 'Stefan Becker' }).click();
await page.locator('.ant-modal:visible input[type=file]').setInputFiles(TEST_IMAGE);
await page.waitForTimeout(800);
const avatarSrc = await page.locator('.ant-modal:visible .ant-avatar img').getAttribute('src');
check('contact image replaced (png)', avatarSrc?.endsWith('.png') ?? false, avatarSrc ?? '');
await page.screenshot({ path: shots + '05-contact-modal.png' });
await closeModal();

// ---- catalog gallery
await page.getByRole('menuitem', { name: 'Leistungen & Artikel' }).click();
await page.getByRole('tab', { name: 'Artikel' }).click();
await page.waitForSelector('tbody tr.ant-table-row');
await page.locator('tbody a', { hasText: 'Tondachziegel Falzziegel' }).click();
const before = await page.locator('.ant-modal:visible .ant-image img').count();
await page.locator('.ant-modal:visible input[type=file]').setInputFiles(TEST_IMAGE);
await page.waitForFunction((n) => document.querySelectorAll('.ant-modal .ant-image img').length > n, before);
check(`catalog gallery gained an image (${before} -> ${before + 1})`, true);
await page.screenshot({ path: shots + '06-catalog-modal.png' });
await closeModal();

// ---- users edit
await page.getByRole('menuitem', { name: 'Nutzer & Rollen' }).click();
await page.waitForSelector('tbody tr.ant-table-row');
await page.screenshot({ path: shots + '07-users.png' });
await page.locator('tbody a', { hasText: 'Dennis Vogel' }).click();
await modal.getByLabel('Nachname').fill('Vogel-E2E');
await modal.getByRole('button', { name: 'OK' }).click();
await page.waitForSelector('text=Dennis Vogel-E2E');
check('user edited via dialog', true);

// ---- dunning (Block 5, step 4)
await page.goto(BASE + '/invoices');
await page.getByRole('tab', { name: 'Mahnwesen' }).click();
await page.waitForSelector('text=Rechnungen zu mahnen');
await page.waitForSelector('.ant-tabs-tabpane-active tbody tr.ant-table-row');
check('dunning proposals list RE-00003 with next step "1. Mahnung"', (await page.locator('.ant-tabs-tabpane-active tr:has-text("RE-00003")').innerText()).includes('1. Mahnung'));
await page.locator('.ant-tabs-tabpane-active tr:has-text("RE-00003")').getByRole('button', { name: 'Mahnung erstellen' }).click();
await page.waitForSelector('[data-testid=dunning-total]');
check('dunning dialog shows interest, fee and lump sum', (await page.getByRole('dialog', { name: /Mahnung zu/ }).innerText()).includes('Verzugspauschale') && (await page.getByRole('dialog', { name: /Mahnung zu/ }).innerText()).includes('Verzugszinsen'));
await page.getByRole('dialog', { name: /Mahnung zu/ }).getByRole('button', { name: 'Abbrechen' }).click();
await page.goto(BASE + '/invoices');
await page.getByRole('tab', { name: 'Offene Posten' }).click();
await page.waitForSelector('.ant-tabs-tabpane-active tbody tr.ant-table-row');
check('open items show the dunning level of RE-00003', (await page.locator('.ant-tabs-tabpane-active tr:has-text("RE-00003")').innerText()).includes('Zahlungserinnerung'));
await page.locator('.ant-tabs-tabpane-active tr:has-text("RE-00003") a').first().click();
await page.waitForSelector('[data-testid=dunning-card]');
check('invoice shows the seeded reminder MA-0001', (await page.getByTestId('dunning-card').innerText()).includes('MA-0001'));

// ---- payments, open items and cancellation (Block 5, step 3)
await page.goto(BASE + '/invoices');
await page.getByRole('tab', { name: 'Offene Posten' }).click();
await page.waitForSelector('text=Offen gesamt');
await page.waitForSelector('.ant-tabs-tabpane-active tbody tr.ant-table-row');
check('open items: 3 rows (overdue invoice, partly paid invoice, refund)', (await page.locator('.ant-tabs-tabpane-active tbody tr.ant-table-row').count()) === 3);
check('open items total 20.383,56 €', (await page.getByText(/20\.383,56/).count()) > 0);
await page.screenshot({ path: shots + '21-open-items.png' });
await page.getByLabel('Nur überfällige').check();
await page.waitForFunction(() => document.querySelectorAll('.ant-tabs-tabpane-active tbody tr.ant-table-row').length === 1);
check('"only overdue" filter shows RE-00003', (await page.locator('.ant-tabs-tabpane-active tbody tr.ant-table-row').innerText()).includes('RE-00003'));
await page.getByLabel('Nur überfällige').uncheck();
await page.waitForFunction(() => document.querySelectorAll('.ant-tabs-tabpane-active tbody tr.ant-table-row').length === 3);
// book the overdue invoice from the list
await page.locator('.ant-tabs-tabpane-active tr', { hasText: 'RE-00003' }).getByRole('button', { name: 'Zahlung buchen' }).click();
await page.locator('.ant-modal:visible').getByRole('button', { name: 'Buchen' }).click();
await page.waitForSelector('.ant-message-success:has-text("Zahlung gebucht")');
await page.waitForFunction(() => document.querySelectorAll('.ant-tabs-tabpane-active tbody tr.ant-table-row').length === 2);
check('payment booked from the list: RE-00003 is settled and leaves the open items', true);
// partly paid invoice: book and delete a payment in the editor
await page.getByRole('link', { name: 'RE-00004' }).click();
await page.waitForSelector('text=Teilweise bezahlt');
check('invoice RE-00004 shows 7.691,78 € open', (await page.getByTestId('payment-open').innerText()).includes('7.691,78'));
await page.getByRole('button', { name: 'Zahlung erfassen' }).click();
await page.locator('.ant-modal:visible').getByLabel('Betrag (€)').fill('1000');
await page.locator('.ant-modal:visible').getByRole('button', { name: 'Buchen' }).click();
await page.waitForSelector('.ant-message-success:has-text("Zahlung gebucht")');
await page.waitForFunction(() => document.querySelector('[data-testid=payment-open]')?.textContent?.includes('6.691,78'));
check('payment of 1.000 € reduces the open amount to 6.691,78 €', true);
await page.screenshot({ path: shots + '22-invoice-payments.png' });
await page.locator('.ant-card:has-text("Zahlungen") tbody tr', { hasText: '1.000,00' }).getByRole('button', { name: 'Zahlung löschen' }).click();
await page.locator('.ant-popover:visible').getByRole('button', { name: 'OK' }).click();
await page.waitForFunction(() => document.querySelector('[data-testid=payment-open]')?.textContent?.includes('7.691,78'));
check('the payment can be deleted again', true);
// cancel the paid school invoice RE-00002 -> credit note -> issue
await page.goto(BASE + '/invoices');
await page.waitForSelector('tbody tr.ant-table-row');
await page.getByRole('link', { name: 'RE-00002' }).click();
await page.waitForSelector('text=Zahlungen');
await page.getByRole('button', { name: 'Stornieren' }).click();
await page.locator('.ant-popover:visible').getByRole('button', { name: 'Stornieren' }).click();
await page.waitForURL(/\/credit-notes\/.+/);
await page.waitForSelector('h3:has-text("Stornorechnung")');
check('credit note draft with negative amounts, lines locked', (await page.locator('input[value*="Dachrinne montieren"]').first().isDisabled()) && (await page.getByText(/-4\.389,91/).count()) > 0);
await page.screenshot({ path: shots + '23-credit-note.png' });
await page.getByRole('button', { name: 'Ausstellen' }).first().click();
await page.locator('.ant-popover:visible').getByRole('button', { name: 'Ausstellen' }).click();
await page.waitForSelector('text=Dieses Dokument ist ausgestellt und gesperrt');
check('credit note issued as GS-00002 and shows the refund due', (await page.locator('h3', { hasText: 'GS-00002' }).isVisible()) && (await page.getByText('Zu erstatten').count()) > 0);
await page.goto(BASE + '/invoices');
await page.waitForSelector('tbody tr.ant-table-row');
check('cancelled invoice RE-00002 is shown as "Storniert"', (await page.locator('tr', { hasText: 'RE-00002' }).first().innerText()).includes('Storniert'));
await page.getByRole('tab', { name: 'Stornorechnungen' }).click();
await page.waitForFunction(() => document.querySelectorAll('.ant-tabs-tabpane-active tbody tr.ant-table-row').length === 2);
check('credit note list shows GS-00001 and GS-00002 (no "new" button)', (await page.getByRole('button', { name: /Neue Stornorechnung/ }).count()) === 0);

// ---- quotes (Block 4)
await page.getByRole('menuitem', { name: 'Angebote' }).click();
await page.waitForSelector('tbody tr.ant-table-row');
check('quotes list shows 7 seed quotes', (await page.locator('tbody tr.ant-table-row').count()) === 7);
await page.locator('.ant-select').first().click();
await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: 'Entwurf' }).click();
await page.waitForTimeout(600);
check('status filter "Entwurf" -> 2 quotes', (await page.locator('tbody tr.ant-table-row').count()) === 2);
await page.screenshot({ path: shots + '08-quotes.png' });
// reload to reset the status filter
await page.goto(BASE + '/quotes');
await page.waitForSelector('tbody tr.ant-table-row');
await page.getByRole('link', { name: 'AN-00002' }).click();
await page.waitForSelector('text=Dieses Dokument ist ausgestellt und gesperrt');
check('issued quote is locked (disabled fields)', await page.getByLabel('Betreff').isDisabled());
check('issued quote shows 12 lines and gross total', (await page.locator('tbody tr.ant-table-row').count()) === 12 && (await page.getByText(/42\.305,93/).count()) > 0);
await page.screenshot({ path: shots + '09-quote-locked.png' });

// duplicate -> editable draft, add a catalog line, save, check total, PDF, issue, accept
await page.getByRole('button', { name: 'Duplizieren' }).click();
await page.waitForSelector('h3:has-text("Entwurf")');
check('duplicate opens a new editable draft', !(await page.getByLabel('Betreff').isDisabled()));
await page.locator('.ant-select', { hasText: 'Position aus' }).click();
await page.keyboard.type('L-102');
await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: 'L-102' }).click();
await page.waitForFunction(() => document.querySelectorAll('tbody tr.ant-table-row').length === 13);
const lastRow = page.locator('tbody tr.ant-table-row').last();
await lastRow.locator('input.ant-input-number-input').first().fill('4');
await lastRow.locator('input.ant-input-number-input').first().blur();
await page.getByRole('button', { name: 'Speichern' }).click();
await page.waitForSelector('text=Gespeichert.');
check('draft saved with new line: gross 42.486,81', (await page.getByText(/42\.486,81/).count()) > 0);
await page.screenshot({ path: shots + '10-quote-draft.png' });
const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'PDF' }).click()]);
check('PDF opens in a new tab', true, popup.url());
await popup.close();
await page.getByRole('button', { name: 'Ausstellen' }).first().click();
await page.locator('.ant-popover:visible').getByRole('button', { name: 'Ausstellen' }).click();
await page.waitForSelector('text=Dieses Dokument ist ausgestellt und gesperrt');
check('issuing assigns the next number AN-00006', await page.locator('h3', { hasText: 'AN-00006' }).isVisible());
await page.getByRole('button', { name: 'Angenommen' }).click();
await page.waitForSelector('h3 .ant-tag:has-text("Angenommen")');
check('quote marked as accepted', true);

// conversion chain: accepted quote -> order -> invoice draft
await page.getByRole('button', { name: 'Auftragsbestätigung erstellen' }).click();
await page.waitForURL(/\/orders\/.+/);
await page.waitForSelector('h3:has-text("Auftragsbestätigung")');
check('order draft created from the quote (13 lines, source link)', (await page.locator('tbody tr.ant-table-row').count()) === 13 && (await page.getByText('Erstellt aus:').count()) > 0);
check('order has no "Gültig bis" field', (await page.getByLabel('Gültig bis').count()) === 0);
await page.screenshot({ path: shots + '11-order-draft.png' });
await page.getByRole('button', { name: 'Ausstellen' }).first().click();
await page.locator('.ant-popover:visible').getByRole('button', { name: 'Ausstellen' }).click();
await page.waitForSelector('text=Dieses Dokument ist ausgestellt und gesperrt');
check('order issued with number AB-00003', await page.locator('h3', { hasText: 'AB-00003' }).isVisible());
await page.getByRole('button', { name: 'Rechnung erstellen' }).click();
await page.getByRole('menuitem', { name: 'Gesamtrechnung' }).click();
await page.waitForURL(/\/invoices\/.+/);
await page.waitForSelector('h3:has-text("Rechnung")');
check('invoice draft created from the order, with the invoice details card', (await page.getByText('Rechnungsangaben').count()) > 0 && (await page.getByText('AB-00003').count()) > 0);
await page.waitForSelector('text=Vor dem Ausstellen noch zu klären');
check('pre-issue check lists the optional position', (await page.getByText(/Optionalpositionen sind auf einer Rechnung nicht zulässig/).count()) > 0);
await page.screenshot({ path: shots + '12-invoice-draft.png' });
await page.getByRole('button', { name: 'Ausstellen' }).first().click();
await page.locator('.ant-popover:visible').getByRole('button', { name: 'Ausstellen' }).click();
await page.waitForSelector('.ant-message-error');
check('issuing an incomplete invoice is rejected with the reasons', (await page.locator('.ant-message-error').innerText()).includes('unvollständig'));
await page.waitForTimeout(3500);
// fix: remove the optional line, save, check again, issue
// (line texts are input values, not text content, so match the row by its input)
await page.locator('tbody tr.ant-table-row').filter({ has: page.locator('input[value*="Zwischensparrendämmung"]') }).getByRole('button').last().click();
await page.getByRole('button', { name: 'Speichern' }).click();
await page.waitForSelector('text=Die Rechnung ist vollständig und kann ausgestellt werden.');
check('after removing the optional line the invoice is ready to issue', true);
await page.getByRole('button', { name: 'Ausstellen' }).first().click();
await page.locator('.ant-popover:visible').getByRole('button', { name: 'Ausstellen' }).click();
await page.waitForSelector('text=Dieses Dokument ist ausgestellt und gesperrt');
check('invoice issued with the next gap-free number RE-00005', await page.locator('h3', { hasText: 'RE-00005' }).isVisible());
const [invoicePdf] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'PDF' }).click()]);
check('invoice PDF opens', true, invoicePdf.url());
await invoicePdf.close();
await page.getByRole('menuitem', { name: 'Aufträge' }).click();
await page.waitForSelector('tbody tr.ant-table-row');
check('orders list shows 3 orders', (await page.locator('tbody tr.ant-table-row').count()) === 3);
await page.getByRole('menuitem', { name: /(^|\s)Rechnungen$/ }).click();
await page.waitForSelector('tbody tr.ant-table-row');
check('invoices list shows 8 invoices', (await page.locator('tbody tr.ant-table-row').count()) === 8);
// an order cannot be created twice from the same quote
await page.goto(BASE + '/quotes');
await page.waitForSelector('tbody tr.ant-table-row');
await page.getByRole('link', { name: 'AN-00002' }).click();
await page.waitForSelector('text=Dieses Dokument ist ausgestellt und gesperrt');
check('quote with an order offers only the invoice conversion', (await page.getByRole('button', { name: 'Auftragsbestätigung erstellen' }).count()) === 0 && (await page.getByRole('button', { name: 'Rechnung erstellen' }).count()) === 1);
check('quote lists its follow-up documents', (await page.getByText('Folgedokumente:').count()) > 0);

// project tab: create + delete a draft
await page.getByRole('menuitem', { name: 'Projekte' }).click();
await page.getByRole('link', { name: 'Neueindeckung EFH Familie Becker' }).click();
await page.getByRole('tab', { name: /Angebote/ }).click();
await page.waitForSelector('.ant-tabs-tabpane-active tbody tr.ant-table-row');
check('project tab lists its 2 quotes', (await page.locator('.ant-tabs-tabpane-active tbody tr.ant-table-row').count()) === 2);
await page.getByRole('button', { name: 'Neues Angebot' }).click();
await page.waitForURL(/\/quotes\/.+/);
await page.waitForSelector('h3:has-text("Entwurf")');
check('new quote draft prefilled with project subject', (await page.getByLabel('Betreff').inputValue()) === 'Neueindeckung EFH Familie Becker');
await page.getByRole('button', { name: 'Löschen' }).click();
await page.locator('.ant-popover:visible').getByRole('button', { name: 'OK' }).click();
await page.waitForURL(/\/projects\/.+/);
check('draft deleted, back on project', true);

// ---- GAEB import/export (Block 4, step 3) on the project page
const SAMPLES = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'gaeb-samples');
await page.waitForSelector('.ant-tabs-tabpane-active input[type=file]', { state: 'attached' });
await page.locator('.ant-tabs-tabpane-active input[type=file]').setInputFiles(join(SAMPLES, 'lv-dachsanierung.x83'));
await page.waitForURL(/\/quotes\/.+/);
await page.waitForSelector('text=OZ 02.01.0010');
check('GAEB X83 import: 17 lines with original Ordnungszahlen', (await page.locator('tbody tr.ant-table-row').count()) === 17);
check('GAEB import takes the project label as subject', (await page.getByLabel('Betreff').inputValue()).includes('Dachsanierung Wohnanlage'));
await page.screenshot({ path: shots + '13-gaeb-import.png' });
const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'GAEB-Export' }).click()]);
const exported = readFileSync(await download.path(), 'utf8');
check('GAEB export downloads an .x84 file', download.suggestedFilename().endsWith('.x84'), download.suggestedFilename());
check('GAEB export is X84 and keeps the original numbering', exported.includes('GAEB_DA_XML/DA84/3.3') && exported.includes('RNoPart="0040"') && exported.includes('Tondachziegel eindecken'));
await page.getByRole('button', { name: 'Löschen' }).click();
await page.locator('.ant-popover:visible').getByRole('button', { name: 'OK' }).click();
await page.waitForURL(/\/projects\/.+/);
// GAEB 3.2 file and an invalid file
await page.waitForSelector('.ant-tabs-tabpane-active input[type=file]', { state: 'attached' });
await page.locator('.ant-tabs-tabpane-active input[type=file]').setInputFiles(join(SAMPLES, 'lv-einfach-3.2.x81'));
await page.waitForURL(/\/quotes\/.+/);
await page.waitForSelector('text=Trapezblech-Dach', { state: 'attached' });
check('GAEB 3.2 (X81) import: 3 lines', (await page.locator('tbody tr.ant-table-row').count()) === 3);
await page.getByRole('button', { name: 'Löschen' }).click();
await page.locator('.ant-popover:visible').getByRole('button', { name: 'OK' }).click();
await page.waitForURL(/\/projects\/.+/);
const badFile = join(mkdtempSync(join(tmpdir(), 'meisterwerk-e2e-')), 'kaputt.x83');
writeFileSync(badFile, '<html><body>kein GAEB</body></html>');
await page.waitForSelector('.ant-tabs-tabpane-active input[type=file]', { state: 'attached' });
await page.locator('.ant-tabs-tabpane-active input[type=file]').setInputFiles(badFile);
await page.waitForSelector('.ant-message-error');
check('invalid GAEB file shows an error and stays on the page', (await page.locator('.ant-message-error').innerText()).includes('GAEB') && /\/projects\//.test(page.url()));

// ---- partial and final invoice (Block 5, step 2) on order AB-00002
await page.goto(BASE + '/orders');
await page.waitForSelector('tbody tr.ant-table-row');
await page.getByRole('link', { name: 'AB-00002' }).click();
await page.waitForSelector('text=Dieses Dokument ist ausgestellt und gesperrt');
await page.getByRole('button', { name: 'Rechnung erstellen' }).click();
await page.waitForTimeout(600);
await page.getByRole('menuitem', { name: /Abschlagsrechnung/ }).click();
await page.waitForSelector('.ant-modal:visible');
await page.screenshot({ path: shots + '18-partial-dialog.png' });
await page.locator('.ant-modal:visible').getByRole('button', { name: 'Erstellen' }).click();
await page.waitForURL(/\/invoices\/.+/);
await page.waitForSelector('h3:has-text("Abschlagsrechnung Nr. 1")');
check('partial invoice draft: 30 % of the order as one lump-sum line', (await page.locator('tbody tr.ant-table-row').count()) === 1 && (await page.locator('input[value="Abschlagszahlung Nr. 1"]').count()) > 0);
await page.getByRole('button', { name: 'Ausstellen' }).first().click();
await page.locator('.ant-popover:visible').getByRole('button', { name: 'Ausstellen' }).click();
await page.waitForSelector('text=Dieses Dokument ist ausgestellt und gesperrt');
check('partial invoice issued (RE-00006)', await page.locator('h3', { hasText: 'RE-00006' }).isVisible());
await page.getByRole('link', { name: /Auftragsbestätigung AB-00002/ }).click();
await page.waitForSelector('text=Abrechnung');
check('order shows the billing overview (30 % billed)', (await page.getByText('Abschlagsrechnung Nr. 1').count()) > 0 && (await page.locator('.ant-progress-text').first().innerText()).includes('30'));
await page.screenshot({ path: shots + '19-order-billing.png' });
await page.getByRole('button', { name: 'Rechnung erstellen' }).click();
await page.waitForTimeout(600);
await page.getByRole('menuitem', { name: 'Schlussrechnung' }).click();
await page.waitForURL(/\/invoices\/.+/);
await page.waitForSelector('h3:has-text("Schlussrechnung")');
check('final invoice deducts the partial invoice (line marked "Abzug")', (await page.getByText('Abzug', { exact: true }).count()) > 0);
await page.getByLabel('Sicherheitseinbehalt (%)').fill('5');
await page.getByLabel('Einbehalt fällig am').fill('2031-11-13');
await page.getByRole('button', { name: 'Speichern' }).click();
await page.waitForSelector('text=Die Rechnung ist vollständig und kann ausgestellt werden.');
check('final invoice with retention shows the payable amount', (await page.getByText('Zahlbetrag').count()) > 0);
await page.screenshot({ path: shots + '20-final-invoice.png' });
await page.getByRole('button', { name: 'Ausstellen' }).first().click();
await page.locator('.ant-popover:visible').getByRole('button', { name: 'Ausstellen' }).click();
await page.waitForSelector('text=Dieses Dokument ist ausgestellt und gesperrt');
check('final invoice issued (RE-00007)', await page.locator('h3', { hasText: 'Schlussrechnung RE-00007' }).isVisible());

// ---- incoming invoices (Block 6, step 1)
await page.getByRole('menuitem', { name: 'Eingangsrechnungen' }).click();
await page.waitForSelector('tbody tr.ant-table-row');
check('incoming invoices: 6 seeded rows', (await page.locator('tbody tr.ant-table-row').count()) === 6);
check('incoming invoices: approved amount 3.379,60 € waits for payment', (await page.getByTestId('incoming-to-pay').innerText()).includes('3.379,60'));
await page.screenshot({ path: shots + '30-incoming-list.png' });
await page.locator('tr:has-text("ER-0003")').click();
await page.waitForSelector('iframe[title=Beleg]');
check('incoming invoice detail shows the original PDF and the §13b flag', (await page.locator('.ant-modal-title').innerText()).includes('§ 13b'));
await page.getByTestId('incoming-approve').click();
await page.waitForSelector('text=Beträge sind gesperrt');
check('incoming invoice ER-0003 approved and locked', true);
await page.screenshot({ path: shots + '31-incoming-detail.png' });
await page.getByRole('button', { name: 'Schließen' }).click();
check('list shows ER-0003 as "Freigegeben"', (await page.locator('tr:has-text("ER-0003")').innerText()).includes('Freigegeben'));
// upload a new file, capture, approve
const pdfFile = join(dirname(TEST_IMAGE), 'lieferant.pdf');
writeFileSync(pdfFile, '%PDF-1.4\n% e2e incoming invoice ' + Date.now() + '\n%%EOF\n');
await page.locator('input[type=file]').setInputFiles(pdfFile);
await page.waitForSelector('.ant-modal-title:has-text("ER-0007")');
check('upload creates ER-0007 in status "Zu prüfen"', (await page.locator('.ant-modal-title').innerText()).includes('Zu prüfen'));
await page.getByTestId('incoming-approve').click();
await page.waitForSelector('text=Zum Freigeben fehlt noch');
check('approval of an incomplete invoice is refused with the missing items', true);
await page.getByTestId('incoming-invoice-number').fill('E2E-100');
await page.getByTestId('incoming-invoice-date').fill('2026-10-08');
await page.getByTestId('incoming-net').fill('100');
await page.getByTestId('incoming-vat').fill('19');
check('gross is computed from net + VAT (119,00)', (await page.getByTestId('incoming-gross').inputValue()).includes('119'));
await page.getByTestId('incoming-supplier').click({ force: true });
await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: 'Tondach' }).first().click();
await page.getByTestId('incoming-project').click({ force: true });
await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: 'P-0002' }).first().click();
await page.getByTestId('incoming-approve').click();
await page.waitForSelector('text=Beträge sind gesperrt');
check('captured upload approved with project assignment', true);
await page.getByRole('button', { name: 'Als bezahlt markieren' }).click();
await page.getByRole('button', { name: 'Bezahlt', exact: true }).click();
await page.waitForSelector('.ant-alert:has-text("Bezahlt am")');
check('approved invoice marked as paid', true);
await page.getByRole('button', { name: 'Schließen' }).click();
// same file again is rejected
await page.locator('input[type=file]').setInputFiles(pdfFile);
await page.waitForSelector('.ant-message-error:has-text("bereits hochgeladen")');
check('uploading the same file twice is refused', true);

// ---- time tracking (Block 10), office view
await page.getByRole('menuitem', { name: 'Zeiten' }).click();
await page.waitForSelector('[data-testid=week-total]');
check('time page shows the stopwatch card', await page.getByRole('button', { name: 'Start' }).isVisible());
await page.goto(BASE + '/time?week=2026-10-05');
await page.waitForSelector('[data-testid=time-entry]');
check('own week 05.10.: chef booked 2:00 Std.', (await page.getByTestId('week-total').innerText()).includes('2:00'));
await page.locator('.ant-select', { hasText: 'Meine Zeiten' }).click();
await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: 'Alle Mitarbeiter' }).click();
await page.waitForFunction(() => document.querySelector('[data-testid=week-total]')?.textContent?.includes('138:00'));
check('all employees, week 05.10.: 138:00 Std.', true);
await page.screenshot({ path: shots + '14-time-week.png' });
// manual entry for a Saturday, then delete it again
await page.getByRole('button', { name: 'Zeit erfassen' }).click();
const timeModal = page.locator('.ant-modal:visible');
await timeModal.getByLabel('Datum').fill('2026-10-10');
await timeModal.getByLabel('Beginn').fill('08:00');
await timeModal.getByLabel('Ende').fill('10:30');
await timeModal.getByLabel('Pause (Min.)').fill('0');
await timeModal.getByLabel('Tätigkeit').fill('E2E-Test-Eintrag');
await timeModal.getByRole('button', { name: 'Speichern' }).click();
await page.waitForSelector('text=E2E-Test-Eintrag');
check('manual time entry saved (week 140:30 Std.)', (await page.getByTestId('week-total').innerText()).includes('140:30'));
// overlapping entry is rejected
await page.getByRole('button', { name: 'Zeit erfassen' }).click();
await timeModal.getByLabel('Datum').fill('2026-10-10');
await timeModal.getByLabel('Beginn').fill('09:00');
await timeModal.getByLabel('Ende').fill('10:00');
await timeModal.getByLabel('Pause (Min.)').fill('0');
await timeModal.getByRole('button', { name: 'Speichern' }).click();
await page.waitForSelector('.ant-message-error');
check('overlapping time entry is rejected', (await page.locator('.ant-message-error').innerText()).includes('überschneidet'));
// (the error toast can cover the dialog's close icon, so use the Cancel button)
await timeModal.getByRole('button', { name: 'Abbrechen' }).click();
await page.waitForTimeout(600);
await page.locator('[data-testid=time-entry]', { hasText: 'E2E-Test-Eintrag' }).getByRole('button', { name: 'Löschen' }).click();
await page.locator('.ant-popover:visible').getByRole('button', { name: 'OK' }).click();
await page.waitForFunction(() => !document.body.innerText.includes('E2E-Test-Eintrag'));
check('time entry deleted', true);
// stopwatch
await page.goto(BASE + '/time');
await page.getByPlaceholder('Tätigkeit (optional)').fill('E2E-Timer');
await page.getByRole('button', { name: 'Start' }).click();
await page.waitForSelector('text=Zeiterfassung läuft');
check('stopwatch running', await page.getByTestId('timer-elapsed').isVisible());
await page.screenshot({ path: shots + '15-timer-running.png' });
await page.getByRole('button', { name: 'Stopp' }).click();
await page.waitForSelector('.ant-message-success:has-text("Gestoppt")');
await page.waitForSelector('text=E2E-Timer');
check('stopwatch stopped and the entry is listed', true);
// evaluation
await page.getByRole('tab', { name: 'Auswertung' }).click();
await page.getByLabel('Von', { exact: true }).fill('2026-09-01');
await page.getByLabel('Bis', { exact: true }).fill('2026-10-11');
await page.waitForSelector('text=452,0');
check('evaluation: P-0001 has 452,0 Std.', true);
check('evaluation: P-0002 shows planned hours 24', (await page.locator('tr:has-text("P-0002")').first().innerText()).includes('24'));
await page.screenshot({ path: shots + '16-time-report.png' });
await page.getByRole('button', { name: 'Zeitraum freigeben' }).click();
await page.locator('.ant-popover:visible').getByRole('button', { name: 'Freigeben' }).click();
await page.waitForSelector('.ant-message-success:has-text("freigegeben")');
await page.getByRole('button', { name: 'Freigabe aufheben' }).click();
await page.locator('.ant-popover:visible').getByRole('button', { name: 'OK' }).click();
await page.waitForSelector('.ant-message-success:has-text("aufgehoben")');
check('period can be released and reopened', true);
const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV-Export' }).click()]);
const csvText = readFileSync(await csv.path(), 'utf8');
check('CSV export has the expected header', csv.suggestedFilename().endsWith('.csv') && csvText.includes('Datum;Mitarbeiter;Projekt-Nr.'), csv.suggestedFilename());
// project tab
await page.goto(BASE + '/projects');
await page.waitForSelector('tbody tr.ant-table-row');
await page.getByRole('link', { name: 'Dachsanierung MFH Hirschstraße 14' }).click();
await page.getByRole('tab', { name: 'Zeiten' }).click();
await page.waitForSelector('text=Gebuchte Arbeitszeit');
check('project tab "Zeiten" shows 452,0 Std.', (await page.getByText('452,0').count()) > 0);
await page.screenshot({ path: shots + '17-project-time.png' });

// ---- worker view: no admin controls
await page.getByTitle('Abmelden').click();
await page.getByLabel('E-Mail').fill('l.bauer@dachdecker-schmidt.example');
await page.getByLabel('Passwort').fill('demo12345');
await page.getByRole('button', { name: 'Anmelden' }).click();
await page.getByRole('menuitem', { name: 'Projekte' }).click();
await page.waitForSelector('tbody tr.ant-table-row');
check('worker sees no "Neues Projekt" button', (await page.getByRole('button', { name: 'Neues Projekt' }).count()) === 0);
await page.getByRole('menuitem', { name: 'Nutzer & Rollen' }).click();
await page.waitForSelector('tbody tr.ant-table-row');
check('worker sees no document menu items', (await page.getByRole('menuitem', { name: /Angebote|Aufträge|Rechnungen/ }).count()) === 0);
await page.goto(BASE + '/time?week=2026-10-05');
await page.waitForSelector('[data-testid=week-total]');
check('worker sees the time page without evaluation tab and employee filter', (await page.getByRole('tab', { name: 'Auswertung' }).count()) === 0 && (await page.locator('.ant-select', { hasText: 'Meine Zeiten' }).count()) === 0);
check('worker sees only own times (2:00 Std. in week 05.10.)', (await page.getByTestId('week-total').innerText()).includes('2:00'));
await page.getByRole('button', { name: 'Zeit erfassen' }).click();
await page.locator('.ant-modal:visible').getByLabel('Datum').fill('2026-08-10');
await page.locator('.ant-modal:visible').getByRole('button', { name: 'Speichern' }).click();
await page.waitForSelector('.ant-message-error');
check('worker cannot book into a released period', (await page.locator('.ant-message-error').innerText()).includes('freigegeben'));
await page.locator('.ant-modal:visible .ant-modal-close').click();
await page.getByRole('menuitem', { name: 'Nutzer & Rollen' }).click();
await page.waitForSelector('tbody tr.ant-table-row');
await page.goto(BASE + '/');
await page.waitForSelector('[data-testid=widget-timer]');
check('worker dashboard shows only the general widgets', (await page.getByTestId('widget-timer').isVisible()) && (await page.getByTestId('widget-projects').isVisible()) && (await page.getByTestId('widget-open-items').count()) === 0);
check('worker sees no "Nutzer einladen" button', (await page.getByRole('button', { name: 'Nutzer einladen' }).count()) === 0);

// the invalid-GAEB-file and overlapping-time checks above intentionally provoke HTTP 400/403/409 (also the rejected issuing of an incomplete invoice)
const real = errors.filter((e) => !/favicon|DevTools|import-gaeb|finalize|circular references|incoming-invoices\/[^ ]*\/approve|400 \(Bad Request\)|409 \(Conflict\)|HTTP 409|HTTP 403|403 \(Forbidden\)/i.test(e));
check('no browser console errors', real.length === 0, real.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
