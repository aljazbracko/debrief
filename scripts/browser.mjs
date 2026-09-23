// Development-only CDP transport. No packages, personal profile or keychain.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function browser(extra = []) {
  const binary = process.env.CHROME_BINARY;
  if (!binary) throw Error('Set CHROME_BINARY to a Chrome for Testing or Chromium executable.');
  const profile = mkdtempSync(join(tmpdir(), 'debrief-check-'));
  const child = spawn(binary, ['--headless=new', '--use-mock-keychain', '--password-store=basic', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--metrics-recording-only', '--remote-debugging-pipe', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost', `--user-data-dir=${profile}`, ...extra, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  let id = 0, buffer = '', startupError;
  const pending = new Map();
  child.stderr.on('data', () => {});
  child.on('error', error => { startupError = error; });
  const exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); });
  child.stdio[4].on('data', chunk => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\0')) !== -1) {
      const message = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1);
      const item = pending.get(message.id);
      if (item) { pending.delete(message.id); clearTimeout(item.timer); message.error ? item.reject(Error(JSON.stringify(message.error))) : item.resolve(message.result); }
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    if (startupError) return reject(startupError);
    const messageId = ++id;
    const timer = setTimeout(() => { pending.delete(messageId); reject(Error('Browser command timed out: ' + method)); }, 12000);
    pending.set(messageId, { resolve, reject, timer });
    child.stdio[3].write(JSON.stringify({ id: messageId, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
  const attach = async targetId => (await send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
  const evaluate = async (session, expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, session);
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const close = async () => {
    await send('Browser.close').catch(() => {});
    if (child.exitCode === null) child.kill();
    await exited;
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error('Browser closed')); }
    pending.clear(); rmSync(profile, { recursive: true, force: true });
  };
  return { send, attach, evaluate, close };
}
