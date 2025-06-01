export namespace OpenAPIV3_1 {
	type Modify<T, R> = Omit<T, keyof R> & R;

	type PathsWebhooksComponents<T extends {} = {}> = {
		paths: PathsObject<T>;
		webhooks: Record<string, PathItemObject | ReferenceObject>;
		components: ComponentsObject;
	};

	export type Document<T extends {} = {}> = Modify<
		Omit<OpenAPIV3.Document<T>, "paths" | "components">,
		{
			info: InfoObject;
			jsonSchemaDialect?: string;
			servers?: ServerObject[];
		} & (
			| (Pick<PathsWebhooksComponents<T>, "paths"> &
					Omit<Partial<PathsWebhooksComponents<T>>, "paths">)
			| (Pick<PathsWebhooksComponents<T>, "webhooks"> &
					Omit<Partial<PathsWebhooksComponents<T>>, "webhooks">)
			| (Pick<PathsWebhooksComponents<T>, "components"> &
					Omit<Partial<PathsWebhooksComponents<T>>, "components">)
		)
	>;

	export type InfoObject = Modify<
		OpenAPIV3.InfoObject,
		{
			summary?: string;
			license?: LicenseObject;
		}
	>;

	export type ContactObject = OpenAPIV3.ContactObject;

	export type LicenseObject = Modify<
		OpenAPIV3.LicenseObject,
		{
			identifier?: string;
		}
	>;

	export type ServerObject = Modify<
		OpenAPIV3.ServerObject,
		{
			url: string;
			description?: string;
			variables?: Record<string, ServerVariableObject>;
		}
	>;

	export type ServerVariableObject = Modify<
		OpenAPIV3.ServerVariableObject,
		{
			enum?: [string, ...string[]];
		}
	>;

	export type PathsObject<T extends {} = {}, P extends {} = {}> = Record<
		string,
		(PathItemObject<T> & P) | undefined
	>;

	export type HttpMethods = OpenAPIV3.HttpMethods;

	export type PathItemObject<T extends {} = {}> = Modify<
		OpenAPIV3.PathItemObject<T>,
		{
			servers?: ServerObject[];
			parameters?: (ReferenceObject | ParameterObject)[];
		}
	> & {
		[method in HttpMethods]?: OperationObject<T>;
	};

	export type OperationObject<T extends {} = {}> = Modify<
		OpenAPIV3.OperationObject<T>,
		{
			parameters?: (ReferenceObject | ParameterObject)[];
			requestBody?: ReferenceObject | RequestBodyObject;
			responses?: ResponsesObject;
			callbacks?: Record<string, ReferenceObject | CallbackObject>;
			servers?: ServerObject[];
		}
	> &
		T;

	export type ExternalDocumentationObject = OpenAPIV3.ExternalDocumentationObject;

	export type ParameterObject = OpenAPIV3.ParameterObject;

	export type HeaderObject = OpenAPIV3.HeaderObject;

	export type ParameterBaseObject = OpenAPIV3.ParameterBaseObject;

	export type NonArraySchemaObjectType = OpenAPIV3.NonArraySchemaObjectType | "null";

	export type ArraySchemaObjectType = OpenAPIV3.ArraySchemaObjectType;

	/**
	 * There is no way to tell typescript to require items when type is either 'array' or array containing 'array' type
	 * 'items' will be always visible as optional
	 * Casting schema object to ArraySchemaObject or NonArraySchemaObject will work fine
	 */
	export type SchemaObject =
		| ArraySchemaObject
		| NonArraySchemaObject
		| MixedSchemaObject
		| boolean;

	export interface ArraySchemaObject extends BaseSchemaObject {
		type: ArraySchemaObjectType;
		items: ReferenceObject | SchemaObject;
	}

	export interface NonArraySchemaObject extends BaseSchemaObject {
		type?: NonArraySchemaObjectType;
	}

	interface MixedSchemaObject extends BaseSchemaObject {
		type?: (ArraySchemaObjectType | NonArraySchemaObjectType)[];
		items?: ReferenceObject | SchemaObject;
	}

	export type BaseSchemaObject = Modify<
		Omit<OpenAPIV3.BaseSchemaObject, "nullable">,
		{
			examples?: OpenAPIV3.BaseSchemaObject["example"][];
			exclusiveMinimum?: boolean | number;
			exclusiveMaximum?: boolean | number;
			contentMediaType?: string;
			$schema?: string;
			additionalProperties?: boolean | ReferenceObject | SchemaObject;
			properties?: {
				[name: string]: ReferenceObject | SchemaObject;
			};
			allOf?: (ReferenceObject | SchemaObject)[];
			oneOf?: (ReferenceObject | SchemaObject)[];
			anyOf?: (ReferenceObject | SchemaObject)[];
			not?: ReferenceObject | SchemaObject;
			discriminator?: DiscriminatorObject;
			externalDocs?: ExternalDocumentationObject;
			xml?: XMLObject;
			const?: any;
		}
	>;

	export type DiscriminatorObject = OpenAPIV3.DiscriminatorObject;

	export type XMLObject = OpenAPIV3.XMLObject;

	export type ReferenceObject = Modify<
		OpenAPIV3.ReferenceObject,
		{
			summary?: string;
			description?: string;
		}
	>;

	export type ExampleObject = OpenAPIV3.ExampleObject;

	export type MediaTypeObject = Modify<
		OpenAPIV3.MediaTypeObject,
		{
			schema?: SchemaObject | ReferenceObject;
			examples?: Record<string, ReferenceObject | ExampleObject>;
		}
	>;

	export type EncodingObject = OpenAPIV3.EncodingObject;

	export type RequestBodyObject = Modify<
		OpenAPIV3.RequestBodyObject,
		{
			content: { [media: string]: MediaTypeObject };
		}
	>;

	export type ResponsesObject = Record<string, ReferenceObject | ResponseObject>;

	export type ResponseObject = Modify<
		OpenAPIV3.ResponseObject,
		{
			headers?: { [header: string]: ReferenceObject | HeaderObject };
			content?: { [media: string]: MediaTypeObject };
			links?: { [link: string]: ReferenceObject | LinkObject };
		}
	>;

	export type LinkObject = Modify<
		OpenAPIV3.LinkObject,
		{
			server?: ServerObject;
		}
	>;

	export type CallbackObject = Record<string, PathItemObject | ReferenceObject>;

	export type SecurityRequirementObject = OpenAPIV3.SecurityRequirementObject;

	export type ComponentsObject = Modify<
		OpenAPIV3.ComponentsObject,
		{
			schemas?: Record<string, SchemaObject>;
			responses?: Record<string, ReferenceObject | ResponseObject>;
			parameters?: Record<string, ReferenceObject | ParameterObject>;
			examples?: Record<string, ReferenceObject | ExampleObject>;
			requestBodies?: Record<string, ReferenceObject | RequestBodyObject>;
			headers?: Record<string, ReferenceObject | HeaderObject>;
			securitySchemes?: Record<string, ReferenceObject | SecuritySchemeObject>;
			links?: Record<string, ReferenceObject | LinkObject>;
			callbacks?: Record<string, ReferenceObject | CallbackObject>;
			pathItems?: Record<string, ReferenceObject | PathItemObject>;
		}
	>;

	export type SecuritySchemeObject = OpenAPIV3.SecuritySchemeObject;

	export type HttpSecurityScheme = OpenAPIV3.HttpSecurityScheme;

	export type ApiKeySecurityScheme = OpenAPIV3.ApiKeySecurityScheme;

	export type OAuth2SecurityScheme = OpenAPIV3.OAuth2SecurityScheme;

	export type OpenIdSecurityScheme = OpenAPIV3.OpenIdSecurityScheme;

	export type TagObject = OpenAPIV3.TagObject;
}

export namespace OpenAPIV3 {
	export interface Document<T extends {} = {}> {
		openapi: string;
		info: InfoObject;
		servers?: ServerObject[];
		paths: PathsObject<T>;
		components?: ComponentsObject;
		security?: SecurityRequirementObject[];
		tags?: TagObject[];
		externalDocs?: ExternalDocumentationObject;
		"x-express-openapi-additional-middleware"?: (
			| ((request: any, response: any, next: any) => Promise<void>)
			| ((request: any, response: any, next: any) => void)
		)[];
		"x-express-openapi-validation-strict"?: boolean;
	}

	export interface InfoObject {
		title: string;
		description?: string;
		termsOfService?: string;
		contact?: ContactObject;
		license?: LicenseObject;
		version: string;
	}

	export interface ContactObject {
		name?: string;
		url?: string;
		email?: string;
	}

	export interface LicenseObject {
		name: string;
		url?: string;
	}

	export interface ServerObject {
		url: string;
		description?: string;
		variables?: { [variable: string]: ServerVariableObject };
	}

	export interface ServerVariableObject {
		enum?: string[] | number[];
		default: string | number;
		description?: string;
	}

	export interface PathsObject<T extends {} = {}, P extends {} = {}> {
		[pattern: string]: (PathItemObject<T> & P) | undefined;
	}

	// All HTTP methods allowed by OpenAPI 3 spec
	// See https://swagger.io/specification/#path-item-object
	// You can use keys or values from it in TypeScript code like this:
	//     for (const method of Object.values(OpenAPIV3.HttpMethods)) { … }
	export enum HttpMethods {
		GET = "get",
		PUT = "put",
		POST = "post",
		DELETE = "delete",
		OPTIONS = "options",
		HEAD = "head",
		PATCH = "patch",
		TRACE = "trace",
	}

	export type PathItemObject<T extends {} = {}> = {
		$ref?: string;
		summary?: string;
		description?: string;
		servers?: ServerObject[];
		parameters?: (ReferenceObject | ParameterObject)[];
	} & {
		[method in HttpMethods]?: OperationObject<T>;
	};

	export type OperationObject<T extends {} = {}> = {
		tags?: string[];
		summary?: string;
		description?: string;
		externalDocs?: ExternalDocumentationObject;
		operationId?: string;
		parameters?: (ReferenceObject | ParameterObject)[];
		requestBody?: ReferenceObject | RequestBodyObject;
		responses: ResponsesObject;
		callbacks?: { [callback: string]: ReferenceObject | CallbackObject };
		deprecated?: boolean;
		security?: SecurityRequirementObject[];
		servers?: ServerObject[];
	} & T;

	export interface ExternalDocumentationObject {
		description?: string;
		url: string;
	}

	export interface ParameterObject extends ParameterBaseObject {
		name: string;
		in: string;
	}

	export interface HeaderObject extends ParameterBaseObject {}

	export interface ParameterBaseObject {
		description?: string;
		required?: boolean;
		deprecated?: boolean;
		allowEmptyValue?: boolean;
		style?: string;
		explode?: boolean;
		allowReserved?: boolean;
		schema?: ReferenceObject | SchemaObject;
		example?: any;
		examples?: { [media: string]: ReferenceObject | ExampleObject };
		content?: { [media: string]: MediaTypeObject };
	}
	export type NonArraySchemaObjectType = "boolean" | "object" | "number" | "string" | "integer";
	export type ArraySchemaObjectType = "array";
	export type SchemaObject = ArraySchemaObject | NonArraySchemaObject;

	export interface ArraySchemaObject extends BaseSchemaObject {
		type: ArraySchemaObjectType;
		items: ReferenceObject | SchemaObject;
	}

	export interface NonArraySchemaObject extends BaseSchemaObject {
		type?: NonArraySchemaObjectType;
	}

	export interface BaseSchemaObject {
		// JSON schema allowed properties, adjusted for OpenAPI
		title?: string;
		description?: string;
		format?: string;
		default?: any;
		multipleOf?: number;
		maximum?: number;
		exclusiveMaximum?: boolean;
		minimum?: number;
		exclusiveMinimum?: boolean;
		maxLength?: number;
		minLength?: number;
		pattern?: string;
		additionalProperties?: boolean | ReferenceObject | SchemaObject;
		maxItems?: number;
		minItems?: number;
		uniqueItems?: boolean;
		maxProperties?: number;
		minProperties?: number;
		required?: string[];
		enum?: any[];
		properties?: {
			[name: string]: ReferenceObject | SchemaObject;
		};
		allOf?: (ReferenceObject | SchemaObject)[];
		oneOf?: (ReferenceObject | SchemaObject)[];
		anyOf?: (ReferenceObject | SchemaObject)[];
		not?: ReferenceObject | SchemaObject;

		// OpenAPI-specific properties
		nullable?: boolean;
		discriminator?: DiscriminatorObject;
		readOnly?: boolean;
		writeOnly?: boolean;
		xml?: XMLObject;
		externalDocs?: ExternalDocumentationObject;
		example?: any;
		deprecated?: boolean;
	}

	export interface DiscriminatorObject {
		propertyName: string;
		mapping?: { [value: string]: string };
	}

	export interface XMLObject {
		name?: string;
		namespace?: string;
		prefix?: string;
		attribute?: boolean;
		wrapped?: boolean;
	}

	export interface ReferenceObject {
		$ref: string;
	}

	export interface ExampleObject {
		summary?: string;
		description?: string;
		value?: any;
		externalValue?: string;
	}

	export interface MediaTypeObject {
		schema?: ReferenceObject | SchemaObject;
		example?: any;
		examples?: { [media: string]: ReferenceObject | ExampleObject };
		encoding?: { [media: string]: EncodingObject };
	}

	export interface EncodingObject {
		contentType?: string;
		headers?: { [header: string]: ReferenceObject | HeaderObject };
		style?: string;
		explode?: boolean;
		allowReserved?: boolean;
	}

	export interface RequestBodyObject {
		description?: string;
		content: { [media: string]: MediaTypeObject };
		required?: boolean;
	}

	export interface ResponsesObject {
		[code: string]: ReferenceObject | ResponseObject;
	}

	export interface ResponseObject {
		description: string;
		headers?: { [header: string]: ReferenceObject | HeaderObject };
		content?: { [media: string]: MediaTypeObject };
		links?: { [link: string]: ReferenceObject | LinkObject };
	}

	export interface LinkObject {
		operationRef?: string;
		operationId?: string;
		parameters?: { [parameter: string]: any };
		requestBody?: any;
		description?: string;
		server?: ServerObject;
	}

	export interface CallbackObject {
		[url: string]: PathItemObject;
	}

	export interface SecurityRequirementObject {
		[name: string]: string[];
	}

	export interface ComponentsObject {
		schemas?: { [key: string]: ReferenceObject | SchemaObject };
		responses?: { [key: string]: ReferenceObject | ResponseObject };
		parameters?: { [key: string]: ReferenceObject | ParameterObject };
		examples?: { [key: string]: ReferenceObject | ExampleObject };
		requestBodies?: { [key: string]: ReferenceObject | RequestBodyObject };
		headers?: { [key: string]: ReferenceObject | HeaderObject };
		securitySchemes?: { [key: string]: ReferenceObject | SecuritySchemeObject };
		links?: { [key: string]: ReferenceObject | LinkObject };
		callbacks?: { [key: string]: ReferenceObject | CallbackObject };
	}

	export type SecuritySchemeObject =
		| HttpSecurityScheme
		| ApiKeySecurityScheme
		| OAuth2SecurityScheme
		| OpenIdSecurityScheme;

	export interface HttpSecurityScheme {
		type: "http";
		description?: string;
		scheme: string;
		bearerFormat?: string;
	}

	export interface ApiKeySecurityScheme {
		type: "apiKey";
		description?: string;
		name: string;
		in: string;
	}

	export interface OAuth2SecurityScheme {
		type: "oauth2";
		description?: string;
		flows: {
			implicit?: {
				authorizationUrl: string;
				refreshUrl?: string;
				scopes: { [scope: string]: string };
			};
			password?: {
				tokenUrl: string;
				refreshUrl?: string;
				scopes: { [scope: string]: string };
			};
			clientCredentials?: {
				tokenUrl: string;
				refreshUrl?: string;
				scopes: { [scope: string]: string };
			};
			authorizationCode?: {
				authorizationUrl: string;
				tokenUrl: string;
				refreshUrl?: string;
				scopes: { [scope: string]: string };
			};
		};
	}

	export interface OpenIdSecurityScheme {
		type: "openIdConnect";
		description?: string;
		openIdConnectUrl: string;
	}

	export interface TagObject {
		name: string;
		description?: string;
		externalDocs?: ExternalDocumentationObject;
	}
}

export interface IJsonSchema {
	id?: string;
	$schema?: string;
	title?: string;
	description?: string;
	multipleOf?: number;
	maximum?: number;
	exclusiveMaximum?: boolean;
	minimum?: number;
	exclusiveMinimum?: boolean;
	maxLength?: number;
	minLength?: number;
	pattern?: string;
	additionalItems?: boolean | IJsonSchema;
	items?: IJsonSchema | IJsonSchema[];
	maxItems?: number;
	minItems?: number;
	uniqueItems?: boolean;
	maxProperties?: number;
	minProperties?: number;
	required?: string[];
	additionalProperties?: boolean | IJsonSchema;
	definitions?: {
		[name: string]: IJsonSchema;
	};
	properties?: {
		[name: string]: IJsonSchema;
	};
	patternProperties?: {
		[name: string]: IJsonSchema;
	};
	dependencies?: {
		[name: string]: IJsonSchema | string[];
	};
	enum?: any[];
	type?: string | string[];
	allOf?: IJsonSchema[];
	anyOf?: IJsonSchema[];
	oneOf?: IJsonSchema[];
	not?: IJsonSchema;
	$ref?: string;
}
