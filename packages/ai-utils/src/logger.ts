const Logger = (() => {
	let enabled = false;

	const enableLogging = () => {
		enabled = true;
	};

	const disableLogging = () => {
		enabled = false;
	};

	const info = (message: string, data?: any) => {
		if (enabled) {
			console.log(`INFO: ${message}`, data || "");
		}
	};

	const error = (message: string, data?: any) => {
		if (enabled) {
			console.error(`ERROR: ${message}`, data || "");
		}
	};

	const warn = (message: string, data?: any) => {
		if (enabled) {
			console.warn(`WARN: ${message}`, data || "");
		}
	};

	return {
		enableLogging,
		disableLogging,
		info,
		error,
		warn,
	};
})();

export { Logger };
