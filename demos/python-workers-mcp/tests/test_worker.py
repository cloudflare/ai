import os
import signal
import socket
import subprocess
import time

import pytest
import requests
from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.types import (
    CallToolResult,
    ListPromptsResult,
    ListResourcesResult,
    ListToolsResult,
    Prompt,
    PromptArgument,
    TextContent,
    Tool,
)


def get_free_port():
    """Find an available port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("localhost", 0))
        return s.getsockname()[1]


class WorkerFixture:
    def __init__(self):
        self.process = None
        self.port = None
        self.base_url = None

    def start(self):
        """Start the worker in a subprocess."""
        self.port = get_free_port()
        self.base_url = f"http://localhost:{self.port}"

        # Start the worker as a subprocess
        cmd = f"npx wrangler@latest dev --port {self.port}"
        self.process = subprocess.Popen(
            cmd,
            shell=True,
            preexec_fn=os.setsid,  # So we can kill the process group later
        )

        # Wait for server to start
        self._wait_for_server()

        return self

    def _wait_for_server(self, max_retries=10, retry_interval=1):
        """Wait until the server is responding to requests."""
        for _ in range(max_retries):
            try:
                response = requests.get(self.base_url, timeout=20)
                if response.status_code < 500:  # Accept any non-server error response
                    return
            except requests.exceptions.RequestException:
                pass

            time.sleep(retry_interval)

        # If we got here, the server didn't start properly
        self.stop()
        raise Exception(f"worker failed to start on port {self.port}")

    def stop(self):
        """Stop the worker."""
        if self.process:
            # Kill the process group (including any child processes)
            os.killpg(os.getpgid(self.process.pid), signal.SIGTERM)
            self.process = None


@pytest.fixture(scope="session")
def web_server():
    """Pytest fixture that starts the worker for the entire test session."""
    server = WorkerFixture()
    server.start()
    yield server
    server.stop()


def test_nonexistent_page(web_server):
    """Test that a non-existent page returns a 404 status code."""
    response = requests.get(f"{web_server.base_url}/nonexistent")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_sse_connection(web_server):
    """Test that we can establish a connection to the SSE endpoint."""
    async with sse_client(f"{web_server.base_url}/sse") as (read, write):
        async with ClientSession(
            read,
            write,
        ) as session:
            await session.initialize()

            # List available prompts
            prompts = await session.list_prompts()
            assert prompts == ListPromptsResult(
                prompts=[
                    Prompt(
                        name="echo_prompt",
                        description="Create an echo prompt",
                        arguments=[
                            PromptArgument(
                                name="message",
                                description=None,
                                required=True,
                            )
                        ],
                    )
                ]
            )

            # List available resources
            resources = await session.list_resources()
            assert resources == ListResourcesResult(resources=[])

            # List available tools
            tools = await session.list_tools()
            assert tools == ListToolsResult(
                tools=[
                    Tool(
                        name="add",
                        description="Add two numbers",
                        inputSchema={
                            "properties": {
                                "a": {"title": "A", "type": "integer"},
                                "b": {"title": "B", "type": "integer"},
                            },
                            "required": ["a", "b"],
                            "title": "addArguments",
                            "type": "object",
                        },
                    ),
                    Tool(
                        name="calculate_bmi",
                        description="Calculate BMI given weight in kg and height in meters",
                        inputSchema={
                            "properties": {
                                "weight_kg": {"title": "Weight Kg", "type": "number"},
                                "height_m": {"title": "Height M", "type": "number"},
                            },
                            "required": ["weight_kg", "height_m"],
                            "title": "calculate_bmiArguments",
                            "type": "object",
                        },
                    ),
                ]
            )

            # Call a tool
            result = await session.call_tool("add", arguments={"a": 1, "b": 2})
            assert result == CallToolResult(content=[TextContent(text="3", type="text")])
