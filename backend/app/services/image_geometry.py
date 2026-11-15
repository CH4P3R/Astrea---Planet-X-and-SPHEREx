"""Observer-relative click and FITS geometry, adapted from the prototype."""
import astropy.units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS
import numpy as np
from app.services.sky import horizon_vectors, observation_context

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
            raise ValueError("The image WCS contains invalid directions.")
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
                raise ValueError("The image WCS could not be inverted reliably.")
            expected = uv[selected].mean(axis=1) * [width, height] - 0.5
            error = max(error, float(np.max(np.hypot(px - expected[:, 0], py - expected[:, 1]))))
        if np.isfinite(error) and error <= 0.15:
            return coords, uv.astype(float).ravel().tolist(), triangles.ravel().tolist(), error, segments
    raise ValueError("This image's distortion requires a finer mesh than the supported limit.")

def click_to_icrs(direction, observer, at):
    vector = np.asarray(direction, dtype=float)
    length = np.linalg.norm(vector)
    if not np.all(np.isfinite(vector)) or length < 1e-8:
        raise ValueError("Choose a valid sky direction.")
    x, y, z = vector / length
    _, _, frame, _ = observation_context(observer, at, False)
    coordinate = SkyCoord(az=np.arctan2(x, -z) * u.rad, alt=np.arcsin(np.clip(y, -1, 1)) * u.rad,
                          frame=frame).icrs
    return float(coordinate.ra.deg.item()), float(coordinate.dec.deg.item())


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
