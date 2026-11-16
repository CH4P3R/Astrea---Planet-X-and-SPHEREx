# Astrea

A public-facing web tool for exploring **NASA SPHEREx** images of the sky over time.

SPHEREx maps the whole sky every six months in 102 near-infrared bands. Because
nearby objects (asteroids, comets, brown dwarfs, variable stars) shift or change
brightness between visits, blinking a series of images of the same patch is one of
the most effective ways to spot them — the same method volunteers have used for
decades through projects like Backyard Worlds.

Astrea lets users search a sky position, inspect real SPHEREx cutouts, compare
observations over time, and measure flux against wavelength.

## Status

Functional development version with a React frontend and a FastAPI backend.
Available features:

- Interactive 3D sky with Hipparcos stars, observer location and live or paused time.
- SPHEREx search by ICRS RA/Dec or a click on the sky, with cutouts from 0.1 to
  30 arcminutes (7 by default) and detector selection D1–D6.
- Native-resolution FITS display using WCS meshes, metadata inspection, exposure,
  palettes and optional quality masking, zodiacal subtraction and signal-to-noise.
- Multi-observation comparison with annual search, a chronological timeline and
  blink playback at intervals of 0.1–3 seconds.
- Local GIF export of up to 20 observations, preserving WCS alignment and the
  current rendered element's resolution, zoom and orientation.
- Shareable search URLs containing RA, Dec, cutout size and detector.
- On-demand spectra by detector using PSF fitting or aperture photometry, with
  uncertainty and quality information.
- Spanish/English UI and a guided tutorial using bundled real Barnard-field FITS
  and a precomputed spectrum example derived from those files.

If initial geolocation fails, is denied or receives no response within 12 seconds,
the app assigns Greenwich (51.4779°, 0°) as an explicit reference, opens Location
and shows a notification. Users can replace it manually or retry device location.
This is not presented as the user's actual position.

### Current limitations

- Archive searches and uncached data require network access to IRSA. Bundled
  tutorial images avoid remote image downloads, but still require the backend.
- Comparison searches return up to 100 observations for the selected year and
  report when more exist; pagination is not implemented.
- Spectral coverage depends on available exposures and successful measurements;
  a complete 102-band spectrum is not guaranteed.
- GIF export retains 64 colors and LZW compression, but rendered-resolution output
  can be large, particularly when zoomed in or on high-density displays.
- Image stacking, temporal image subtraction and Gaia/WISE overlays are not
  implemented in the current UI.
- These tools aid exploration; displaying a target does not establish a detection
  or validate its motion or variability.

## Validation targets

The acceptance targets are recorded in [`backend/targets.yaml`](backend/targets.yaml),
including source references, proper motions and a SPHEREx-era reference epoch.
`GET /api/v1/targets` returns their propagated positions. The targets include:

| Object | Notes |
| --- | --- |
| Barnard's Star | High proper motion |
| Epsilon Indi B | Brown dwarf pair orbiting a star |
| WISE 0855-0714 | Fast-moving brown dwarf |
| RW Aurigae | Variable star |
| R Draconis | Variable star |

## Repository layout

| Directory | Contents |
| --- | --- |
| `backend/` | FastAPI service, Astropy/Astroquery workflows, tests, image caches and bundled tutorial FITS |
| `frontend/` | React 19, Vite 8, Three.js/React Three Fiber, GSAP and frontend tests |
| `frontend/docs/` | UI guide, architecture, comparison/export behavior and internationalization |
| `notebooks/` | Astronomical data exploration and experiments |
| `docs/` | Project design and technical review documents |

## Getting started

Use Python 3.10+ and a compatible Node.js/npm installation (Node.js 24 LTS is
recommended). Run the backend and frontend in separate terminals.

### Backend

1. Enter `backend/`.
2. Create a virtual environment with `python -m venv .venv` (or `python3` on Linux).
3. Activate it: `source .venv/bin/activate` on Linux/macOS,
   `.\.venv\Scripts\Activate.ps1` in PowerShell, or
   `.venv\Scripts\activate.bat` in Windows CMD.
4. Install dependencies with `python -m pip install -r requirements.txt`.
5. Start the API with `python -m uvicorn app.main:app --reload`.

The API runs at `http://127.0.0.1:8000`; interactive documentation is at
`http://127.0.0.1:8000/docs`. Its root `/` returns 404; feature endpoints live
under `/api/v1`.

See [`backend/environment.md`](backend/environment.md) for detailed setup,
cache warming and `ASTREA_*` configuration variables. Notebook/ML dependencies
are optional and listed separately in `backend/requirements-notebooks.txt`.

### Frontend

1. Enter `frontend/` in a second terminal.
2. Install the locked dependencies with `npm ci`.
3. Start Vite with `npm run dev` and open `http://localhost:5173`.

Vite proxies `/api` to `http://127.0.0.1:8000`. A production deployment must route
`/api` to the backend under the frontend's origin. Device geolocation requires
HTTPS or localhost.

### Verification and production build

- From `frontend/`: `npm test`, `npm run lint`, and `npm run build`.
  The production frontend is written to `frontend/dist/`.
- From `backend/`, with its environment active: `python -m pytest tests -q`.

## Documentation

- [Frontend overview](frontend/README.md)
- [Frontend documentation index](frontend/docs/README.md)
- [UI design and interaction guide](frontend/docs/UI_DESIGN_GUIDE.md)
- [Comparison and GIF export](frontend/docs/COMPARISON.md)
- [Backend API contract](backend/API.md)
- [Backend environment and configuration](backend/environment.md)

## Data and resources

- [NASA/IPAC Infrared Science Archive — SPHEREx](https://irsa.ipac.caltech.edu/Missions/spherex.html)
- [SPHEREx tutorial notebooks](https://irsa.ipac.caltech.edu/docs/spherex_tutorials.html)
- [WiseView](https://viewer.wise2.ipac.caltech.edu/) — inspiration, built for the WISE mission
- [Gaia DR3](https://gea.esac.esa.int/archive/)

## Acknowledgements

Built for the SPHEREx / Planet X hackathon challenge. SPHEREx data are provided
by NASA; this project is not affiliated with or endorsed by NASA.
