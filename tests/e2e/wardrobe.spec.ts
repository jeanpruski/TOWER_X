import { test, expect, type Page } from '@playwright/test';
import { BIOMES, COMMON_FACE_STYLES, FACE_STYLES, RARE_COSMETICS, RARE_SHOES, HEAD_STYLES, MASK_NAMES, HAT_NAMES, COMMON_SHOES, SHOE_NAMES, COMMON_HATS } from '@tower/shared';
import { generateChunk } from '@tower/game-core';

async function collectVisibleCoffer(page: Page, id: string) {
  const collected = await page.evaluate(async id => {
    const pressed = new Set<string>();
    const key = (code: string, down: boolean) => {
      if (pressed.has(code) === down) return;
      down ? pressed.add(code) : pressed.delete(code);
      document.body.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true, cancelable: true }));
    };
    try {
      for (let tick = 0; tick < 280; tick++) {
        const { player: body, relics } = window.towerDebug!.inspect();
        const relic = relics.find(r => r.id === id);
        if (!relic) return true;
        const targetX = relic.x;
        key('ArrowLeft', targetX < body!.x - 2); key('ArrowRight', targetX > body!.x + 2);
        key('Space', body!.grounded ? !body!.jumpHeld : body!.jumpHeld);
        await new Promise(resolve => setTimeout(resolve, 34));
      }
      return false;
    } finally { for (const code of [...pressed]) key(code, false); }
  }, id);
  expect(collected).toBe(true);
}

test('a guest finds a rare, saves it on signup, shows it to another player and can later roll a duplicate', async ({ page, browser }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:5182'); await page.getByRole('button', { name: 'Jouer en invité', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
  const original = (await (await page.request.get('http://localhost:5182/api/auth/me')).json()).profile;
  await page.getByRole('button', { name: 'Garde-robe' }).click();
  await expect(page.getByText('Votre tenue a été tirée au sort.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Visage : Lunettes rondes', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'Masques' }).click();
  await expect(page.getByRole('button', { name: 'Masque : Corbeau', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  const target = Array.from({ length: 4000 }, (_, index) => generateChunk(42, index)).find(c => c.relics.some(r => r.cosmeticId === 'mask:verdant' && r.y - c.entry.y <= 85 && Math.abs(r.x - c.entry.x) <= 75))!;
  await page.evaluate(index => window.towerDebug!.teleportToChunk(index), target.index);
  await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().player!.y)).toBe(target.entry.y);
  await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().relics.some(r => r.cosmeticId === 'mask:verdant'))).toBe(true);
  await expect(page.locator('.world-label[data-kind="rare"]').filter({ hasText: 'Relique rare' })).toBeVisible();
  await page.screenshot({ path: 'test-results/rare-coffer.png', fullPage: true });
  // This seeded coffer sits on an optional rune reachable from the entry ledge.
  // Only normal input events can trigger the authoritative unlock.
  await collectVisibleCoffer(page, target.relics[0]!.id);
  await expect(page.locator('.action-feedback')).toContainText('Masque du lierre débloqué');
  await page.getByRole('button', { name: 'Retour au camp', exact: true }).click();
  await page.getByRole('button', { name: 'Garde-robe' }).click();
  await expect(page.getByText('1 / 32 pièces rares découvertes')).toBeVisible();
  await page.getByRole('button', { name: 'Conserver ma progression avec un compte' }).click();
  await page.getByRole('tab', { name: 'Masques' }).click();
  await page.getByRole('button', { name: 'Masque : Masque du lierre', exact: true }).click();
  await page.getByLabel('Nom d’aventurier').fill('Lierre Rare'); await page.getByLabel('Adresse email').fill(`rare-${Date.now()}@example.test`); await page.getByLabel('Mot de passe').fill('a-strong-password-123');
  await page.getByRole('button', { name: 'Créer mon compte et jouer' }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.towerDebug?.inspect().player?.mask)).toBe('verdant');
  await page.reload(); await page.getByRole('button', { name: 'Reprendre l’ascension', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.towerDebug?.inspect().player?.mask)).toBe('verdant');
  const profile = (await (await page.request.get('http://localhost:5182/api/auth/me')).json()).profile;
  expect(profile).toMatchObject({ id: original.id, mask: 'verdant', unlockedCosmetics: ['mask:verdant'], isGuest: false });
  const observer = await browser.newContext();
  try {
    const remote = await observer.newPage(); remote.on('pageerror', error => errors.push(error.message));
    await remote.goto('http://localhost:5182'); await remote.getByRole('button', { name: 'Jouer en invité', exact: true }).click(); await remote.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
    await expect(remote.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
    await remote.evaluate(index => window.towerDebug!.teleportToChunk(index), profile.lastCamp);
    await expect(remote.locator(`[data-player-id="${original.id}"] .rare-badge`)).toHaveText('◆ RARE');
    await expect.poll(() => remote.evaluate(id => window.towerDebug!.inspect().players.find(p => p.id === id)?.mask, original.id)).toBe('verdant');
    await expect(remote.locator(`.world-label[data-id="player:${original.id}"]`)).toContainText('◆ RARE');
    await remote.screenshot({ path: 'test-results/rare-observed-desktop.png', fullPage: true });
    await remote.setViewportSize({ width: 390, height: 844 });
    expect(await remote.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await remote.screenshot({ path: 'test-results/rare-observed-mobile.png', fullPage: true });
  } finally { await observer.close(); }
  await page.getByRole('button', { name: 'Garde-robe' }).click();
  await page.screenshot({ path: 'test-results/wardrobe-rare-unlocked.png', fullPage: true });
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  const duplicate = Array.from({ length: 4000 }, (_, index) => generateChunk(42, index)).find(c => c.index > target.index && c.relics.some(r => r.cosmeticId === 'mask:verdant' && r.y - c.entry.y <= 85 && Math.abs(r.x - c.entry.x) <= 75))!;
  await page.evaluate(index => window.towerDebug!.teleportToChunk(index), duplicate.index);
  await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().player!.y)).toBe(duplicate.entry.y);
  await expect.poll(() => page.evaluate(id => window.towerDebug!.inspect().relics.some(r => r.id === id), duplicate.relics[0]!.id)).toBe(true);
  await collectVisibleCoffer(page, duplicate.relics[0]!.id);
  await expect(page.locator('.action-feedback')).toContainText('Doublon : Masque du lierre');
  expect((await (await page.request.get('http://localhost:5182/api/auth/me')).json()).profile.unlockedCosmetics).toEqual(['mask:verdant']);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.action-feedback').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/rare-duplicate-mobile.png' });
  await page.reload(); await page.getByRole('button', { name: 'Reprendre l’ascension', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
  await page.evaluate(index => window.towerDebug!.teleportToChunk(index), duplicate.index);
  await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().player!.y)).toBe(duplicate.entry.y);
  const arrivedAt = await page.evaluate(() => window.towerDebug!.inspect().tick);
  await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().tick)).toBeGreaterThan(arrivedAt + 2);
  expect(await page.evaluate(id => window.towerDebug!.inspect().relics.some(r => r.id === id), duplicate.relics[0]!.id)).toBe(false);
  await page.getByRole('button', { name: 'Garde-robe' }).click();
  await expect(page.getByText('1 / 32 pièces rares découvertes')).toBeVisible();

  expect(errors).toEqual([]);
});

test('the expanded wardrobe renders every accessory, filters rare items, and searches without accents', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.getByRole('button', { name: 'Créer un compte', exact: false }).click();
  await expect(page.locator('.wardrobe-colors .color-options button')).toHaveCount(48);
  for (const [slot, count, rares] of [['Visages', 26, 8], ['Masques', 38, 8], ['Coiffes', 46, 8], ['Chaussures', 20, 8]] as const) {
    await page.getByRole('tab', { name: slot }).click();
    if (rares) await page.getByRole('button', { name: 'Tout', exact: true }).click();
    await expect(page.locator('.costume-choice')).toHaveCount(count);
    const images = await page.locator('.costume-choice canvas').evaluateAll(canvases => canvases.map(c => (c as HTMLCanvasElement).toDataURL()));
    expect(new Set(images).size).toBe(count);
    if (rares) await page.getByRole('button', { name: 'Classiques', exact: true }).click();
    await expect(page.locator('.costume-choice')).toHaveCount(count - rares);
    await expect(page.locator('.costume-choice canvas').first()).toHaveCSS('filter', 'none');
    await page.screenshot({ path: `test-results/catalogue-${slot.toLowerCase()}.png`, fullPage: true });
    if (!rares) continue;
    await page.getByRole('button', { name: '◆ Rares', exact: true }).click();
    await expect(page.locator('.costume-choice')).toHaveCount(rares);
    await expect(page.locator('.costume-choice:disabled')).toHaveCount(rares);
    await expect(page.locator('.costume-lock')).toHaveCount(rares);
    for (const canvas of await page.locator('.costume-choice canvas').all()) await expect(canvas).toHaveCSS('filter', 'blur(4px) saturate(0.5)');
    await expect(page.locator('.costume-choice strong').first()).toHaveCSS('filter', 'none');
    await page.screenshot({ path: `test-results/rares-${slot.toLowerCase()}.png`, fullPage: true });
  }
  await page.getByRole('tab', { name: 'Coiffes' }).click();
  await page.getByRole('button', { name: 'Classiques', exact: true }).click();
  await page.getByLabel('Chercher une décoration').fill('beguin');
  await expect(page.locator('.costume-choice')).toHaveCount(1);
  await page.getByRole('button', { name: 'Chapeau : Béguin', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Chapeau : Béguin', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/catalogue-mobile.png', fullPage: true });
  await page.getByRole('tab', { name: 'Visages' }).click();
  await page.getByRole('tab', { name: 'Visages' }).focus(); await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Chaussures' })).toBeFocused();
  await page.keyboard.press('Home'); await expect(page.getByRole('tab', { name: 'Visages' })).toBeFocused();
  await expect(page.locator('.costume-choice')).toHaveCount(FACE_STYLES.length);
  await page.locator('.wardrobe-grid').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/new-faces-mobile.png' });
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  // Contact sheet from the actual shared renderer: both directions, no headwear hiding the new faces.
  const strayBeaks = await page.evaluate(async ({ faces, heads, faceNames, hatNames }) => {
    const modulePath = '/src/game/art.ts'; const { mage } = await import(modulePath);
    const sheet = document.createElement('canvas'); sheet.id = 'cosmetic-contact-sheet'; sheet.width = 960; sheet.height = 900;
    sheet.style.cssText = 'position:fixed;inset:0;z-index:99999;width:960px;height:900px'; document.body.append(sheet);
    const c = sheet.getContext('2d')!; c.fillStyle = '#e9eedf'; c.fillRect(0, 0, sheet.width, sheet.height);
    c.imageSmoothingEnabled = false;
    const tile = document.createElement('canvas'); tile.width = 44; tile.height = 48;
    const t = tile.getContext('2d', { willReadFrequently: true })!; const beaks: string[] = [];
    const looks = [...faces.map(mask => ({ mask, hat: 'bare-head', name: faceNames[mask] })), ...heads.map(hat => ({ mask: 'round-glasses', hat, name: hatNames[hat] }))];
    for (const [index, look] of looks.entries()) {
      const x = index % 6 * 160, y = Math.floor(index / 6) * 180;
      for (const facing of [1, -1]) {
        t.clearRect(0, 0, 44, 48); mage(t, 21, 44, '#bc9bea', 0, facing, false, 'idle', 0, look.mask, look.hat);
        c.drawImage(tile, x + (facing === 1 ? 0 : 78), y, 88, 96);
        if (index < faces.length && facing === 1 && t.getImageData(31, 32, 5, 2).data.some((value, i) => i % 4 === 3 && value > 0)) beaks.push(look.mask);
      }
      t.clearRect(0, 0, 44, 48); mage(t, 21, 44, '#bc9bea', 0, 1, false, 'push', 1, look.mask, look.hat);
      c.drawImage(tile, x + 55, y + 86, 44, 48);
      c.fillStyle = '#344e47'; c.font = '13px sans-serif'; c.textAlign = 'center'; c.fillText(look.name, x + 80, y + 157);
    }
    return beaks;
  }, { faces: [...COMMON_FACE_STYLES], heads: [...HEAD_STYLES], faceNames: MASK_NAMES, hatNames: HAT_NAMES, COMMON_SHOES, SHOE_NAMES, COMMON_HATS });
  expect(strayBeaks).toEqual([]);
  await page.setViewportSize({ width: 1000, height: 940 });
  await page.locator('#cosmetic-contact-sheet').screenshot({ path: 'test-results/new-cosmetics-sheet.png' });
  expect(errors).toEqual([]);
});

test('complete costumes with shoes and independent colors save on signup, update for another player and return after login', async ({ page, browser }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const email = `new-face-${Date.now()}@example.test`;
  await page.goto('http://localhost:5182'); await page.getByRole('button', { name: 'Créer un compte', exact: false }).click();
  await page.getByLabel('Nom d’aventurier').fill('Lunettes Boucles'); await page.getByLabel('Adresse email').fill(email); await page.getByLabel('Mot de passe').fill('a-strong-password-123');
  await page.getByRole('button', { name: 'Visage : Lunettes rondes', exact: true }).click();
  await page.getByRole('tab', { name: 'Coiffes' }).click(); await page.getByRole('button', { name: 'Coiffe : Boucles', exact: true }).click();
  await page.getByRole('button', { name: 'Robe #ef665f', exact: true }).click();
  await page.getByRole('group', { name: 'Élément à colorer' }).getByRole('button', { name: 'Coiffe', exact: true }).click();
  await page.getByRole('button', { name: 'Coiffe #d676ca', exact: true }).click();
  await page.getByRole('tab', { name: 'Chaussures' }).click(); await page.getByRole('button', { name: 'Chaussures : Baskets', exact: true }).click();
  await page.getByRole('group', { name: 'Élément à colorer' }).getByRole('button', { name: 'Chaussures', exact: true }).click();
  await page.getByRole('button', { name: 'Chaussures #55a3e6', exact: true }).click();

  await page.getByRole('button', { name: 'Créer mon compte et jouer' }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.towerDebug?.inspect().player)).toMatchObject({ mask: 'round-glasses', hat: 'curls', color: '#ef665f', shoes: 'sneakers', shoeColor: '#55a3e6', hatColor: '#d676ca' });
  const profile = (await (await page.request.get('http://localhost:5182/api/auth/me')).json()).profile;
  const observer = await browser.newContext();
  try {
    const remote = await observer.newPage(); remote.on('pageerror', error => errors.push(error.message));
    await remote.goto('http://localhost:5182'); await remote.getByRole('button', { name: 'Jouer en invité', exact: true }).click(); await remote.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
    await expect(remote.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
    // Guests start one community camp behind; put the observer beside the account for a visible snapshot.
    await remote.evaluate(index => window.towerDebug!.teleportToChunk(index), profile.lastCamp);
    const remoteCostume = () => remote.evaluate(id => window.towerDebug?.inspect().players.find(p => p.id === id), profile.id);
    await expect.poll(remoteCostume).toMatchObject({ mask: 'round-glasses', hat: 'curls', color: '#ef665f', shoes: 'sneakers', shoeColor: '#55a3e6', hatColor: '#d676ca' });
    await page.getByRole('button', { name: 'Garde-robe' }).click();
    await page.getByRole('button', { name: 'Visage : Robot', exact: true }).click();
    await page.getByRole('tab', { name: 'Coiffes' }).click(); await page.getByRole('button', { name: 'Coiffe : Casque audio', exact: true }).click();
    await page.getByRole('tab', { name: 'Chaussures' }).click(); await page.getByRole('button', { name: 'Chaussures : Palmes', exact: true }).click();
    await page.getByRole('group', { name: 'Élément à colorer' }).getByRole('button', { name: 'Chaussures', exact: true }).click();
    await page.getByRole('button', { name: 'Chaussures #f4d457', exact: true }).click();
    await page.getByRole('group', { name: 'Élément à colorer' }).getByRole('button', { name: 'Coiffe', exact: true }).click();
    await page.getByRole('button', { name: 'Coiffe #55a3e6', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.wardrobe-colors').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/shoes-colors-mobile.png' });
    await page.locator('.wardrobe-grid').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/shoes-mobile.png' });
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await expect(page.getByRole('button', { name: 'Profil enregistré' })).toBeVisible();
    await expect.poll(remoteCostume).toMatchObject({ mask: 'robot', hat: 'headphones', shoes: 'flippers', shoeColor: '#f4d457', hatColor: '#55a3e6', color: '#ef665f' });
    const nearbyAvatar = remote.locator(`[data-player-id="${profile.id}"] canvas`);
    await expect(nearbyAvatar).toBeVisible();
    await remote.screenshot({ path: 'test-results/new-costume-observed.png', fullPage: true });
    await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click(); await page.getByLabel('Adresse email').fill(email); await page.getByLabel('Mot de passe').fill('a-strong-password-123');
    await page.getByRole('button', { name: 'Reprendre l’ascension', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.towerDebug?.inspect().player)).toMatchObject({ mask: 'robot', hat: 'headphones', shoes: 'flippers', shoeColor: '#f4d457', hatColor: '#55a3e6', color: '#ef665f' });
    await expect.poll(remoteCostume).toMatchObject({ mask: 'robot', hat: 'headphones', shoes: 'flippers', shoeColor: '#f4d457', hatColor: '#55a3e6', color: '#ef665f' });
    await page.getByRole('button', { name: 'Garde-robe' }).click(); await expect(page.locator('.wardrobe-preview')).toContainText('Robot');
    await page.getByRole('button', { name: 'Visage : Citrouille', exact: true }).click();
    await page.getByRole('tab', { name: 'Coiffes' }).click(); await page.getByRole('button', { name: 'Coiffe : Tête nue', exact: true }).click();
    await page.getByRole('tab', { name: 'Visages' }).click();
    await page.screenshot({ path: 'test-results/new-faces-desktop.png', fullPage: true });
  } finally { await observer.close(); }
  expect(errors).toEqual([]);
});

test('the tower displays five different environments as altitude changes', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:5182'); await page.getByRole('button', { name: 'Jouer en invité', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
  const images = new Set<string>();
  for (const [index, biome] of BIOMES.entries()) {
    await page.evaluate(index => window.towerDebug!.teleportToChunk(index * 5), index);
    await expect(page.locator('.canvas-label')).toHaveAttribute('data-biome', biome.id);
    await expect(page.locator('.canvas-label')).toContainText(biome.name.toLocaleUpperCase('fr'));
    await page.waitForTimeout(250);
    const shot = await page.locator('.game-frame').screenshot({ path: `test-results/biome-${biome.id}.png` });
    images.add(shot.toString('base64'));
  }
  expect(images.size).toBe(5); expect(errors).toEqual([]);
});

test('shoe shapes animate in both directions and accessory tints leave the other slots and rare signatures intact', async ({ page }) => {
  await page.goto('/');
  const checked = await page.evaluate(async ({ shoes, names, hats }) => {
    const modulePath = '/src/game/art.ts'; const { mage } = await import(modulePath);
    const sheet = document.createElement('canvas'); sheet.id = 'shoe-contact-sheet'; sheet.width = 960; sheet.height = 720;
    sheet.style.cssText = 'position:fixed;inset:0;z-index:99999;width:960px;height:720px'; document.body.append(sheet);
    const c = sheet.getContext('2d')!; c.fillStyle = '#e9eedf'; c.fillRect(0, 0, 960, 720); c.imageSmoothingEnabled = false;
    const tile = document.createElement('canvas'); tile.width = 44; tile.height = 48; const t = tile.getContext('2d', { willReadFrequently: true })!;
    for (const [index, shoe] of shoes.entries()) {
      const x = index % 4 * 240, y = Math.floor(index / 4) * 240;
      for (const [frame, pose] of ['idle', 'run', 'rise', 'fall'].entries()) {
        t.clearRect(0, 0, 44, 48); mage(t, 21, 44, '#ef665f', frame, frame % 2 ? -1 : 1, false, pose, 0, 'round-glasses', 'curls', 0, { shoes: shoe, shoeColor: '#55a3e6', hatColor: '#d676ca' });
        c.drawImage(tile, x + frame * 55, y, 55, 60);
      }
      t.clearRect(0, 0, 44, 48); mage(t, 21, 44, '#ef665f', 0, 1, false, 'idle', 0, 'round-glasses', 'curls', 0, { shoes: shoe, shoeColor: '#55a3e6', hatColor: '#d676ca' });
      c.drawImage(tile, 10, 36, 26, 12, x + 16, y + 85, 208, 96);
      c.fillStyle = '#344e47'; c.font = '15px sans-serif'; c.textAlign = 'center'; c.fillText(names[shoe], x + 120, y + 217);
    }
    const pixels = (hat: string, details = {}) => {
      t.clearRect(0, 0, 44, 48); mage(t, 21, 44, '#ef665f', 0, 1, false, 'idle', 0, 'round-glasses', hat, 0, details);
      return { head: [...t.getImageData(0, 0, 44, 33).data].join(), feet: [...t.getImageData(0, 42, 44, 6).data].join(), body: [...t.getImageData(12, 35, 24, 3).data].join(), all: tile.toDataURL() };
    };
    const before = pixels('curls'), footwear = pixels('curls', { shoes: 'flippers', shoeColor: '#55a3e6' }), tint = pixels('curls', { hatColor: '#55a3e6' });
    const untinted = hats.filter(hat => hat !== 'bare-head' && pixels(hat).head === pixels(hat, { hatColor: '#55a3e6' }).head);
    return { headUnchanged: before.head === footwear.head, feetChanged: before.feet !== footwear.feet, bodyUnchanged: before.body === tint.body, feetUnchanged: before.feet === tint.feet, headChanged: before.head !== tint.head, untinted, rareIntact: pixels('phoenix').all === pixels('phoenix', { hatColor: '#55a3e6' }).all };
  }, { shoes: [...COMMON_SHOES], names: SHOE_NAMES, hats: [...COMMON_HATS] });
  expect(checked).toEqual({ headUnchanged: true, feetChanged: true, bodyUnchanged: true, feetUnchanged: true, headChanged: true, untinted: [], rareIntact: true });
  await page.locator('#shoe-contact-sheet').screenshot({ path: 'test-results/shoe-contact-sheet.png' });
});

test('rare shoes and faces become clear after discovery, save to an account and show the rare badge for shoes alone', async ({ page, browser }) => {
  test.setTimeout(75000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:5182'); await page.getByRole('button', { name: 'Jouer en invité', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect(page.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
  const targets = ['shoes:comet-boots', 'mask:fire-spirit'];
  const chunks = Array.from({ length: 4000 }, (_, index) => generateChunk(42, index));
  for (const id of targets) {
    const target = chunks.find(c => c.relics.some(r => r.cosmeticId === id && r.y - c.entry.y <= 85 && Math.abs(r.x - c.entry.x) <= 75))!;
    await page.evaluate(index => window.towerDebug!.teleportToChunk(index), target.index);
    await expect.poll(() => page.evaluate(() => window.towerDebug!.inspect().player!.y)).toBe(target.entry.y);
    await expect.poll(() => page.evaluate(id => window.towerDebug!.inspect().relics.some(r => r.id === id), target.relics[0]!.id)).toBe(true);
    await collectVisibleCoffer(page, target.relics[0]!.id);
  }
  await page.getByRole('button', { name: 'Retour au camp', exact: true }).click();
  await page.getByRole('button', { name: 'Garde-robe' }).click();
  await expect(page.getByText('2 / 32 pièces rares découvertes')).toBeVisible();
  const face = page.getByRole('button', { name: 'Visage : Esprit de braise', exact: true });
  await expect(face).toBeDisabled(); // Guest customization stays locked, but its discovered art is visible.
  await expect(face.locator('canvas')).toHaveCSS('filter', 'none');
  await expect(face.locator('.costume-lock')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Chaussures' }).click();
  const shoes = page.getByRole('button', { name: 'Chaussures : Foulées de comète', exact: true });
  await expect(shoes.locator('canvas')).toHaveCSS('filter', 'none');
  await expect(page.getByRole('button', { name: 'Chaussures : Patins de givre, verrouillé', exact: true }).locator('canvas')).toHaveCSS('filter', 'blur(4px) saturate(0.5)');
  await page.getByRole('button', { name: 'Conserver ma progression avec un compte' }).click();
  await page.getByRole('button', { name: 'Visage : Lunettes rondes', exact: true }).click();
  await page.getByRole('tab', { name: 'Coiffes' }).click(); await page.getByRole('button', { name: 'Coiffe : Tête nue', exact: true }).click();
  await page.getByRole('tab', { name: 'Chaussures' }).click(); await shoes.click();
  await page.getByRole('group', { name: 'Élément à colorer' }).getByRole('button', { name: 'Chaussures', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Chaussures #55a3e6', exact: true })).toBeDisabled();
  await expect(page.getByText('Ces chaussures rares conservent leurs couleurs et leurs effets caractéristiques.')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '◆ Rares', exact: true }).click();
  await page.locator('.wardrobe-grid').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/rare-shoes-unlocked-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel('Nom d’aventurier').fill('Comète Rare'); await page.getByLabel('Adresse email').fill(`comet-${Date.now()}@example.test`); await page.getByLabel('Mot de passe').fill('a-strong-password-123');
  await page.getByRole('button', { name: 'Créer mon compte et jouer' }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.towerDebug?.inspect().player)).toMatchObject({ mask: 'round-glasses', hat: 'bare-head', shoes: 'comet-boots' });
  const profile = (await (await page.request.get('http://localhost:5182/api/auth/me')).json()).profile;
  const observer = await browser.newContext();
  try {
    const remote = await observer.newPage(); remote.on('pageerror', error => errors.push(error.message));
    await remote.goto('http://localhost:5182'); await remote.getByRole('button', { name: 'Jouer en invité', exact: true }).click(); await remote.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
    await expect(remote.getByText('VOUS ÊTES DANS LA TOUR')).toBeVisible();
    await remote.evaluate(index => window.towerDebug!.teleportToChunk(index), profile.lastCamp);
    await expect.poll(() => remote.evaluate(id => window.towerDebug!.inspect().players.find(p => p.id === id), profile.id)).toMatchObject({ mask: 'round-glasses', hat: 'bare-head', shoes: 'comet-boots' });
    await expect(remote.locator(`[data-player-id="${profile.id}"] .rare-badge`)).toHaveText('◆ RARE');
    await expect(remote.locator(`.world-label[data-id="player:${profile.id}"]`)).toContainText('◆ RARE');
    await remote.screenshot({ path: 'test-results/rare-shoes-observed.png', fullPage: true });
    await page.getByRole('button', { name: 'Garde-robe' }).click(); await face.click();
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Profil enregistré' })).toBeVisible();
    await expect.poll(() => remote.evaluate(id => window.towerDebug!.inspect().players.find(p => p.id === id)?.mask, profile.id)).toBe('fire-spirit');
  } finally { await observer.close(); }
  await page.reload(); await page.getByRole('button', { name: 'Reprendre l’ascension', exact: true }).click(); await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.towerDebug?.inspect().player)).toMatchObject({ mask: 'fire-spirit', shoes: 'comet-boots' });
  expect((await (await page.request.get('http://localhost:5182/api/auth/me')).json()).profile.unlockedCosmetics.sort()).toEqual([...targets].sort());
  expect(errors).toEqual([]);
});

test('every rare has a distinct rendered appearance and rare footwear retains its signature colors', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ rares, shoes }) => {
    const modulePath = '/src/game/art.ts'; const { mage } = await import(modulePath);
    const sheet = document.createElement('canvas'); sheet.id = 'rare-contact-sheet'; sheet.width = 1120; sheet.height = 1040;
    sheet.style.cssText = 'position:fixed;inset:0;z-index:99999;width:1120px;height:1040px'; document.body.append(sheet);
    const c = sheet.getContext('2d')!; c.fillStyle = '#142e30'; c.fillRect(0, 0, sheet.width, sheet.height); c.imageSmoothingEnabled = false;
    const tile = document.createElement('canvas'); tile.width = 52; tile.height = 56; const t = tile.getContext('2d', { willReadFrequently: true })!;
    const images: string[] = [];
    for (const [index, rare] of rares.entries()) {
      const x = index % 8 * 140, y = Math.floor(index / 8) * 260;
      for (const facing of [1, -1]) {
        t.clearRect(0, 0, 52, 56);
        mage(t, 25, 49, '#87c8df', 0, facing, false, 'idle', 0, rare.slot === 'mask' ? rare.item : 'round-glasses', rare.slot === 'hat' ? rare.item : 'bare-head', 0, { shoes: rare.slot === 'shoes' ? rare.item : 'classic' });
        if (facing === 1) images.push(tile.toDataURL());
        c.drawImage(tile, x + 18, y + (facing === 1 ? 4 : 115), 104, 112);
      }
      c.fillStyle = rare.tint; c.font = '12px sans-serif'; c.textAlign = 'center'; c.fillText(rare.name, x + 70, y + 246, 136);
    }
    const renderShoe = (shoe: string, shoeColor: string) => {
      t.clearRect(0, 0, 52, 56); mage(t, 25, 49, '#87c8df', 0, 1, false, 'idle', 0, 'round-glasses', 'bare-head', 0, { shoes: shoe, shoeColor });
      return tile.toDataURL();
    };
    return { unique: new Set(images).size, tintChanges: shoes.filter(shoe => renderShoe(shoe, '#55a3e6') !== renderShoe(shoe, '#ef665f')) };
  }, { rares: [...RARE_COSMETICS], shoes: [...RARE_SHOES] });
  expect(result).toEqual({ unique: 32, tintChanges: [] });
  await page.setViewportSize({ width: 1140, height: 1080 });
  await page.locator('#rare-contact-sheet').screenshot({ path: 'test-results/rare-contact-sheet.png' });
});
