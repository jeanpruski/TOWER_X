// Temporary N0C diagnostic launcher: copy over the application root's
// towerx-start.cjs, alongside project/. Restore the normal launcher afterwards.
const { appendFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { format } = require('node:util');

const logFile = resolve(__dirname, 'towerx-startup.log');
const originalError = console.error.bind(console);

function record(message) {
  let safe = String(message);
  for (const key of ['DATABASE_URL', 'SESSION_SECRET']) {
    const value = process.env[key];
    if (value) safe = safe.split(value).join('[redacted]');
  }
  safe = safe.replace(/(postgres(?:ql)?:\/\/)[^\s/@]+@/gi, '$1[redacted]@');
  try {
    appendFileSync(logFile, `${new Date().toISOString()} pid=${process.pid} ${safe}\n`, { mode: 0o600 });
  } catch (error) {
    originalError('Cannot write TOWER X startup diagnostic:', error.code);
  }
}

record(`Starting ${__filename}; Node ${process.version}; executable ${process.execPath}; cwd ${process.cwd()}; Passenger ${Boolean(global.PhusionPassenger)}`);
console.error = (...args) => {
  record(format(...args));
  originalError(...args);
};
// Observe fatal errors without changing Node's failure/exit behavior.
process.on('uncaughtExceptionMonitor', error => record(error.stack || error));
process.on('exit', code => record(`Process exited with code ${code}`));

require('./project/app.cjs');
