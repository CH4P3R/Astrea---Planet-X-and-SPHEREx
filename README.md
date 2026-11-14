# Astrea

A public-facing web tool for exploring **NASA SPHEREx** images of the sky over time.

SPHEREx maps the whole sky every six months in 102 near-infrared bands. Because
nearby objects (asteroids, comets, brown dwarfs, variable stars) shift or change
brightness between visits, blinking a series of images of the same patch is one of
the most effective ways to spot them — the same method volunteers have used for
decades through projects like Backyard Worlds.

Astrea lets anyone enter a sky position, watch that patch change over time, and
(optionally) compare or combine the 102 bands.

## Status

Early scaffold — the UI and backend dependencies are in place, but no science
pipeline or API endpoints exist yet. Planned features:

- Coordinate input (RA/Dec) and a URL API so views can be embedded and shared
- Image "blink" playback of a sky patch across SPHEREx epochs
- Adjustable field of view
- Detector-array stacking to improve signal-to-noise
- Add/subtract images taken at different times to highlight motion
- On-the-fly spectra from the 102 bands
- Overlays from Gaia DR3 and WISE
- Metadata on screen (e.g. contamination flags)

## Validation targets

The tool should be tested on:

| Object | Notes |
| --- | --- |
| Barnard's Star | High proper motion |
| Epsilon Indi B | Brown dwarf pair orbiting a star |
| WISE 0855 | Fast-moving brown dwarf, RA 08h55m10.831s, Dec -7d14m42.53s |
| RW Aurigae | Variable star |
| R Draconis | Variable star |

## Repository layout

```
backend/    Python service (FastAPI, astropy/astroquery) — dependencies only so far
frontend/   React 19 + Vite + three.js app (still the Vite starter template)
```

## Getting started

### Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # production build
npm run lint
```

### Backend

Requires Python 3. Detailed steps are in [`backend/entorno.txt`](backend/entorno.txt).

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
python -m pip install -r requirements.txt
```

There is no server to start yet. When the API is added, run it with
`uvicorn <module>:app --reload`.

## Data and resources

- [NASA/IPAC Infrared Science Archive — SPHEREx](https://irsa.ipac.caltech.edu/Missions/spherex.html)
- [SPHEREx tutorial notebooks](https://irsa.ipac.caltech.edu/docs/spherex_tutorials.html)
- [WiseView](https://viewer.wise2.ipac.caltech.edu/) — inspiration, built for the WISE mission
- [Gaia DR3](https://gea.esac.esa.int/archive/)

## Acknowledgements

Built for the SPHEREx / Planet X hackathon challenge. SPHEREx data are provided
by NASA; this project is not affiliated with or endorsed by NASA.
