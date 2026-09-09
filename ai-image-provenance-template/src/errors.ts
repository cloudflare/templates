export type HttpErrorStatus = 400 | 413 | 415 | 500 | 502;

export class HttpError extends Error {
	constructor(
		readonly status: HttpErrorStatus,
		message: string,
	) {
		super(message);
	}
}
