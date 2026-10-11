// End-to-end test of the operator back office (/admin) and its effect on the customer app:
// login, dashboard figures, tenant lifecycle (suspend -> login blocked -> activate), plans, monthly invoice
// run, payment booking, support access with banner, protocol, system page, and responsive layout.
// Run after `npm run seed` (see README).
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'fs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const shots = new URL('./shots/', import.meta.url).pathname;
mkdirSync(shots, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

const browser = await chromium.launch();
const errors = [];
function track(page) {
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
}
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
track(page);

// ---- a customer first: the trial banner of the 2nd tenant (trial ends in 9 days)
const customer = await browser.newPage({ viewport: { width: 1400, height: 900 } });
track(customer);
async function customerLogin(p, email) {
  await p.goto(BASE + '/login');
  await p.getByLabel('E-Mail').fill(email);
  await p.getByLabel('Passwort').fill('demo12345');
  await p.getByRole('button', { name: 'Anmelden' }).click();
}
await customerLogin(customer, 'zimmerei@meisterwerk.local');
await customer.waitForSelector('[data-testid=trial-banner]');
check('customer in trial sees the remaining trial days', (await customer.getByTestId('trial-banner').innerText()).includes('Testphase: noch'));

// ---- operator login
await page.goto(BASE + '/admin/login');
await page.getByLabel('E-Mail').fill('admin@meisterwerk.local');
await page.getByLabel('Passwort').fill('falsch-falsch');
await page.getByRole('button', { name: 'Anmelden' }).click();
await page.waitForSelector('.ant-alert-error');
check('wrong operator password is refused', true);
await page.getByLabel('Passwort').fill('admin12345');
await page.getByRole('button', { name: 'Anmelden' }).click();
await page.waitForSelector('[data-testid=stat-mrr]');
check('operator dashboard: 6 customers', (await page.getByTestId('stat-companies').innerText()).includes('6'));
check('operator dashboard: MRR 108,00 € (Business 79 + Starter 29)', (await page.getByTestId('stat-mrr').innerText()).includes('108,00'));
await page.screenshot({ path: shots + '50-admin-dashboard.png', fullPage: true });
await page.goto(BASE + '/admin/companies');
await page.waitForSelector('tbody tr.ant-table-row');
check('customer list shows the 6 tenants', (await page.locator('tbody tr.ant-table-row').count()) === 6);
await page.screenshot({ path: shots + '51-admin-companies.png' });

// ---- the customer app is not reachable with the operator token and vice versa
check('customer app and back office use separate logins', await page.evaluate(() => !localStorage.getItem('meisterwerk.accessToken') && !!localStorage.getItem('meisterwerk.adminToken')));

// ---- suspend -> login blocked -> activate
await page.locator('tr:has-text("Zimmerei Beispiel")').click();
await page.waitForSelector('[data-testid=company-suspend]');
await page.getByTestId('company-suspend').click();
await page.getByTestId('company-reason').fill('Rechnung offen (E2E)');
await page.getByTestId('company-reason-ok').click();
await page.waitForSelector('.ant-alert-error:has-text("Rechnung offen (E2E)")');
check('tenant suspended with reason', true);
await page.screenshot({ path: shots + '52-admin-company-drawer.png' });
await customer.reload();
await customer.waitForURL(/\/login/);
check('running customer session is ended immediately after suspension', true);
const other = await browser.newPage({ viewport: { width: 1400, height: 900 } });
track(other);
await customerLogin(other, 'zimmerei@meisterwerk.local');
await other.waitForSelector('.ant-alert-error');
check('suspended customer sees the reason on login', (await other.locator('.ant-alert-error').innerText()).includes('Rechnung offen (E2E)'));
await page.getByTestId('company-activate').click();
await page.waitForSelector('[data-testid=company-suspend]');
await customerLogin(other, 'zimmerei@meisterwerk.local');
await other.waitForSelector('.ant-layout-sider, [aria-label=Menü]');
check('after activation the customer can log in again', true);

// ---- plan change
await page.getByTestId('company-plan').click();
await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: 'Business' }).click();
await page.waitForSelector('.ant-message-success');
await page.waitForFunction(() => document.querySelector('.ant-drawer .ant-select-selection-item')?.textContent?.includes('Business'));
check('plan can be changed', true);
await page.keyboard.press('Escape');

// ---- plans
await page.goto(BASE + '/admin/plans');
await page.waitForSelector('tbody tr.ant-table-row');
check('3 seeded plans listed', (await page.locator('tbody tr.ant-table-row').count()) === 3);
await page.getByTestId('plan-new').click();
await page.getByLabel('Schlüssel (dauerhaft, z. B. business)').fill('e2e-plan');
await page.getByLabel('Name').fill('E2E-Tarif');
await page.getByRole('button', { name: 'Speichern' }).click();
await page.waitForSelector('tr:has-text("E2E-Tarif")');
check('new plan created', true);

// ---- invoices: run, pay, PDF
await page.goto(BASE + '/admin/invoices');
await page.waitForSelector('tbody tr.ant-table-row');
await page.locator('input[aria-label=Abrechnungsmonat]').fill('2026-10');
await page.getByTestId('invoice-run').click();
await page.waitForSelector('[data-testid=invoice-run-result]');
check('invoice run creates the invoice of the paying customer', (await page.getByTestId('invoice-run-result').innerText()).includes('1 Rechnung(en) erstellt'));
await page.getByTestId('invoice-run').click();
await page.waitForFunction(() => document.querySelector('[data-testid=invoice-run-result]')?.textContent?.includes('0 Rechnung(en) erstellt'));
check('a second run does not bill twice', true);
const [download] = await Promise.all([page.waitForEvent('download'), page.locator('tr:has-text("Sanitär"):has-text("Offen") button:has-text("PDF")').click()]);
check('invoice PDF download', readFileSync(await download.path()).subarray(0, 4).toString() === '%PDF');
await page.locator('tr:has-text("Sanitär"):has-text("Offen") button:has-text("Bezahlt")').click();
await page.waitForFunction(() => [...document.querySelectorAll('tr')].filter((row) => row.textContent.includes('Sanitär') && row.textContent.includes('Bezahlt')).length === 2);
check('invoice marked as paid', true);
check('overdue invoice of the suspended customer is highlighted', (await page.locator('tr:has-text("Elektro")').innerText()).includes('Überfällig'));
await page.screenshot({ path: shots + '53-admin-invoices.png' });

// ---- support access with banner
await page.goto(BASE + '/admin/companies');
await page.waitForSelector('tbody tr.ant-table-row');
await page.locator('tr:has-text("Dachdeckerei")').click();
await page.getByTestId('company-support').click();
await page.waitForSelector('[data-testid=support-banner]');
check('support access opens the customer app with a banner', (await page.getByTestId('support-banner').innerText()).includes('Support-Zugriff als Thomas Schmidt'));
check('support session shows the customer data (dashboard)', await page.getByText('Willkommen, Thomas').isVisible());
await page.getByRole('menuitem', { name: 'Kontakte' }).click();
await page.waitForSelector('tbody tr.ant-table-row');
await page.getByTestId('support-banner').getByRole('button', { name: 'Beenden' }).click();
await page.waitForURL(/\/admin\/companies/);
check('ending the support session returns to the back office', true);

// ---- protocol and system
await page.goto(BASE + '/admin/log');
await page.waitForSelector('tbody tr.ant-table-row');
const logText = await page.locator('tbody').innerText();
check('operator protocol lists suspend, activate, support access and invoice run', ['Mandant gesperrt', 'Mandant aktiviert', 'Support-Zugriff', 'Rechnungslauf'].every((text) => logText.includes(text)));
await page.goto(BASE + '/admin/system');
await page.waitForSelector('[data-testid=system-status]');
check('system page shows status OK', (await page.getByTestId('system-status').innerText()).includes('OK'));

// the support access is visible in the customer's own audit log
const chef = await browser.newPage({ viewport: { width: 1400, height: 900 } });
track(chef);
await customerLogin(chef, 'demo@meisterwerk.local');
await chef.getByRole('menuitem', { name: 'Firmenprofil' }).click();
await chef.getByRole('tab', { name: 'Änderungsprotokoll' }).click();
await chef.waitForSelector('tbody tr.ant-table-row');
check('customer sees the support access in its own audit log', (await chef.locator('tbody').innerText()).includes('Support (Vera Betreiber)'));

// ---- responsive: back office pages fit a phone and a tablet
for (const [tag, viewport] of [['phone', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1180 }]]) {
  const p = await browser.newPage({ viewport });
  track(p);
  await p.goto(BASE + '/admin/login');
  await p.getByLabel('E-Mail').fill('admin@meisterwerk.local');
  await p.getByLabel('Passwort').fill('admin12345');
  await p.getByRole('button', { name: 'Anmelden' }).click();
  await p.waitForSelector('[data-testid=stat-mrr]');
  for (const path of ['/admin', '/admin/companies', '/admin/invoices', '/admin/plans', '/admin/log', '/admin/system']) {
    await p.goto(BASE + path);
    await p.waitForTimeout(700);
    check(`${tag} ${path}: fits the screen width`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }
  await p.goto(BASE + '/admin/companies');
  await p.waitForSelector('tbody tr.ant-table-row');
  await p.locator('tbody tr.ant-table-row').first().click();
  await p.waitForSelector('.ant-drawer-content');
  await p.waitForTimeout(700);
  check(`${tag} company drawer fits the screen`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await p.screenshot({ path: shots + `r-${tag}-admin-company.png` });
}

const real = errors.filter((e) => !/favicon|DevTools|HTTP 40[139]|40[139] \(|Failed to load resource: the server responded with a status of 40[139]|HTTP 409|circular references/i.test(e));
check('no unexpected browser console errors', real.length === 0, real.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
