const Router = require('./router');

const downHandler = require('./down');
const upHandler = require('./up');

async function handleRequest(request) {
  const r = new Router();

  r.get('.*/down', downHandler);
  r.post('.*/up', upHandler);

  return await r.route(request);
}

module.exports = handleRequest;
