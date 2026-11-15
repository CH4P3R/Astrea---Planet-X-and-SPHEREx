"""Decode a SPHEREx IMAGE plane without masking, stretching or reprojection."""

from dataclasses import dataclass
from io import BytesIO
import math

from astropy.io import fits
from astropy.wcs import WCS
import numpy as np


# A detector image is 2040 x 2040. Allow room for other cutout dimensions,
# while bounding decoded allocations even when an upstream header is malformed.
MAX_IMAGE_PIXELS = 4096 * 4096

_METADATA_KEYS = (
    "OBSID", "DETECTOR", "VERSION", "PROCVER", "PIPEVERS", "PIPELINE",
    "TELESCOP", "INSTRUME", "DATE", "DATE-OBS", "DATE-BEG", "DATE-END",
    "MJD-OBS", "MJD-BEG", "MJD-END", "MJDREF", "MJDREFI", "MJDREFF",
    "TIMESYS", "TIMEUNIT", "EXPTIME",
)


class InvalidFitsError(ValueError):
    """The upstream FITS cannot provide a usable image and spatial WCS."""


@dataclass(frozen=True)
class DecodedImage:
    """Pixels and their JSON-safe interpretation, independent of HTTP."""

    pixels: bytes
    metadata: dict


def _json_scalar(value):
    """Keep header scalars JSON-safe, including undefined FITS values."""
    if isinstance(value, (bool, str, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, fits.card.Undefined) or value is None:
        return None
    return str(value)


def _provenance(primary: fits.Header, image: fits.Header) -> dict:
    fields = {
        key: _json_scalar(image[key] if key in image else primary[key])
        for key in _METADATA_KEYS
        if key in image or key in primary
    }
    observation_id = fields.get("OBSID")
    version = next(
        (fields[key] for key in ("VERSION", "PROCVER", "PIPEVERS")
         if fields.get(key) is not None),
        None,
    )
    return {
        "observation_id": str(observation_id) if observation_id is not None else None,
        "detector": fields.get("DETECTOR"),
        "processing_version": str(version) if version is not None else None,
        # DATE is file creation metadata, not an inferred observation timestamp.
        # Preserve date cards and TIMESYS as supplied; archive timing is separate.
        "header_fields": fields,
    }


def _wire_array(data: np.ndarray) -> np.ndarray:
    """Preserve floating precision and represent ordinary integer planes exactly."""
    if data.dtype.kind not in "fiu":
        raise InvalidFitsError("IMAGE must contain numeric pixels.")
    if data.dtype.kind in "iu" and data.dtype.itemsize == 8:
        if np.any(data > 2**53) or (data.dtype.kind == "i" and np.any(data < -(2**53))):
            raise InvalidFitsError("IMAGE contains integers not exactly representable as float64.")
    # Native SPHEREx planes are float32. Do not downcast float64 inputs or
    # introduce rounding for integer planes by coercing everything to float32.
    dtype = "<f4" if data.dtype.kind == "f" and data.dtype.itemsize <= 4 else "<f8"
    return np.ascontiguousarray(data, dtype=dtype)


def decode_cutout(content: bytes) -> DecodedImage:
    """Read only IMAGE and its primary spatial WCS from an in-memory FITS.

    Bytes are little-endian floats in C order: pixel (x, y) starts at
    (y * width + x) * itemsize. Row zero is the original FITS lower row;
    there is no flip or north-up rotation. Nonfinite samples stay nonfinite.

    Center and footprint use ICRS degrees. Footprint corners follow the
    *outer edges* of the image in lower-left, lower-right, upper-right,
    upper-left order. The serialized WCS retains its native reference frame,
    SIP distortion terms and the FITS one-based CRPIX convention.
    """
    try:
        with fits.open(BytesIO(content), memmap=False, lazy_load_hdus=True) as hdus:
            try:
                image = hdus["IMAGE"]
            except KeyError as error:
                raise InvalidFitsError("FITS has no IMAGE extension.") from error
            if not isinstance(image, (fits.ImageHDU, fits.CompImageHDU)):
                raise InvalidFitsError("IMAGE must be an image HDU.")
            header = image.header
            if header.get("NAXIS") != 2:
                raise InvalidFitsError("IMAGE must have exactly two dimensions.")
            width, height = int(header["NAXIS1"]), int(header["NAXIS2"])
            if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
                raise InvalidFitsError("IMAGE dimensions exceed the supported pixel count.")

            spatial = WCS(header, relax=True).celestial
            if not spatial.has_celestial or spatial.pixel_n_dim != 2:
                raise InvalidFitsError("IMAGE requires a two-dimensional celestial WCS.")

            center = spatial.pixel_to_world((width - 1) / 2, (height - 1) / 2).icrs
            sky_corners = spatial.pixel_to_world(
                np.array([-0.5, width - 0.5, width - 0.5, -0.5]),
                np.array([-0.5, -0.5, height - 0.5, height - 0.5]),
            ).icrs
            footprint = np.column_stack((sky_corners.ra.deg, sky_corners.dec.deg))
            center_values = [float(center.ra.deg), float(center.dec.deg)]
            if not np.all(np.isfinite(footprint)) or not np.all(np.isfinite(center_values)):
                raise InvalidFitsError("IMAGE WCS does not produce finite sky coordinates.")

            data = image.data
            if data is None or data.shape != (height, width):
                raise InvalidFitsError("IMAGE pixels do not match the declared dimensions.")
            array = _wire_array(data)
            finite = np.isfinite(array)
            valid = array[finite]
            unit = header.get("BUNIT", hdus[0].header.get("BUNIT"))
            metadata = {
                "width": width,
                "height": height,
                "dtype": "float32" if array.dtype.itemsize == 4 else "float64",
                "byte_order": "little",
                "array_order": "C",
                "pixel_origin": "lower-left",
                "unit": str(unit) if unit is not None else None,
                "finite_min": float(valid.min()) if valid.size else None,
                "finite_max": float(valid.max()) if valid.size else None,
                "nonfinite_count": int(array.size - valid.size),
                "center": {"ra_deg": center_values[0], "dec_deg": center_values[1], "frame": "ICRS"},
                "footprint": footprint.tolist(),
                "wcs_header": [
                    {"keyword": card.keyword, "value": _json_scalar(card.value), "comment": card.comment}
                    for card in spatial.to_header(relax=True).cards
                ],
                "fits_metadata": _provenance(hdus[0].header, header),
            }
            return DecodedImage(pixels=array.tobytes(order="C"), metadata=metadata)
    except InvalidFitsError:
        raise
    except (OSError, ValueError, TypeError, KeyError, IndexError, AttributeError) as error:
        raise InvalidFitsError("The FITS image or its celestial WCS is invalid.") from error
