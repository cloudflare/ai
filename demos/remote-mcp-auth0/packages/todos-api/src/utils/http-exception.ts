/**
 * Options for creating an `HTTPException`.
 * @property res - Optional response object to use.
 * @property message - Optional custom error message.
 * @property cause - Optional cause of the error.
 */
type HTTPExceptionOptions = {
	res?: Response;
	message?: string;
	cause?: unknown;
};

export class HTTPException extends Error {
	readonly res?: Response;
	readonly status: number;

	/**
	 * Creates an instance of `HTTPException`.
	 * @param status - HTTP status code for the exception. Defaults to 500.
	 * @param options - Additional options for the exception.
	 */
	constructor(status = 500, options?: HTTPExceptionOptions) {
		super(options?.message, { cause: options?.cause });
		this.res = options?.res;
		this.status = status;
	}

	/**
	 * Returns the response object associated with the exception.
	 * If a response object is not provided, a new response is created with the error message and status code.
	 * @returns The response object.
	 */
	getResponse(): Response {
		if (this.res) {
			const newResponse = new Response(this.res.body, {
				status: this.status,
				headers: this.res.headers,
			});
			return newResponse;
		}
		return new Response(this.message, {
			status: this.status,
		});
	}
}
