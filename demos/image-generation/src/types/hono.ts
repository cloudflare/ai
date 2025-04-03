import type {
	Hono,
	Context as HonoContext,
	MiddlewareHandler as HonoMiddlewareHandler,
} from "hono";

export type Variables = Record<string, string>;

export type App = Hono<{ Bindings: Env; Variables: Variables }>;

export type MiddlewareHandler = HonoMiddlewareHandler<{
	Bindings: Env;
	Variables: Variables;
}>;
export type Context = HonoContext<{ Bindings: Env; Variables: Variables }>;
export type Next = () => Promise<void>;
