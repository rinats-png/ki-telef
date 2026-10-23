import { expect, test } from '@playwright/test';
test('smart-routing and Outlook workspace: three end-to-end scenarios with visible mock artifacts', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1500, height: 1050 });
  await page.goto('/login'); await page.getByLabel('Benutzername', { exact: true }).fill('test-disponent'); await page.getByLabel('Passwort', { exact: true }).fill('local-qa-only-passphrase'); await page.getByRole('button', { name: 'Sicher anmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Jeder Anruf. Richtig verbunden.' })).toBeVisible();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/smart-dashboard-desktop.png', fullPage: true, caret: 'initial' });
  await page.getByRole('button', { name: 'Anruf-Simulator', exact: true }).click();
  for (const [scenario, provider] of [['Wespennest am Wohnhaus', 'vapi'], ['Ratten im Restaurantlager', 'retell'], ['Rückfrage zum laufenden Auftrag', 'vapi']]) {
    await page.getByLabel('Simulator-Anbieter').selectOption(provider);
    await page.getByRole('button', { name: new RegExp(scenario) }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
    await expect(dialog.locator('.workflow-steps').getByText('Lokal simuliert', { exact: false })).toHaveCount(3);
    await expect(dialog.getByText('Gesprächsverlauf', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Live-Monitor', exact: true }).click();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(7);
  await page.getByRole('button', { name: 'Outlook-Center', exact: true }).click();
  await page.getByRole('button', { name: /Antwortentwürfe/ }).click();
  await page.locator('.outlook-list-item').filter({ hasText: 'Markus Weber' }).first().click();
  await expect(page.getByText('Entwurf enthält keine Preiszusage', { exact: false })).toBeVisible();
  await expect(page.getByText('Diese Aktion ist nur simuliert', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'test-results/outlook-center.png', fullPage: true, caret: 'initial' });
  await page.getByRole('button', { name: 'Team & Routing', exact: true }).click();
  await page.getByLabel('Verfügbarkeit · manuell gepflegt').first().selectOption('OFFLINE');
  await expect(page.getByLabel('Verfügbarkeit · manuell gepflegt').first()).toHaveValue('OFFLINE');
  await page.getByRole('button', { name: 'Live-Monitor', exact: true }).click();
  await page.getByRole('button', { name: 'Echtdaten', exact: true }).click(); await expect(page.getByText('Noch keine passenden Anrufe')).toBeVisible();
  await page.getByRole('button', { name: 'Anruf-Simulator', exact: true }).click();
  await expect(page.getByRole('button', { name: /Wespennest am Wohnhaus/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Live-Monitor', exact: true }).click();
  await page.getByRole('button', { name: 'Demo', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 }); await expect(page.getByRole('table').getByRole('row')).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/smart-dashboard-mobile.png', fullPage: true, caret: 'initial' });
  expect(errors).toEqual([]);
});
