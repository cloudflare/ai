/**
 * The names of the BaseAiTextGeneration models.
 */
export type TextGenerationModels = Exclude<
	value2key<AiModels, BaseAiTextGeneration>,
	value2key<AiModels, BaseAiTextToImage>
>; // This needs to be fixed to allow more models

/*
 * The names of the BaseAiTextToImage models.
 */
export type ImageGenerationModels = value2key<AiModels, BaseAiTextToImage>;

/**
 * The names of the BaseAiTextToEmbeddings models.
 */
export type EmbeddingModels = value2key<AiModels, BaseAiTextEmbeddings>;

type value2key<T, V> = { [K in keyof T]: T[K] extends V ? K : never }[keyof T];
