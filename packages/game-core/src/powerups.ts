import { PLAYER_HEIGHT, PLAYER_WIDTH, type Body, type Pickup } from '@tower/shared';

export const PICKUP_RESPAWN_SECONDS = 30;
export function touchesPickup(body: Body, pickup: Pick<Pickup, 'x' | 'y'>): boolean {
  return Math.abs(body.x - pickup.x) <= PLAYER_WIDTH / 2 + 5 && body.y <= pickup.y + 5 && body.y + PLAYER_HEIGHT >= pickup.y - 5;
}
export function collectPickup(body: Body, pickup: Pickup): void {
  if (pickup.kind === 'feather') body.feather = 12;
  if (pickup.kind === 'boots') body.boots = true;
  if (pickup.kind === 'bubble') body.bubble = true;
}
