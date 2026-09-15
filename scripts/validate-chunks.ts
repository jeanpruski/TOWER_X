import { generateChunk, validateRoute, validateCooperativeRoute, TEMPLATES } from '@tower/game-core';
let frames = 0, cooperative = 0, motionChecks = 0;
const seen = new Set<string>();
for (const seed of [1, 42, 2026, 0xabcdef, 0xffffffff]) {
  for (let index = 0; index < 200; index++) {
    const chunk = generateChunk(seed, index);
    const result = chunk.cooperation ? validateCooperativeRoute(chunk) : validateRoute(chunk);
    if (chunk.cooperation) cooperative++;
    if (!result.valid) throw new Error(`Unreachable ${chunk.id}, seed=${seed}, index=${index}`);
    seen.add(chunk.id); frames += result.frames;
    const moving = chunk.mechanisms.find(m => m.kind === 'moving');
    if (moving?.kind === 'moving') for (let phase = 0; phase < moving.period; phase += 15) {
      const phased = validateRoute(chunk, phase); motionChecks++; frames += phased.frames;
      if (!phased.valid) throw new Error(`Unreachable moving route ${chunk.id}, seed=${seed}, index=${index}, phase=${phase}`);
    }
  }
}
console.log(`${seen.size}/${TEMPLATES.length + 1} architectures · ${1000 - cooperative} chunks solo + ${cooperative} chunks coopératifs traversés à deux · ${motionChecks} phases de navettes · ${frames} ticks simulés.`);
