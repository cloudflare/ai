import { useMemo } from "react";

/**
 * Generates a unique ID based on the provided data object.
 * Useful for creating stable identifiers from model + headers combinations.
 */
export function useUniqueId(data: Record<string, unknown>, prefix = "id"): string {
	return useMemo(() => {
		const serialized = JSON.stringify(data);
		let hash = 0;
		for (let i = 0; i < serialized.length; i++) {
			hash = (hash << 5) - hash + serialized.charCodeAt(i);
			hash |= 0;
		}
		return `${prefix}-${Math.abs(hash).toString(36)}`;
	}, [data, prefix]);
}
