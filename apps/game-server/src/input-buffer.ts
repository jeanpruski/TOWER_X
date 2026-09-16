import type { PlayerInput } from '@tower/shared';

/** Keep fresh movement, but retain press/release edges for short jumps and pushes. */
export function bufferInput(queue: PlayerInput[], input: PlayerInput) {
  const last = queue.at(-1);
  if (last && last.jump === input.jump && last.push === input.push && last.grab === input.grab) {
    queue[queue.length - 1] = input;
  } else {
    queue.push(input);
    // A stalled connection or deliberate flood must never leave seconds of stale controls.
    // Normal 30 Hz input still has its button edges; excess alternating presses drop oldest first.
    if (queue.length > 8) queue.shift();
  }
}
