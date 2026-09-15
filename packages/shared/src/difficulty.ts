/** Altitude bands are shared by generation and the UI; they never depend on a player's record. */
export const DIFFICULTY_LEVELS = [
  { level: 1, fromChunk: 0, name: 'Découverte', hint: 'Appuis larges et petits bonds pour prendre vos marques.', widthBonus: 24, minWidth: 56, riseShift: 0, movingAmplitude: 10, movingPeriod: 6 },
  { level: 2, fromChunk: 5, name: 'Ascension', hint: 'Les marches s’espacent : dosez vos sauts.', widthBonus: 12, minWidth: 44, riseShift: 0, movingAmplitude: 12, movingPeriod: 5.5 },
  { level: 3, fromChunk: 15, name: 'Agilité', hint: 'Appuis plus fins et navettes plus vives.', widthBonus: 4, minWidth: 34, riseShift: 1, movingAmplitude: 16, movingPeriod: 5 },
  { level: 4, fromChunk: 30, name: 'Expert', hint: 'Enchaînez les sauts et les dalles fragiles sans traîner.', widthBonus: -4, minWidth: 26, riseShift: 2, movingAmplitude: 20, movingPeriod: 4.5 },
  { level: 5, fromChunk: 50, name: 'Vertige', hint: 'Sauts précis, navettes rapides et obstacles combinés.', widthBonus: -8, minWidth: 24, riseShift: 3, movingAmplitude: 24, movingPeriod: 4 },
] as const;

export function difficultyAtChunk(index: number) {
  for (let i = DIFFICULTY_LEVELS.length - 1; i >= 0; i--) {
    const level = DIFFICULTY_LEVELS[i]!;
    if (index >= level.fromChunk) return level;
  }
  return DIFFICULTY_LEVELS[0];
}
