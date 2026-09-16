// N0C / Passenger loads a CommonJS startup file. Keep the TypeScript server
// inside this process so Passenger can attach to its HTTP server.
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

async function start() {
  process.chdir(__dirname);
  try {
    process.loadEnvFile(resolve(__dirname, '.env'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  process.env.NODE_ENV ??= 'production';
  // PlanetHoster N0C supports Socket.IO over HTTP long-polling only.
  process.env.SOCKET_IO_TRANSPORT ??= 'polling';

  const { register } = require('tsx/esm/api');
  register();
  await import(pathToFileURL(resolve(__dirname, 'apps/game-server/src/index.ts')).href);
}

start().catch(error => {
  console.error('TOWER X could not start:', error);
  process.exit(1);
});
