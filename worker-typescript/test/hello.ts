import { handleRequest } from '../src/index'
import { expect } from 'chai';


describe('Hello function', () => {
    it('should return hello world', async () => {
        const result = await handleRequest(new Request("/"));
        expect(result).to.equal('Hello worker!');
    });
});