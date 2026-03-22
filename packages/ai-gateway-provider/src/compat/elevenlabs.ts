import { createElevenLabs as _createElevenLabs } from "@ai-sdk/elevenlabs";
import { wrapWithDeprecationWarning } from "./deprecation-warning";

export const createElevenLabs = wrapWithDeprecationWarning(
	_createElevenLabs,
	"ai-gateway-provider/providers/elevenlabs",
	"@ai-sdk/elevenlabs",
);
