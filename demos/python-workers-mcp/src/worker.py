
from workers import DurableObject
from logger import logger
import sys
sys.path.insert(0, "/session/metadata/vendor")
sys.path.insert(0, "/session/metadata")


def setup_server():
    from exceptions import HTTPException, http_exception
    from mcp.server.fastmcp import FastMCP
    mcp = FastMCP("Demo")

    @mcp.tool()
    def add(a: int, b: int) -> int:
        """Add two numbers"""
        return a + b

    @mcp.resource("greeting://{name}")
    def get_greeting(name: str) -> str:
        """Get a personalized greeting"""
        return f"Hello, {name}!"

    @mcp.tool()
    def calculate_bmi(weight_kg: float, height_m: float) -> float:
        """Calculate BMI given weight in kg and height in meters"""
        return weight_kg / (height_m**2)

    @mcp.prompt()
    def echo_prompt(message: str) -> str:
        """Create an echo prompt"""
        return f"Please process this message: {message}"

    app = mcp.sse_app()
    app.add_exception_handler(HTTPException, http_exception)
    return mcp, app


class FastMCPServer(DurableObject):
    def __init__(self, ctx, env):
        self.ctx = ctx
        self.env = env
        self.mcp, self.app = setup_server()

    async def call(self, request):
        import asgi
        return await asgi.fetch(self.app, request, self.env, self.ctx)

async def on_fetch(request, env):
    id = env.ns.idFromName("A")
    obj = env.ns.get(id)
    return await obj.call(request)
