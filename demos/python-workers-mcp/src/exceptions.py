from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import PlainTextResponse, Response

from logger import logger


async def http_exception(request: Request, exc: Exception) -> Response:
    assert isinstance(exc, HTTPException)
    logger.exception(exc)
    if exc.status_code in {204, 304}:
        return Response(status_code=exc.status_code, headers=exc.headers)
    return PlainTextResponse(exc.detail, status_code=exc.status_code, headers=exc.headers)
