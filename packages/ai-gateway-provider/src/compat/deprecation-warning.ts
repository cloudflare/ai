const warned = new Set<string>();

export function wrapWithDeprecationWarning<T extends (...args: any[]) => any>(
	fn: T,
	oldImport: string,
	newPackage: string,
): T {
	const wrapper = (...args: any[]) => {
		if (!warned.has(oldImport)) {
			warned.add(oldImport);
			console.warn(
				`[ai-gateway-provider] Importing from "${oldImport}" is deprecated. ` +
					`Import directly from "${newPackage}" instead and use createAIGateway() to wrap your provider. ` +
					`This import will be removed in the next major version.`,
			);
		}
		return fn(...args);
	};
	for (const key of Object.keys(fn)) {
		(wrapper as any)[key] = (fn as any)[key];
	}
	return wrapper as unknown as T;
}
