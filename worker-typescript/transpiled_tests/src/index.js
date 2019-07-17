"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event.request));
});
async function handleRequest(request) {
    return new Response("Hello worker!");
}
exports.handleRequest = handleRequest;
//# sourceMappingURL=index.js.map