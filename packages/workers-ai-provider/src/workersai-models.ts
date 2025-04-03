/**
 * The names of the BaseAiTextGeneration models.
 */
export type TextGenerationModels = Exclude<
	value2key<AiModels, BaseAiTextGeneration>,
	value2key<AiModels, BaseAiTextToImage>
>;

/*
 * The names of the BaseAiTextToImage models.
 */
export type ImageGenerationModels = value2key<AiModels, BaseAiTextToImage>;

type value2key<T, V> = { [K in keyof T]: T[K] extends V ? K : never }[keyof T];
