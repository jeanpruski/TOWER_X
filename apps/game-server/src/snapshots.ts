import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, Snapshot } from '@tower/shared';

/** One replaceable snapshot per connection, never a backlog of obsolete positions. */
export function latestSnapshots(socket: Socket<ClientToServerEvents, ServerToClientEvents>) {
  let pending: Snapshot | undefined;
  let transport = socket.conn.transport;
  const flush = () => {
    if (!pending || !socket.connected || !transport.writable) return;
    const snapshot = pending; pending = undefined;
    socket.volatile.emit('snapshot', snapshot);
  };
  // Engine.IO emits ready when the next long-poll GET arrives. Run before its
  // buffer flush so reliable events and the newest position share that response.
  // Without this, a stream of profile/effect events can starve volatile snapshots.
  transport.prependListener('ready', flush);
  const upgrade = () => {
    transport.off('ready', flush); transport = socket.conn.transport;
    transport.prependListener('ready', flush); flush();
  };
  socket.conn.on('upgrade', upgrade);
  socket.once('disconnect', () => {
    pending = undefined; transport.off('ready', flush); socket.conn.off('upgrade', upgrade);
  });
  return {
    send(snapshot: Snapshot) { pending = snapshot; flush(); },
    clear() { pending = undefined; },
  };
}
