import { handleRequest } from '../src/handler'
import { expect } from 'chai';

describe('Hello function', () => {
    it('should return hello world', async () => {
        const result = await handleRequest(new Request("/"));
        const text = await result.text()
        expect(text).to.equal('Hello worker!');
    });
});