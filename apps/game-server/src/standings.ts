import { NEIGHBOR_COUNT, PIXELS_PER_METER, heightInMeters, type NearbyStandings, type Standing } from '@tower/shared';

export interface StandingSource {
  id: string; displayName: string; color: Standing['color']; y: number; isBot?: boolean; mask?: Standing['mask']; hat?: Standing['hat']; shoes?: Standing['shoes']; shoeColor?: Standing['shoeColor']; hatColor?: Standing['hatColor'];
}

export function rankPlayers(players: readonly StandingSource[]): StandingSource[] {
  // Use actual altitude, not PB or rounded metres. IDs keep equal heights stable.
  return [...players].sort((a, b) => b.y - a.y || a.id.localeCompare(b.id));
}

export function standingsAround(ranked: readonly StandingSource[], index: number): NearbyStandings {
  const self = ranked[index];
  if (!self) throw new Error('The player must be present in the active ranking.');
  const standing = (player: StandingSource, position: number): Standing => {
    const delta = Math.round((player.y - self.y) / PIXELS_PER_METER * 10) / 10;
    return { id: player.id, displayName: player.displayName, color: player.color, mask: player.mask, hat: player.hat, shoes: player.shoes, shoeColor: player.shoeColor, hatColor: player.hatColor, rank: position + 1, height: heightInMeters(player.y), delta: delta === 0 ? 0 : delta, isBot: Boolean(player.isBot) };
  };
  const start = Math.max(0, index - NEIGHBOR_COUNT);
  return {
    above: ranked.slice(start, index).map((player, offset) => standing(player, start + offset)),
    self: standing(self, index),
    below: ranked.slice(index + 1, index + 1 + NEIGHBOR_COUNT).map((player, offset) => standing(player, index + 1 + offset)),
  };
}
