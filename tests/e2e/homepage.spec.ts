import { expect, test } from '@playwright/test';
import { BIOMES } from '@tower/shared';

test('updated homepage previews obstacles and biomes, explains cosmetics, and opens settings and play on mobile', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Toujours plus haut.' })).toBeVisible();
  await page.getByRole('button', { name: 'Réglages', exact: true }).click();
  await page.getByLabel('Réduire les animations').check();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.getByRole('link', { name: 'Nouveautés', exact: true }).click();
  await expect(page).toHaveURL(/#nouveautes$/);
  const preview = page.locator('.mechanism-illustration');
  await expect(preview).toHaveAttribute('data-obstacle', 'moving');
  const tab = page.getByRole('tab', { name: /Navettes bleues/ });
  await tab.focus(); await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('tab', { name: /Dalles friables/ })).toBeFocused();
  await expect(preview).toHaveAttribute('data-obstacle', 'crumble');
  await expect(page.getByRole('tabpanel')).toContainText('1,2 seconde');
  await page.getByRole('tab', { name: /Corniches à pics/ }).click();
  await expect(preview).toHaveAttribute('data-obstacle', 'spikes');
  await expect(page.getByRole('tabpanel')).toContainText('Votre record et vos cosmétiques restent acquis');
  const images = new Set<string>();
  for (const biome of BIOMES) {
    await page.getByRole('button', { name: biome.name, exact: true }).click();
    await expect(preview).toHaveAttribute('data-biome', biome.id);
    await expect.poll(() => preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe([...images].at(-1));
    images.add(await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()));
  }
  expect(images.size).toBe(5);
  await page.getByRole('tab', { name: /Tremplins roses/ }).click();
  await expect(preview).toHaveAttribute('data-obstacle', 'spring');
  await expect(page.locator('.landing-bonus-grid article')).toHaveCount(3);
  await expect(page.locator('.wardrobe-counts')).toContainText('98 accessoires classiques');
  await expect(page.locator('.wardrobe-counts')).toContainText('32 pièces rares');
  await expect(page.locator('.wardrobe-counts')).toContainText('48 couleurs');
  await page.locator('.tower-discovery').screenshot({ path: 'test-results/site-discovery-desktop.png' });
  await page.locator('.landing-wardrobe').screenshot({ path: 'test-results/site-wardrobe-desktop.png' });
  await page.screenshot({ path: 'test-results/site-updated-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Composer ma tenue', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Votre histoire commence ici.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Visage : Lunettes rondes', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => scrollTo(0, 0));
  await page.getByRole('button', { name: 'Ouvrir la navigation' }).click();
  await expect(page.getByRole('button', { name: 'Ouvrir la navigation' })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('link', { name: 'Nouveautés', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ouvrir la navigation' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('tab', { name: /Corniches à pics/ }).click();
  await page.getByRole('button', { name: BIOMES[0].name, exact: true }).click();
  const still = await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.waitForTimeout(150);
  expect(await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(still);
  await page.locator('.tower-discovery').screenshot({ path: 'test-results/site-discovery-mobile.png' });
  await page.screenshot({ path: 'test-results/site-updated-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Régler l’affichage', exact: false }).click();
  await expect(page.getByLabel('Réduire les animations')).toBeChecked();
  await expect(page.getByLabel('Écran bombé', { exact: false })).toBeChecked();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.getByRole('button', { name: 'Jouer en invité', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
  await expect(page.locator('.tower-discovery')).toHaveCount(0);
  expect(errors).toEqual([]);
});
