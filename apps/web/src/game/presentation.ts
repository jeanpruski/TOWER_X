import type { GameEffect } from '@tower/shared';
export interface VisualEffect { data: GameEffect | { kind: 'land'; id: string; actorId: string; x: number; y: number }; at: number; }
export interface MotionStamp { grounded: boolean; landedAt: number; }
