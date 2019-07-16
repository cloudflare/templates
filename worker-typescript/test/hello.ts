import { handleRequest } from '../src/index'
import { expect } from 'chai';
import 'mocha'

describe('Hello function', () => {
    it('should return hello world', async () => {
        const result = await handleRequest(new Request("/"));
        expect(result).to.equal('Hello World!');
    });
});