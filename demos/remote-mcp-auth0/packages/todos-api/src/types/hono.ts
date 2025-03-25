import type {
	Hono,
	Context as HonoContext,
	MiddlewareHandler as HonoMiddlewareHandler,
} from "hono";

export type Variables = Record<string, string>;

export type App = Hono<{ Variables: Variables }>;

export type MiddlewareHandler = HonoMiddlewareHandler<{
	Variables: Variables;
}>;
export type Context = HonoContext<{ Variables: Variables }>;
export type Next = () => Promise<void>;
