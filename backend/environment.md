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

That installs what the API and its tests need. For the notebooks and the ML
experiments, install the larger set instead (it includes the API one):

```bash
python -m pip install -r requirements-notebooks.txt
```

To check that you're using Python from the environment:

```bash
python -c "import sys; print(sys.executable)"
```

On Linux, the path should end in `backend/.venv/bin/python`.
On Windows, it should end in `backend\.venv\Scripts\python.exe`.

Whenever you open a new terminal, just head into the backend folder and
activate the environment. No need to create it or install everything again.
Rerun the install command if we add or change libraries in `requirements.txt`
or `requirements-notebooks.txt`.

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

### Prepare the cache for a demo (`app.warm`)

`python -m app.warm` searches every target in `targets.yaml`, picks up to
`--max-frames` observations of one detector spread across the returned dates,
loads them into the image cache and writes `data/warm-manifest.json`:

```bash
python -m app.warm                       # all targets, 12 observations each
python -m app.warm --only "WISE 0855-0714" --max-frames 4
python -m app.warm --offline             # check the manifest's cached data, no network
```

Each target prints one line:

```
OK   Barnard's Star   D3  12/45 ready  span   352.0 d  fetched 12  cached 0  failed 0
```

The exit status is 1 when any target has fewer than 2 ready observations or a
failure. The search returns at most the 100 newest matches; the line says so
when more exist. `--offline` proves the chosen images are cached. The browser
still needs IRSA to search, so a fully offline demo needs more work (see
`docs/sdd/backend/tasks.md` 4.4).

### Settings from environment variables

Defaults live in `app/core/config.py`. When the server starts, these optional
variables override them; anything invalid stops the server with a message
naming the variable:

| Variable | Setting | Example |
| --- | --- | --- |
| `ASTREA_CACHE_DIR` | Image cache folder | `/var/cache/astrea/image-cutouts` |
| `ASTREA_STAR_CACHE` | Hipparcos cache file | `/var/cache/astrea/hipparcos-v1.json` |
| `ASTREA_TARGETS_FILE` | Acceptance targets file | `/etc/astrea/targets.yaml` |
| `ASTREA_CORS_ORIGINS` | Allowed browser origins, comma-separated | `https://astrea.example,http://localhost:5173` |
| `ASTREA_BAD_FLAGS` | Flags rejected by `mask_flags=true`, comma-separated (`SOURCE` is refused) | `HOT,COLD,NONFUNC` |
| `ASTREA_ARCHIVE_BUDGET_SECONDS` | Time budget per image or plane download | `60` |

Any other variable starting with `ASTREA_` is rejected as a likely typo.

```bash
ASTREA_ARCHIVE_BUDGET_SECONDS=60 python -m uvicorn app.main:app
```

Each IRSA download logs one line at `INFO`, for example
`IRSA cutout image=<id> path=ranges outcome=ok bytes=86400 seconds=1.84 retries=0`.
`path=service` means the byte-range read was not possible and the cutout
service was used; `retries` counts brief archive failures that were retried.

Run the backend's offline tests from this folder:

```bash
python -m pytest tests -q
```

## Notes

- The `.venv` folder won't be uploaded to GitHub: `.gitignore` already handles that.
- `requirements.txt` sets minimum versions for the API's libraries; newer
  versions are accepted. The notebook and ML libraries are unpinned.

## Verify the minimum versions

`requirements-min.txt` pins every API library at its lower bound. Run the tests
against it in a throwaway environment whenever a bound changes:

```bash
python -m venv /tmp/astrea-min
/tmp/astrea-min/bin/pip install --only-binary=:all: -r requirements-min.txt
/tmp/astrea-min/bin/python -m pytest tests -q
```

Last result (2026-11-15, Python 3.13): all tests pass with the minimum set and
with the latest releases. On Python 3.13 the oldest installable versions are
higher than on older Pythons (no earlier wheels exist), which is why the bounds
are astropy 6.1.3, numpy 2.1, pyerfa 2.0.1.4 (the first build for NumPy 2)
and pydantic 2.8.
- The image API reads IMAGE and spatial metadata, and applies quality masking,
  zodiacal-background subtraction and signal-to-noise only on request (see
  API.md, sections 4 to 6). Spectral extensions and comparisons are not
  implemented yet.
