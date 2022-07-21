import { test } from 'uvu';
import * as assert from 'uvu/assert';
import mock from 'service-worker-mock';
import Worker from '../src/index.js';

test.before(() => {
	Object.assign(globalThis, mock());
});

test('GET /up :: 200', async () => {
	let req = new Request('/up');
	let res = await Worker.fetch(req);
	assert.is(res.status, 200);
});

test('GET /up/ :: 200', async () => {
	let req = new Request('/up/');
	let res = await Worker.fetch(req);
	assert.is(res.status, 200);
});

test('GET /down :: 200', async () => {
	let req = new Request('/down');
	let res = await Worker.fetch(req);
	assert.is(res.status, 200);
});

test('GET /down/ :: 200', async () => {
	let req = new Request('/down/');
	let res = await Worker.fetch(req);
	assert.is(res.status, 200);
});

test('GET / :: 404', async () => {
	let req = new Request('/');
	let res = await Worker.fetch(req);
	assert.is(res.status, 404);
});

test('POST /foobar :: 404', async () => {
	let req = new Request('/foobar', { method: 'POST' });
	let res = await Worker.fetch(req);
	assert.is(res.status, 404);
});

test.run();
