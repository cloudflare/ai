# Python Workers: FastMCP Example

This is an example of a Python Worker that uses the FastMCP package.

## Adding Packages

Vendored packages are added to your source files and need to be installed in a special manner. The Python Workers team plans to make this process automatic in the future, but for now, manual steps need to be taken.

### Vendoring Packages

First, install Python3.12 and pip for Python 3.12.

*Currently, other versions of Python will not work - use 3.12!*

Then create a virtual environment and activate it from your shell:
```console
python3.12 -m venv .venv
source .venv/bin/activate
```

Within our virtual environment, install the pyodide CLI:
```console
.venv/bin/pip install pyodide-build
.venv/bin/pyodide venv .venv-pyodide
```

Lastly, download the vendored packages. For any additional packages, re-run this command.
```console
.venv-pyodide/bin/pip install -t src/vendor -r vendor.txt
```

### Developing and Deploying

To develop your Worker, run `npx wrangler@latest dev`.

To deploy your Worker, run `npx wrangler@latest deploy`.
