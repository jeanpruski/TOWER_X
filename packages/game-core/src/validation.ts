import { DT, type Chunk } from '@tower/shared';
import { createBody, resolvePlayers, stepBody, touchesHazard } from './physics';
import { RoutePilot, isRoutePlatform } from './navigation';
import { Cooperation, CoopPilot } from './cooperation';
import { mechanismPlatforms, TowerMechanisms } from './mechanisms';

export function validateRoute(chunk: Chunk, startTick = 0): { valid: boolean; failedStep?: number; frames: number } {
  const exit = { id: 'exit', x: chunk.exit.x - 32, y: chunk.exit.y, w: 64, h: 8, kind: 'stone' as const };
  const body = createBody('validator'); body.x = chunk.entry.x; body.y = chunk.entry.y; body.protection = 0;
  const pilot = new RoutePilot();
  const mechanisms = new TowerMechanisms();
  for (let frame = 0; frame < 600; frame++) {
    const tick = startTick + frame;
    mechanisms.update([chunk], [body], tick);
    const platforms = [...mechanismPlatforms([chunk], tick, mechanisms.states()), exit];
    stepBody(body, pilot.input(body, platforms, frame), platforms, DT);
    if (touchesHazard(body, [chunk]) || body.y < chunk.entry.y - 20) return { valid: false, frames: frame + 1 };
    if (body.grounded && body.y === chunk.exit.y) return { valid: true, frames: frame + 1 };
  }
  return { valid: false, failedStep: chunk.platforms.filter(p => isRoutePlatform(p) && p.y <= body.y).length, frames: 600 };
}

export function validateCooperativeRoute(chunk: Chunk): { valid: boolean; frames: number; crossed: number } {
  if (!chunk.cooperation) throw new Error('Expected a cooperative chunk');
  const exit = { id: 'exit', x: chunk.exit.x - 32, y: chunk.exit.y, w: 64, h: 8, kind: 'stone' as const };
  const actors = [0, 1].map(i => { const body = createBody(`helper-${i}`); Object.assign(body, { x: chunk.entry.x + i * 18, y: chunk.entry.y, protection: 0 }); return { body, isBot: true, route: new RoutePilot(), coop: new CoopPilot() }; });
  const mechanics = new Cooperation(), crossed = new Set<string>();
  for (let frame = 0; frame < 900; frame++) {
    mechanics.update([chunk], actors, frame);
    const platforms = [...chunk.platforms, exit, ...mechanics.bridges([chunk], frame)];
    const previousY = new Map(actors.map(p => [p.body.id, p.body.y]));
    for (const p of actors) {
      if (crossed.has(p.body.id)) continue;
      const input = p.coop.input(p.body, platforms, actors.map(a => a.body), chunk.cooperation, mechanics.helpers.get(chunk.cooperation.id), frame) ?? p.route.input(p.body, platforms, frame);
      stepBody(p.body, input, platforms, DT);
    }
    resolvePlayers(actors.map(p => p.body), previousY, DT);
    for (const p of actors) {
      if (touchesHazard(p.body, [chunk]) || p.body.y < chunk.entry.y - 20) return { valid: false, frames: frame + 1, crossed: crossed.size };
      if (p.body.grounded && p.body.y >= chunk.exit.y) crossed.add(p.body.id);
    }
    if (crossed.size === 2) return { valid: true, frames: frame + 1, crossed: 2 };
  }
  return { valid: false, frames: 900, crossed: crossed.size };
}
