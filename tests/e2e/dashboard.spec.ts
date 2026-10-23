import { expect, test } from '@playwright/test';
async function login(page: import('@playwright/test').Page) {
  await page.goto('/'); await expect(page).toHaveURL(/login/);
  await page.getByLabel('Benutzername', { exact: true }).fill('test-disponent');
  await page.getByLabel('Passwort', { exact: true }).fill('local-qa-only-passphrase');
  await page.getByRole('button', { name: 'Sicher anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Jeder Anruf. Richtig verbunden.' })).toBeVisible();
  await page.goto('/tickets');
  await expect(page.getByRole('heading', { name: 'Alles im Blick.' })).toBeVisible();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(8);
}
test('dispatch workflow: both provider simulations, transcript, assignment, completion, data isolation', async ({ page }) => {
  const browserErrors: string[] = []; page.on('pageerror', e => browserErrors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true, caret: 'initial' });
  for (const [scenario, provider] of [['Ratten im Restaurant', 'vapi'], ['Wespennest bei Familie', 'retell']]) {
    await page.getByRole('button', { name: 'Test-Anruf simulieren', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(scenario) }).click();
    await page.getByLabel('Webhook-Anbieter').selectOption(provider);
    await page.getByRole('button', { name: 'Test-Anruf starten', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  }
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(10);
  await page.getByRole('button', { name: 'Ticket von Julia Schneider öffnen' }).first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText('Anruferin: Wir haben ein Wespennest', { exact: false })).toBeVisible();
  await drawer.getByLabel('Zuständiger Techniker').selectOption('tech-lena');
  await expect(drawer.getByLabel('Zuständiger Techniker')).toHaveValue('tech-lena');
  await drawer.getByRole('button', { name: 'Als erledigt markieren', exact: true }).click();
  await expect(drawer.getByRole('button', { name: 'Ticket wieder öffnen' })).toBeVisible();
  await page.screenshot({ path: 'test-results/ticket-detail.png', fullPage: true, caret: 'initial' });
  await drawer.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.getByRole('button', { name: 'Echtdaten', exact: true }).click();
  await expect(page.getByText('Platz für den nächsten Anruf.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Test-Anruf simulieren', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Demo', exact: true }).click();
  await page.getByLabel('Anfragen durchsuchen').fill('kein-treffer-123');
  await expect(page.getByText('Keine passenden Anfragen')).toBeVisible();
  await page.getByLabel('Anfragen durchsuchen').fill('');
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(10);
  await page.reload(); await expect(page.getByRole('table').getByRole('row')).toHaveCount(10);
  await page.getByRole('button', { name: 'Abmelden' }).click(); await expect(page).toHaveURL(/login/);
  expect(browserErrors).toEqual([]);
});
test('mobile: login, list and keyboard-accessible detail', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByLabel('Benutzername', { exact: true }).fill('test-disponent');
  await page.getByLabel('Passwort', { exact: true }).fill('local-qa-only-passphrase');
  await page.getByRole('button', { name: 'Sicher anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Jeder Anruf. Richtig verbunden.' })).toBeVisible();
  await page.goto('/tickets');
  await expect(page.getByRole('heading', { name: 'Alles im Blick.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Test-Anruf simulieren', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true, caret: 'initial' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Ticket von Julia Schneider öffnen' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
