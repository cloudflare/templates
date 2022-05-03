import { test } from 'uvu';
import * as assert from 'uvu/assert';
import mock from 'service-worker-mock';
import handler from '../src/up.js';

test.before(() => {
  Object.assign(globalThis, mock());
});

/**
 * @param {string} method
 * @param {number} [bytes]
 * @returns {Promise<Response>}
 */
function run(method, bytes = 0) {
  /** @type {RequestInit} */
  const config = { method };

  if (method === 'POST') {
    config.body = '0'.repeat(bytes);
    config.headers = {
      'content-length': String(bytes),
    };
  }

  return handler(new Request('https://x.com/up', config));
}

/**
 * @param {Response} res
 * @returns {Promise<string>}
 */
async function read(res) {
  return res.text();
}

test('get request', async () => {
  const res = await run('GET');
  assert.is(await read(res), 'OK');
  assert.is(res.status, 200);
});

test('empty post request', async () => {
  const res = await run('POST', 0);
  assert.is(await read(res), 'OK');
  assert.is(res.status, 200);
});

test('small post request', async () => {
  const res = await run('POST', 10);
  assert.is(await read(res), 'OK');
  assert.is(res.status, 200);
});

test('large post request', async () => {
  const res = await run('POST', 1e8);
  assert.is(await read(res), 'OK');
  assert.is(res.status, 200);
});

test('includes request time', async () => {
  const { headers } = await run('POST');
  const reqTime = headers.get('cf-meta-request-time');

  assert.ok(reqTime);
  assert.ok(+reqTime <= Date.now());
  assert.ok(+reqTime > Date.now() - 60 * 1000);
});

test.run();
