import { test } from 'uvu';
import * as assert from 'uvu/assert';
import mock from 'service-worker-mock';
import handler from '../src/down.js';

test.before(() => {
	Object.assign(globalThis, mock());
});

/**
 * @param {number} [num]
 * @returns {Promise<Response>}
 */
async function run(num) {
	let url = 'https://x.com/down';
	if (num != null) url += '?bytes=' + num;
	let req = new Request(url);
	return handler(req);
}

/**
 * @param {Response} res
 * @returns {Promise<string>}
 */
async function read(res) {
	return res.text();
}

test('default bytes', async () => {
	const text = await run().then(read);
	assert.is(text.length, 0);
});

[0, 1, 10, 50, 99].forEach(bytes => {
	test(`low request bytes :: ${bytes}`, async () => {
		const text = await run(bytes).then(read);
		assert.is(text.length, bytes);
	});
});

[100, 1e3, 1e6, 1e7].forEach(bytes => {
	test(`request bytes :: get ${bytes} bytes`, async () => {
		const text = await run(bytes).then(read);
		assert.is(text.length, bytes);
	});
});

test('max bytes', async () => {
	const text = await run(Infinity).then(read);
	assert.is(text.length, 1e8);
});

test('negative bytes', async () => {
	const content = await run(-100).then(read);
	assert.is(content.length, 100);
});

test('includes request time', async () => {
	const { headers } = await run();
	const reqTime = headers.get('cf-meta-request-time');

	assert.ok(reqTime);
	assert.ok(+reqTime <= Date.now());
	assert.ok(+reqTime > Date.now() - 60 * 1000);
});

test.run();
