import logging
import sys

import structlog

# Create two handlers - one for stdout and one for stderr
stdout_handler = logging.StreamHandler(sys.stdout)
stderr_handler = logging.StreamHandler(sys.stderr)

# Configure stdout handler to only handle INFO and DEBUG
stdout_handler.setLevel(logging.DEBUG)
stdout_handler.addFilter(lambda record: record.levelno <= logging.INFO)

# Configure stderr handler to only handle WARNING and above
stderr_handler.setLevel(logging.WARNING)

# Get the root logger and add both handlers
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)  # Allow all logs to pass through
root_logger.addHandler(stdout_handler)
root_logger.addHandler(stderr_handler)

structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.EventRenamer("message"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.ExceptionRenderer(),
        structlog.processors.JSONRenderer(),
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

# Get a logger
logger: structlog.stdlib.BoundLogger = structlog.get_logger()
