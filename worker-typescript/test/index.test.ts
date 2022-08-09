import { worker } from '../src/index';

test('GET /', async () => {
	const req = new Request('http://falcon', { method: 'GET' });
	const result = await worker.fetch(req);
	expect(result.status).toBe(200);

	const text = await result.text();
	expect(text).toBe('request method: GET');
});
