"""Spectrum of one sky position: aperture photometry on every exposure that covers it.

A SPHEREx exposure measures a source at the single wavelength its position on
the detector's linear variable filter selects, so the spectrum is one
measurement per exposure. Two methods share the local background, the quality
rules and the flux unit (those of IRSA's Spectrophotometry Tool):

- "aperture" follows notebooks/04-source-discovery-tool (section 12): the flux
  summed in a circle, with the VARIANCE plane for the error.
- "psf" fits the file's effective PSF (notebooks/03-psf-models) at the fixed
  position, as IRSA's tool does. Pixels are weighted by how much of the star
  they hold, so faint sources are less noisy and an unusable pixel costs
  precision instead of flux.
"""

from collections import OrderedDict
from concurrent.futures import CancelledError, ThreadPoolExecutor
from io import BytesIO
import logging
import re
from threading import BoundedSemaphore, Event, Lock
import time
import warnings

from astropy.io import fits
from astropy.time import Time
import astropy.units as u
from astropy.wcs import WCS
import numpy as np

from app.integrations.irsa import ArchiveError, ArchiveTimeout, IrsaClient, SearchTooBroad
from app.integrations.irsa_ranges import Stamp


logger = logging.getLogger(__name__)

# Pixels carrying these flags are left out of the measurement.
IGNORED_FLAGS = (
    "SUR_ERROR", "NONFUNC", "MISSING_DATA", "HOT", "COLD", "NONLINEAR",
    "PERSIST", "BLOOM", "SNOWBALL", "HALO", "SATELLITE_HALO",
)
# Any of these within WARNING_RADIUS of the source marks the measurement as doubtful.
WARNING_FLAGS = IGNORED_FLAGS + (
    "TRANSIENT", "OVERFLOW", "DICHROIC", "CROSSTALK", "GHOST", "GHOST_FPA", "GHOST_EXT", "STREAK",
)
WARNING_RADIUS = 2.5
ANNULUS = (6.0, 9.0)        # Inner and outer radius of the background ring, in pixels.
STAMP_HALF = 10             # The window must hold the ring whatever the sub-pixel position.
MIN_ANNULUS_PIXELS = 20
MIN_APERTURE_FRACTION = 0.5
MIN_PSF_FRACTION = 0.25     # Share of the star's light that must fall on usable pixels for a PSF fit.
METHODS = ("psf", "aperture")  # The PSF fit is the default; the aperture is the fallback.
WORKERS = 8                 # Parallel exposures, as in the notebook.
MAX_CACHED = 20000
SEARCH_TTL_SECONDS = 600    # New exposures of a position appear days apart.
MAX_SEARCHES = 64
MAX_INTERVAL_REQUESTS = 64
MIN_INTERVAL_DAYS = 1 / 24
MISSION_START_MJD = float(Time("2025-01-01", scale="utc").mjd)
_SIP_CARD = re.compile(r"(A|B|AP|BP)_(ORDER|DMAX|\d+_\d+)$")


class Unmeasurable(Exception):
    """This exposure cannot give a trustworthy measurement of the source."""


def aperture_weights(shape, x, y, radius, subsample=10):
    """Fraction of each pixel's area inside a circle; pixel (i, j) spans i - 0.5 to i + 0.5."""
    steps = (np.arange(subsample) + 0.5) / subsample - 0.5
    ys = (np.arange(shape[0])[:, None] + steps).ravel()
    xs = (np.arange(shape[1])[:, None] + steps).ravel()
    inside = (ys[:, None] - y) ** 2 + (xs[None, :] - x) ** 2 <= radius ** 2
    return inside.reshape(shape[0], subsample, shape[1], subsample).mean(axis=(1, 3))


def flag_bits(header) -> dict[str, int]:
    """Flag name -> bit value, as this file's FLAGS header assigns them."""
    return {str(header[key]).strip().upper(): 1 << int(key[4:])
            for key in header if key.startswith("MSKN") and key[4:].isdigit() and int(key[4:]) < 31}


def spectral_coordinates(header, table: bytes, x: float, y: float) -> tuple[float, float]:
    """(wavelength, bandwidth) in microns at a zero-based full-frame pixel.

    Uses the file's lookup-table WCS "W" as notebooks/01-data-overview does.
    """
    blob = fits.PrimaryHDU().header.tostring(padding=True).encode("ascii") + table
    # The wavelength belongs to the detector and filter, not to the optics:
    # the notebook turns SIP off for this WCS, so its terms are left out here.
    plain = fits.Header([card for card in header.cards if not _SIP_CARD.match(card.keyword)])
    try:
        with fits.open(BytesIO(blob), memmap=False) as hdus, warnings.catch_warnings():
            warnings.simplefilter("ignore")
            spectral = WCS(plain, fobj=hdus, key="W")
            spectral.sip = None
            wave, width = spectral.pixel_to_world(x, y)
            values = float(wave.to_value(u.um)), float(width.to_value(u.um))
    except (OSError, ValueError, TypeError, KeyError, IndexError, AttributeError, u.UnitsError) as error:
        raise Unmeasurable("The exposure has no usable spectral WCS.") from error
    if not (np.isfinite(values).all() and values[0] > 0 and values[1] > 0):
        raise Unmeasurable("The position has no wavelength in this exposure.")
    return values


def pixel_solid_angle(header, x: float, y: float) -> float:
    """Steradians covered by the pixel at (x, y), optical distortion included."""
    sky = WCS(header).celestial.pixel_to_world([x - 0.5, x + 0.5, x, x], [y, y, y - 0.5, y + 0.5])
    vectors = sky.cartesian.xyz.value
    area = float(np.linalg.norm(np.cross(vectors[:, 1] - vectors[:, 0], vectors[:, 3] - vectors[:, 2])))
    if not (np.isfinite(area) and area > 0):
        raise Unmeasurable("The pixel scale cannot be determined.")
    return area


def psf_fractions(shape, x, y, model, oversample):
    """Share of a star's light on each pixel, for a star centred at (x, y).

    `model` is the effective PSF: it already includes the pixel's area, so it
    is read at each pixel centre's offset from the star, not integrated.
    Linear interpolation between its samples; normalised so the shares sum to 1.
    """
    centre = (model.shape[0] - 1) / 2
    rows, columns = np.indices(shape)
    u, v = centre + oversample * (columns - x), centre + oversample * (rows - y)
    limit = model.shape[0] - 1
    inside = (u >= 0) & (u <= limit) & (v >= 0) & (v <= limit)
    u0 = np.clip(np.floor(u).astype(int), 0, limit - 1)
    v0 = np.clip(np.floor(v).astype(int), 0, limit - 1)
    fu, fv = u - u0, v - v0
    values = (model[v0, u0] * (1 - fu) * (1 - fv) + model[v0, u0 + 1] * fu * (1 - fv)
              + model[v0 + 1, u0] * (1 - fu) * fv + model[v0 + 1, u0 + 1] * fu * fv)
    values = np.where(inside, values, 0.0)
    total = values.sum()
    if not (np.isfinite(total) and total > 0):
        raise Unmeasurable("The PSF model does not cover the source.")
    return values / total


def measure(stamp: Stamp, radius: float, method: str = "psf") -> dict:
    """Background-subtracted flux of the source in one exposure.

    Flux is in microjanskys: surface brightness (MJy/sr) times the pixel
    solid angle. With "aperture", ignored pixels inside the circle are dropped,
    not filled in, so `bad_pixels` > 0 means some of the source's light is
    missing. With "psf" the fit uses the pixels that remain, so the flux is
    complete and only less precise.
    """
    bits = flag_bits(stamp.flags_header)
    ignored_mask = sum(bits.get(name, 0) for name in IGNORED_FLAGS)
    x, y = stamp.x - stamp.x0, stamp.y - stamp.y0
    rows, columns = np.indices(stamp.image.shape)
    distance = np.hypot(columns - x, rows - y)
    image = stamp.image.astype(np.float64)
    usable = np.isfinite(image) & ((stamp.flags & ignored_mask) == 0)

    # Local background: the ring's median, away from pixels of catalogued sources.
    around = (distance >= ANNULUS[0]) & (distance <= ANNULUS[1]) & usable
    ring = around & ((stamp.flags & bits.get("SOURCE", 0)) == 0)
    # In dense fields SOURCE covers the whole ring; the median of all of it is the best left.
    crowded = int(ring.sum()) < MIN_ANNULUS_PIXELS
    if crowded:
        ring = around
    if int(ring.sum()) < MIN_ANNULUS_PIXELS:
        raise Unmeasurable("Too few usable pixels around the source to estimate the background.")
    background = float(np.median(image[ring]))
    scatter = 1.4826 * float(np.median(np.abs(image[ring] - background)))
    # For independent Gaussian background samples the median's asymptotic
    # variance is pi/2 times the mean's variance. MAD estimates their sigma;
    # crowding and correlated pixels can still make this an approximation.
    background_variance = np.pi / 2 * scatter ** 2 / int(ring.sum())

    to_ujy = pixel_solid_angle(stamp.header, stamp.x, stamp.y) * 1e12
    variance = stamp.variance.astype(np.float64)
    residual = np.where(usable, image - background, 0.0)
    error = None
    if method == "psf":
        if stamp.psf is None:
            raise Unmeasurable("The exposure has no PSF model.")
        weights = psf_fractions(image.shape, x, y, stamp.psf, stamp.psf_oversample)
        fitted = usable & (weights > 0) & np.isfinite(variance) & (variance > 0)
        if weights[fitted].sum() < MIN_PSF_FRACTION:
            raise Unmeasurable("Too little of the source falls on usable pixels.")
        # Least squares of (image - background) = flux * share, each pixel weighted by 1 / variance.
        precision = float((weights[fitted] ** 2 / variance[fitted]).sum())
        amplitude = float((weights[fitted] * residual[fitted] / variance[fitted]).sum()) / precision
        flux = amplitude * to_ujy
        # Fit noise plus the uncertainty of the background level it was measured against.
        leverage = float((weights[fitted] / variance[fitted]).sum()) / precision
        error = float(np.sqrt(1 / precision + leverage ** 2 * background_variance)) * to_ujy
    else:
        weights = aperture_weights(image.shape, x, y, radius)
        kept = np.where(usable, weights, 0.0)
        if kept.sum() < MIN_APERTURE_FRACTION * weights.sum():
            raise Unmeasurable("Most of the aperture is flagged as unusable.")
        flux = float((kept * residual).sum()) * to_ujy
        inside = kept > 0
        if (np.isfinite(variance[inside]) & (variance[inside] > 0)).all():
            # Pixel noise in the aperture plus the uncertainty of the background level.
            total = (kept[inside] ** 2 * variance[inside]).sum() + kept.sum() ** 2 * background_variance
            error = float(np.sqrt(total)) * to_ujy

    near = int(np.bitwise_or.reduce(stamp.flags[distance <= WARNING_RADIUS], initial=0))
    wavelength, bandwidth = spectral_coordinates(stamp.header, stamp.spectral_table, stamp.x, stamp.y)
    return {
        "wavelength_um": wavelength, "bandwidth_um": bandwidth,
        "flux_ujy": flux, "flux_error_ujy": error, "background_mjy_sr": background,
        "bad_pixels": int(((weights > 0) & ~usable).sum()), "crowded": crowded,
        "flags": [name for name in WARNING_FLAGS if near & bits.get(name, 0)],
    }


class SpectrumService:
    def __init__(self, archive: IrsaClient, workers: int = WORKERS):
        self.archive = archive
        self.workers = workers
        # Measurements are deterministic per exposure, position and radius.
        self._cache: OrderedDict = OrderedDict()
        self._searches: OrderedDict = OrderedDict()
        self._lock = Lock()
        # Multiple browser requests share this download ceiling, including
        # requests whose client disconnected while a read was in flight.
        self._downloads = BoundedSemaphore(workers)

    @staticmethod
    def _check_cancelled(cancelled: Event | None):
        if cancelled is not None and cancelled.is_set():
            raise CancelledError()

    def _limited_point(self, image, ra_deg, dec_deg, radius, method, cancelled):
        while True:
            self._check_cancelled(cancelled)
            if self._downloads.acquire(timeout=0.1):
                break
        try:
            self._check_cancelled(cancelled)
            return self._point(image, ra_deg, dec_deg, radius, method)
        finally:
            self._downloads.release()

    def _point(self, image, ra_deg: float, dec_deg: float, radius: float, method: str):
        """A measurement dict, None when the exposure cannot measure the source, or the archive error."""
        key = (image.source_url, ra_deg, dec_deg, radius, method)
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return self._cache[key]
        try:
            stamp = self.archive.photometry_stamp(image.source_url, ra_deg, dec_deg, STAMP_HALF, psf=method == "psf")
            point = None if stamp is None else {
                **measure(stamp, radius, method),
                "detector": image.detector, "observation_id": image.observation_id,
                "observed_mjd": image.observed_start_mjd,
                "observed_utc": f"{Time(image.observed_start_mjd, format='mjd', scale='utc').isot}Z",
                "source_url": image.source_url,
            }
        except Unmeasurable:
            point = None
        except ArchiveError as error:
            # Not cached: the next request tries this exposure again.
            logger.warning("Spectrum exposure unavailable: %s (%s)", image.source_url, error)
            return error
        with self._lock:
            self._cache[key] = point
            while len(self._cache) > MAX_CACHED:
                self._cache.popitem(last=False)
        return point

    def _covering(self, ra_deg: float, dec_deg: float, cancelled: Event | None = None) -> list:
        """Exposures at a position. The archive search is the same for any detector, so it is kept."""
        key, now = (ra_deg, dec_deg), time.monotonic()
        with self._lock:
            found = self._searches.get(key)
            if found and now - found[0] < SEARCH_TTL_SECONDS:
                return found[1]
        # One budget bounds the whole search, including splitting a dense
        # region into smaller date intervals when SIA truncates its rows.
        deadline = time.monotonic() + self.archive.budget_seconds
        self._check_cancelled(cancelled)
        try:
            images = self.archive.search_all(ra_deg=ra_deg, dec_deg=dec_deg, detector=None,
                                             deadline=deadline)
        except SearchTooBroad:
            images = self._split_covering(ra_deg, dec_deg, deadline, cancelled)
        self._check_cancelled(cancelled)
        with self._lock:
            self._searches[key] = (now, images)
            while len(self._searches) > MAX_SEARCHES:
                self._searches.popitem(last=False)
        return images

    def _split_covering(self, ra_deg, dec_deg, deadline, cancelled):
        # SPHEREx observations begin in 2025. Tomorrow's UTC boundary also
        # includes every observation available at the moment of this search.
        pending = [(MISSION_START_MJD, float(np.floor(Time.now().mjd)) + 1)]
        images = {}
        requests = 1  # Include the unbounded query that overflowed.
        while pending:
            self._check_cancelled(cancelled)
            if time.monotonic() >= deadline:
                raise ArchiveTimeout("IRSA spectrum search timed out. Please try again.")
            if requests >= MAX_INTERVAL_REQUESTS:
                raise SearchTooBroad("This region has too many observations to complete its spectrum search.")
            lower, upper = pending.pop()
            requests += 1
            try:
                rows = self.archive.search_all(
                    ra_deg=ra_deg, dec_deg=dec_deg, detector=None,
                    start_mjd=lower, end_mjd=upper, deadline=deadline,
                )
            except SearchTooBroad as error:
                if upper - lower <= MIN_INTERVAL_DAYS:
                    raise SearchTooBroad("This region has too many observations to complete its spectrum search.") from error
                middle = (lower + upper) / 2
                pending.extend(((middle, upper), (lower, middle)))
                continue
            for row in rows:
                observed = row.observed_start_mjd
                if observed is not None and lower <= observed < upper:
                    images[row.source_url] = row
        return sorted(images.values(), key=lambda image: (-image.observed_start_mjd, image.source_url))

    def spectrum(self, ra_deg: float, dec_deg: float, detector: int, radius_px: float = 3.0,
                 method: str = "psf", cancelled: Event | None = None) -> dict:
        """One detector's exposures of the position, measured and sorted by wavelength."""
        self._check_cancelled(cancelled)
        images = [image for image in self._covering(ra_deg, dec_deg, cancelled) if image.detector == detector]
        self._check_cancelled(cancelled)
        with ThreadPoolExecutor(max_workers=self.workers) as pool:
            results = list(pool.map(
                lambda image: self._limited_point(image, ra_deg, dec_deg, radius_px, method, cancelled), images))
        self._check_cancelled(cancelled)
        points = sorted((result for result in results if isinstance(result, dict)),
                        key=lambda point: point["wavelength_um"])
        failed = sum(isinstance(result, ArchiveError) for result in results)
        return {
            "position": {"ra_deg": ra_deg, "dec_deg": dec_deg, "frame": "ICRS"},
            "detector": detector, "method": method,
            "aperture": {"radius_px": radius_px, "annulus_px": list(ANNULUS)},
            "exposures": {"found": len(images), "measured": len(points), "failed": failed,
                          "skipped": len(images) - len(points) - failed},
            "points": points,
        }
