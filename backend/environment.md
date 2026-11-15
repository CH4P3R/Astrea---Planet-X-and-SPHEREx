# Backend environment setup

## Linux (bash or zsh)

First, head into the backend folder:

```bash
cd backend
```

Create the virtual environment. You only need to do this once:

```bash
python3 -m venv .venv
```

Now activate it:

```bash
source .venv/bin/activate
```

## Windows (PowerShell or CMD)

Open a terminal in the Astrea folder and head into the backend:

```bash
cd backend
```

Create the environment. Just like on Linux, you only do this once:

```bash
py -m venv .venv
```

If Windows doesn't recognize `py`, try:

```bash
python -m venv .venv
```

To activate it in PowerShell:

```bash
.\.venv\Scripts\Activate.ps1
```

If PowerShell says it won't let you run scripts, you can open CMD and activate
it there instead. In CMD, use:

```bash
.venv\Scripts\activate.bat
```

## With the environment active (Linux and Windows)

You'll usually see `(.venv)` at the start of your terminal prompt.
With the environment active, install the project's libraries:

```bash
python -m pip install -r requirements.txt
```

To check that you're using Python from the environment:

```bash
python -c "import sys; print(sys.executable)"
```

On Linux, the path should end in `backend/.venv/bin/python`.
On Windows, it should end in `backend\.venv\Scripts\python.exe`.

Whenever you open a new terminal, just head into the backend folder and
activate the environment. No need to create it or install everything again.
Rerun the install command if we add or change libraries in `requirements.txt`.

When you're done, you can leave the environment with:

```bash
deactivate
```

## Start the backend

From the `backend` folder, with the environment active, run the same command
on Linux or Windows:

```bash
python -m uvicorn app.main:app --reload
```

The server runs at `http://127.0.0.1:8000`. Open
`http://127.0.0.1:8000/docs` for Swagger UI or
`http://127.0.0.1:8000/redoc` for ReDoc. The OpenAPI schema is available at
`http://127.0.0.1:8000/openapi.json`.

Image endpoints live under `/api/v1/images`. See [the image API contract](API.md)
for search parameters and binary decoding. `/` still returns 404.

`--reload` restarts the server when Python files change; use it for local
development. Stop the server with Ctrl+C. To run without automatic reload:

```bash
python -m uvicorn app.main:app
```

You can set the listening address and port with Uvicorn's `--host` and `--port`
options. Importing the application does not start a server or contact IRSA.

## Backend structure

```text
app/
  main.py             ASGI entry point used by Uvicorn
  application.py      Application factory and router registration
  core/config.py      Application name, version, and API prefix
  api/v1/router.py    Central registration of version 1 feature routers
  api/v1/endpoints/   HTTP routes, grouped by feature
  schemas/           Request and response models
  services/          Data workflows and processing
  integrations/      Access to IRSA and other external data or storage
```

Routes validate requests and call services. `services/images.py` orchestrates
search and caching; `services/fits_image.py` decodes the IMAGE data and spatial
WCS. `integrations/irsa.py` queries the archive and downloads selected cutouts;
`integrations/cutout_store.py` stores selections and decoded images locally.
`integrations/irsa_ranges.py` reads archive files by HTTP byte ranges so only
the needed plane is downloaded, `integrations/http_retry.py` retries brief
archive failures, and `services/quality.py` holds the optional corrections.
Schemas define the data contract shared with consumers of the API.

Application defaults live in `core/config.py`. `create_app` accepts a `Settings`
instance so tests can construct independent applications. This includes the
cache directory and allowed browser origins (localhost and 127.0.0.1 on port
5173 by default). Environment-file loading is not configured yet.

Run the backend's offline tests from this folder:

```bash
python -m pytest tests -q
```

## Notes

- The `.venv` folder won't be uploaded to GitHub: `.gitignore` already handles that.
- The libraries come from the prototype, though the installed versions may vary
  because most don't have a fixed version in `requirements.txt`.
- The image API reads IMAGE and spatial metadata, and applies quality masking,
  zodiacal-background subtraction and signal-to-noise only on request (see
  API.md, sections 4 to 6). Spectral extensions and comparisons are not
  implemented yet.
