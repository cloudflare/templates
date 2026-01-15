export default class MarkdownError extends Error {
	public readonly markdown: string;
	constructor(message: string, markdown = message) {
		super(message);
		this.markdown = markdown;
	}
}
