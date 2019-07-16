const handleRequest = require('./src');

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
