import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { createApp } from '../apps/game-server/src/app';

describe.each(['auto', 'polling'] as const)('Socket.IO %s', socketTransport => {
  let server: Awaited<ReturnType<typeof createApp>>, directory: string, base: string;
  const sockets: Socket[] = [];
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tower-transport-'));
    server = await createApp({ dataFile: join(directory, 'world.json'), secret: 'transport-test-secret-at-least-32-characters', socketTransport, silent: true, bots: 0 });
    await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    await server.close(); await rm(directory, { recursive: true, force: true });
  });

  it('advertises only supported upgrades and exposes the deployment mode', async () => {
    const response = await fetch(`${base}/socket.io/?EIO=4&transport=polling`);
    expect(response.status).toBe(200);
    const packet = await response.text(); expect(packet[0]).toBe('0');
    expect(JSON.parse(packet.slice(1)).upgrades).toEqual(socketTransport === 'polling' ? [] : ['websocket']);
    expect(await (await fetch(`${base}/health`)).json()).toMatchObject({ status: 'ok', socketTransport });
    if (socketTransport === 'polling') {
      const rejected = await fetch(`${base}/socket.io/?EIO=4&transport=websocket`);
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toMatchObject({ code: 0, message: 'Transport unknown' });
    }
  });

  it('requires a valid session over HTTP polling and delivers authenticated game snapshots', async () => {
    const anonymous = io(base, { transports: ['polling'], forceNew: true, reconnection: false }); sockets.push(anonymous);
    const error = await new Promise<Error>(resolve => anonymous.once('connect_error', resolve));
    expect(error.message).toContain('Session expirée'); expect(server.world.online).toBe(0);
    const response = await fetch(`${base}/api/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(response.ok).toBe(true);
    const { profile } = await response.json();
    const socket = io(base, { transports: ['polling'], extraHeaders: { cookie: response.headers.get('set-cookie')!.split(';')[0]! }, forceNew: true, reconnection: false }); sockets.push(socket);
    const snapshot = await new Promise<{ players: { id: string }[] }>((resolve, reject) => {
      socket.once('connect', () => socket.emit('join', { v: 1 }));
      socket.once('snapshot', resolve); socket.once('connect_error', reject);
    });
    expect(snapshot.players.some(player => player.id === profile.id)).toBe(true);
    expect(socket.io.engine.transport.name).toBe('polling');
  });
});
