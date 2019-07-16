const fetch = require('@dollarshaveclub/node-fetch');
const Request = fetch.Request;
const Response = fetch.Response;

const handleRequest = require('./index');

beforeAll(async () => {
  Object.assign(global, { Response });
});

describe('speedtest-down', () => {
  const getResponse = async numBytes => {
    const url = new URL(
      `https://someurl.com/down${
        numBytes !== undefined ? `?bytes=${numBytes}` : ''
      }`
    );
    return await handleRequest(new Request(url));
  };
  const getContent = async (...params) =>
    await (await getResponse(...params)).text();

  test('default bytes', async () => {
    const content = await getContent();
    expect(content.length).toBeLessThan(100);
  });

  describe('low request bytes', () => {
    [0, 1, 10, 50, 99].forEach(bytes => {
      test(`get ${bytes} bytes`, async () => {
        const content = await getContent(bytes);
        expect(content.length).toBeLessThan(100);
      });
    });
  });

  describe('request bytes', () => {
    [100, 1e3, 1e6, 1e7].forEach(bytes => {
      test(`get ${bytes} bytes`, async () => {
        const content = await getContent(bytes);
        expect(content.length).toBe(bytes);
      });
    });
  });

  test('max bytes', async () => {
    const content = await getContent(Infinity);
    expect(content.length).toBe(1e8);
  });

  test('negative bytes', async () => {
    const content = await getContent(-100);
    expect(content.length).toBe(100);
  });

  test('includes request time', async () => {
    const headers = (await getResponse()).headers;
    const reqTime = headers.get('cf-meta-request-time');

    expect(reqTime).toBeDefined();
    expect(+reqTime).toBeLessThan(+new Date());
    expect(+reqTime).toBeGreaterThan(+new Date() - 60 * 1000);
  });
});

describe('speedtest-up', () => {
  const getResponse = async ({
    numBytes = 0,
    method = 'POST',
    ...other
  } = {}) => {
    const config = { method, ...other };
    if (method === 'POST') {
      config.body = '0'.repeat(numBytes);
      config.headers = { 'content-length': numBytes };
    }

    const req = new Request('https://someurl.com/up', config);
    return await handleRequest(req);
  };
  const getContent = async (...params) =>
    await (await getResponse(...params)).text();

  test('get request', async () => {
    const content = await getContent({ method: 'GET' });
    expect(content.length).toBeGreaterThan(0);
  });

  test('empty post request', async () => {
    const content = await getContent({ numBytes: 0 });
    expect(content.length).toBeGreaterThan(0);
  });

  test('small post request', async () => {
    const content = await getContent({ numBytes: 10 });
    expect(content.length).toBeGreaterThan(0);
  });

  test('large post request', async () => {
    const content = await getContent({ numBytes: 1e8 });
    expect(content.length).toBeGreaterThan(0);
  });

  test('includes request time', async () => {
    const headers = (await getResponse()).headers;
    const reqTime = headers.get('cf-meta-request-time');

    expect(reqTime).toBeDefined();
    expect(+reqTime).toBeLessThan(+new Date());
    expect(+reqTime).toBeGreaterThan(+new Date() - 60 * 1000);
  });
});
