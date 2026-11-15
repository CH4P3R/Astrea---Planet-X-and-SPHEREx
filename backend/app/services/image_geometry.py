"""Observer-relative click and FITS geometry, adapted from the prototype."""
from dataclasses import dataclass

import astropy.units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS
import numpy as np
from app.services.sky import horizon_vectors, observation_context

# A box selection becomes an image search, so it obeys the cutout limits:
# at most the 0.5° search size, at least one SPHEREx pixel (6.15").
MAX_SELECTION_DEG = 0.5
MIN_SELECTION_DEG = 6.15 / 3600


class MeshError(ValueError):
    """The image WCS cannot be meshed within the supported accuracy."""


class SelectionTooLarge(ValueError):
    """A dragged box needs a cutout larger than the search allows."""

    def __init__(self, size_deg: float):
        super().__init__(f"The selected box spans {size_deg * 60:.1f}′; the maximum is "
                         f"{MAX_SELECTION_DEG * 60:.0f}′. Zoom in or drag a smaller box.")


class SelectionTooSmall(ValueError):
    """A dragged box is smaller than one detector pixel."""

    def __init__(self):
        super().__init__("The selected box is smaller than one pixel. Drag a larger box or click instead.")


@dataclass(frozen=True)
class BoxGeometry:
    """ICRS centre and corners of a dragged box, and the north-aligned square that covers it."""

    ra_deg: float
    dec_deg: float
    size_deg: float
    corners: list[tuple[float, float]]


def unit_vectors(coords):
    return coords.icrs.cartesian.xyz.value.T

def build_mesh(wcs, width, height):
    """Refine until triangle interpolation agrees with WCS within 0.15 native pixel.

    Vertex UVs lie on pixel *edges*. Astropy's integer coordinates denote centers.
    This avoids a half-pixel shift and preserves the FITS bottom-to-top row order.
    """
    for segments in (8, 16, 32, 64, 128):
        uu, vv = np.meshgrid(np.linspace(0, 1, segments + 1), np.linspace(0, 1, segments + 1))
        coords = wcs.pixel_to_world(uu.ravel() * width - 0.5, vv.ravel() * height - 0.5).icrs
        vectors = unit_vectors(coords)
        if not np.all(np.isfinite(vectors)):
            raise MeshError("The image WCS contains invalid directions.")
        cells = np.arange((segments + 1) ** 2).reshape(segments + 1, segments + 1)
        a, b, c, d = (part.ravel() for part in (cells[:-1, :-1], cells[:-1, 1:], cells[1:, :-1], cells[1:, 1:]))
        triangles = np.concatenate((np.stack((a, b, c), -1), np.stack((b, d, c), -1)))
        uv = np.stack((uu.ravel(), vv.ravel()), -1)
        # Check both triangle centroids and all edge midpoints, in source pixels.
        checks = [([0, 1, 2], 3), ([0, 1], 2), ([1, 2], 2), ([2, 0], 2)]
        error = 0.0
        for corners, count in checks:
            selected = triangles[:, corners]
            average = vectors[selected].sum(axis=1) / count
            interpolated = SkyCoord(x=average[:, 0], y=average[:, 1], z=average[:, 2], representation_type="cartesian", frame="icrs")
            px, py = wcs.world_to_pixel(interpolated)
            if not np.all(np.isfinite(px)) or not np.all(np.isfinite(py)):
                raise MeshError("The image WCS could not be inverted reliably.")
            expected = uv[selected].mean(axis=1) * [width, height] - 0.5
            error = max(error, float(np.max(np.hypot(px - expected[:, 0], py - expected[:, 1]))))
        if np.isfinite(error) and error <= 0.15:
            return coords, uv.astype(float).ravel().tolist(), triangles.ravel().tolist(), error, segments
    raise MeshError("This image's distortion requires a finer mesh than the supported limit.")

def directions_to_icrs(directions, observer, at):
    """ICRS coordinates of scene directions (+X east, +Y up, -Z north) for one observer and time."""
    vectors = np.asarray(directions, dtype=float).reshape(-1, 3)
    lengths = np.linalg.norm(vectors, axis=1)
    if not np.all(np.isfinite(vectors)) or np.any(lengths < 1e-8):
        raise ValueError("Choose a valid sky direction.")
    x, y, z = (vectors / lengths[:, None]).T
    _, _, frame, _ = observation_context(observer, at, False)
    return SkyCoord(az=np.arctan2(x, -z) * u.rad, alt=np.arcsin(np.clip(y, -1, 1)) * u.rad,
                    frame=frame).icrs.ravel()


def click_to_icrs(direction, observer, at):
    coordinate = directions_to_icrs(direction, observer, at)
    return float(coordinate.ra.deg[0]), float(coordinate.dec.deg[0])


def box_selection(corners: SkyCoord) -> BoxGeometry:
    """Centre and covering size of a box given by its ICRS corners.

    The centre is the normalised mean of the corners' unit vectors, so it is
    well defined across RA 0°/360° and near the poles. The size is the side of
    the north-aligned square, in the tangent plane at the centre, that holds
    every corner: a box rotated relative to north gets a larger square.
    """
    mean = unit_vectors(corners).mean(axis=0)
    length = np.linalg.norm(mean)
    if not np.isfinite(length) or length < 1e-8:
        raise SelectionTooLarge(180.0)
    x, y, z = mean / length
    center = SkyCoord(ra=np.arctan2(y, x) * u.rad, dec=np.arcsin(np.clip(z, -1, 1)) * u.rad, frame="icrs")
    offsets = corners.icrs.transform_to(center.skyoffset_frame())
    size_deg = 2 * float(max(np.max(np.abs(offsets.lon.wrap_at(180 * u.deg).deg)),
                             np.max(np.abs(offsets.lat.deg))))
    if size_deg > MAX_SELECTION_DEG:
        raise SelectionTooLarge(size_deg)
    if size_deg < MIN_SELECTION_DEG:
        raise SelectionTooSmall()
    ra = float(center.ra.wrap_at(360 * u.deg).deg) % 360.0
    return BoxGeometry(ra_deg=ra, dec_deg=float(center.dec.deg), size_deg=size_deg,
                       corners=[(float(c.ra.deg) % 360.0, float(c.dec.deg)) for c in corners.icrs])


def project_image(metadata, observer, at, live):
    header = fits.Header()
    for card in metadata.image.wcs_header:
        header.append((card.keyword, card.value, card.comment))
    wcs = WCS(header).celestial
    coords, uv, indices, error, segments = build_mesh(
        wcs, metadata.image.width, metadata.image.height)
    milliseconds, _, frame, _ = observation_context(observer, at, live)
    local = coords.transform_to(frame)
    center = SkyCoord(ra=[metadata.image.center.ra_deg] * u.deg,
                      dec=[metadata.image.center.dec_deg] * u.deg, frame="icrs").transform_to(frame)
    return {
        "image_id": metadata.id, "sample_times_ms": milliseconds.tolist(),
        "directions": np.round(horizon_vectors(local.alt.rad, local.az.rad).reshape(len(milliseconds), -1), 9).tolist(),
        "center_directions": horizon_vectors(center.alt.rad, center.az.rad).reshape(-1, 3).tolist(),
        "uv": uv, "indices": indices, "mesh_error_pixels": error, "mesh_segments": segments,
    }
