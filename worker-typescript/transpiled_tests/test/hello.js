"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../src/index");
const chai_1 = require("chai");
describe('Hello function', () => {
    it('should return hello world', async () => {
        const result = await index_1.handleRequest(new Request("/"));
        chai_1.expect(result).to.equal('Hello worker!');
    });
});
//# sourceMappingURL=hello.js.map