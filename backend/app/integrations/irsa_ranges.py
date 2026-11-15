"""Read only the needed bytes of a SPHEREx exposure through HTTP range requests.

The IBE cutout service returns every extension of an exposure, including a
4 MB PSF table, however small the cutout. A Level 2 file is plain FITS on a
server that honours `Range`, so the headers can be read first and then just
the pixel rows of the requested window. Each plane (IMAGE, FLAGS, ZODI,
VARIANCE) is therefore fetched separately and only when it is wanted.

IMAGE, ZODI and VARIANCE are uncompressed: a window costs its own bytes.
FLAGS is tile-compressed with one tile per full detector row, so its window
costs whole rows (about 4 kB each) and is the most expensive plane.

Anything unexpected in the file layout raises PartialReadError, so the caller
can fall back to the cutout service. Network errors propagate as `requests`
exceptions for the caller to translate.
"""

from bisect import bisect_right
from collections import OrderedDict
from io import BytesIO
from threading import RLock
import time

import astropy.units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_scales
import numpy as np
import requests

from app.integrations.http_retry import RETRY_STATUS, timeout_until, with_retries


BLOCK = 2880
HEADER_GUESS = 16 * BLOCK   # Covers the largest SPHEREx header plus a compressed row index.
MAX_RANGES = 96             # Ranges per request; keeps the Range header well under 8 kB.
MERGE_GAP = 256             # Cheaper to download a small gap than to pay for another part.
REQUEST_SECONDS = 90
MAX_LAYOUTS = 256
DTYPES = {8: "u1", 16: ">i2", 32: ">i4", 64: ">i8", -32: ">f4", -64: ">f8"}
# Header cards that must travel with a plane for it to be interpreted.
PLANE_CARDS = ("BUNIT", "MSKN", "MSKD")

class PartialReadError(Exception):
    """The file cannot be read by ranges; use the cutout service instead."""


def _content_range(text):
    try:
        span, total = text.strip().removeprefix("bytes").strip().split("/")
        first, last = (int(value) for value in span.split("-"))
        return first, int(total), last - first + 1
    except ValueError as error:
        raise PartialReadError("Unreadable Content-Range.") from error


def _request_once(session, url, spec, limit, deadline=None):
    """Returns ([(start, bytes)], total file size)."""
    started = time.monotonic()
    stop = started + REQUEST_SECONDS if deadline is None else min(started + REQUEST_SECONDS, deadline)
    with session.get(url, headers={"Range": f"bytes={spec}", "Accept-Encoding": "identity"},
                     timeout=timeout_until(deadline), stream=True, allow_redirects=False) as response:
        if response.status_code in RETRY_STATUS:
            response.raise_for_status()
        if response.status_code != 206:
            # A plain 200 would be the whole 60 MB exposure: never read it.
            raise PartialReadError("The archive did not honour a partial download.")
        chunks, size = [], 0
        for chunk in response.iter_content(65536):
            size += len(chunk)
            if time.monotonic() > stop:
                raise requests.Timeout("Partial download exceeded its deadline.")
            if size > limit:
                raise PartialReadError("The partial download is larger than requested.")
            chunks.append(chunk)
        body = b"".join(chunks)
        kind = response.headers.get("Content-Type", "")
        if not kind.lower().startswith("multipart/byteranges"):
            start, total, _ = _content_range(response.headers.get("Content-Range", ""))
            return [(start, body)], total
    boundary = kind.split("boundary=", 1)[-1].strip().strip('"').encode()
    parts, total, cursor = [], None, 0
    while True:
        cursor = body.find(b"--" + boundary, cursor)
        if cursor < 0 or body[cursor + len(boundary) + 2:cursor + len(boundary) + 4] == b"--":
            break
        end = body.find(b"\r\n\r\n", cursor)
        if end < 0:
            break
        headers = body[cursor:end].decode("latin-1").split("\r\n")
        line = next((h.split(":", 1)[1] for h in headers if h.lower().startswith("content-range:")), "")
        # Lengths, not boundary text, delimit parts: pixel bytes may contain anything.
        start, total, length = _content_range(line)
        parts.append((start, body[end + 4:end + 4 + length]))
        cursor = end + 4 + length
    if not parts:
        raise PartialReadError("Unreadable multipart response.")
    return parts, total


def _header_at(buffer):
    """Parse a header that starts at buffer[0]; None when its END card is missing."""
    for end in range(0, len(buffer) - 79, 80):
        if buffer[end:end + 8] == b"END     ":
            length = (end + 80 + BLOCK - 1) // BLOCK * BLOCK
            return fits.Header.fromstring(buffer[:end + 80].decode("ascii", "replace")), length
    return None


def _data_size(header):
    axes = header.get("NAXIS", 0)
    if not axes:
        return 0
    count = 1
    for axis in range(1, axes + 1):
        count *= header[f"NAXIS{axis}"]
    return abs(header["BITPIX"]) // 8 * header.get("GCOUNT", 1) * (header.get("PCOUNT", 0) + count)


def _padded(size):
    return (size + BLOCK - 1) // BLOCK * BLOCK


class RemoteExposure:
    """Layout of one remote FITS file, discovered lazily and kept in memory."""

    def __init__(self, reader, url):
        self.reader = reader
        self.url = url
        self.total = None
        self.hdus = []    # Contiguous from byte 0: {name, header, offset, data, size}.
        self._spare = {}  # Bytes already downloaded, keyed by their file offset.
        self._guard = RLock()  # One exposure at a time; different exposures in parallel.

    def _next_offset(self):
        if not self.hdus:
            return 0
        return self.hdus[-1]["data"] + _padded(self.hdus[-1]["size"])

    def _extend(self, fetch=True, deadline=None):
        """Learn the next extension's header. False once nothing further is known."""
        offset = self._next_offset()
        if offset >= self.total:
            return False
        buffer = self._spare.pop(offset, b"")
        parsed = _header_at(buffer)
        if parsed is None:
            if not fetch:
                return False
            for size in (HEADER_GUESS, 8 * HEADER_GUESS):
                buffer = self._read([(offset, min(size, self.total - offset))], deadline)[0]
                parsed = _header_at(buffer)
                if parsed:
                    break
            else:
                raise PartialReadError("A FITS header is larger than supported.")
        header, length = parsed
        entry = {"name": str(header.get("EXTNAME", "PRIMARY")).strip().upper(), "header": header,
                 "offset": offset, "data": offset + length, "size": _data_size(header)}
        self.hdus.append(entry)
        if len(buffer) > length:
            self._spare[entry["data"]] = buffer[length:]
        return True

    def find(self, name, deadline=None):
        name = name.upper()
        with self._guard:
            while True:
                for entry in self.hdus:
                    if entry["name"] == name:
                        return entry
                if not self._extend(deadline=deadline):
                    return None

    def _read(self, ranges, deadline=None):
        """Download byte ranges [(start, length)], merging neighbours into few requests."""
        merged = []
        for start, length in sorted(set(ranges)):
            if merged and start - (merged[-1][0] + merged[-1][1]) <= MERGE_GAP:
                merged[-1][1] = max(merged[-1][1], start + length - merged[-1][0])
            else:
                merged.append([start, length])
        blobs = []
        for first in range(0, len(merged), MAX_RANGES):
            group = merged[first:first + MAX_RANGES]
            spec = ",".join(f"{start}-{start + length - 1}" for start, length in group)
            parts, _ = self.reader._request(
                self.url, spec, sum(length for _, length in group) + 512 * len(group) + 4096, deadline)
            blobs.extend(parts)
        blobs.sort()
        starts = [start for start, _ in blobs]
        result = []
        for start, length in ranges:
            index = bisect_right(starts, start) - 1
            piece = blobs[index][1][start - blobs[index][0]:start - blobs[index][0] + length] if index >= 0 else b""
            if len(piece) != length:
                raise PartialReadError("The archive returned an incomplete partial download.")
            result.append(piece)
        return result

    def _data(self, entry, length, deadline=None):
        """Leading bytes of an extension's data, reusing what a header request already brought."""
        spare = self._spare.get(entry["data"], b"")
        return spare[:length] if len(spare) >= length else self._read([(entry["data"], length)], deadline)[0]

    def window(self, name, x0, y0, width, height, deadline=None):
        """Pixels [y0:y0+height, x0:x0+width] of an image extension, in native byte order."""
        entry = self.find(name, deadline)
        if entry is None:
            raise PartialReadError(f"The exposure has no {name} extension.")
        header = entry["header"]
        with self._guard:
            if header.get("ZIMAGE"):
                return self._compressed_window(entry, x0, y0, width, height, deadline)
            if (header.get("NAXIS") != 2 or header["BITPIX"] not in DTYPES
                    or str(header.get("XTENSION", "IMAGE")).strip() != "IMAGE"):
                raise PartialReadError(f"{name} is not a plain two-dimensional image.")
            full_width, full_height = header["NAXIS1"], header["NAXIS2"]
            if not (0 <= x0 and 0 <= y0 and width > 0 and height > 0
                    and x0 + width <= full_width and y0 + height <= full_height):
                raise PartialReadError("The requested window lies outside the image.")
            size = abs(header["BITPIX"]) // 8
            rows = [(entry["data"] + (y * full_width + x0) * size, width * size) for y in range(y0, y0 + height)]
            pieces = self._read(rows, deadline)
        data = np.frombuffer(b"".join(pieces), dtype=DTYPES[header["BITPIX"]]).reshape(height, width)
        data = data.astype(data.dtype.newbyteorder("="))
        if header.get("BSCALE", 1) != 1 or header.get("BZERO", 0) != 0:
            data = data * header.get("BSCALE", 1) + header.get("BZERO", 0)
        return data

    def _compressed_window(self, entry, x0, y0, width, height, deadline=None):
        """Tile-compressed image whose tiles are whole rows: fetch only the rows' tiles."""
        header = entry["header"]
        try:
            full_width, full_height, row_bytes = header["ZNAXIS1"], header["ZNAXIS2"], header["NAXIS1"]
        except KeyError as error:
            raise PartialReadError("Incomplete compressed-image header.") from error
        form = str(header.get("TFORM1", "")).lstrip("1")
        if (header.get("ZNAXIS") != 2 or header.get("TFIELDS") != 1 or form[:1] not in ("P", "Q")
                or header.get("ZTILE1", full_width) != full_width or header.get("ZTILE2", 1) != 1
                or header["NAXIS2"] != full_height or row_bytes != (8 if form[0] == "P" else 16)):
            raise PartialReadError("The compressed plane uses an unsupported tile layout.")
        if not (0 <= x0 and 0 <= y0 and width > 0 and height > 0
                and x0 + width <= full_width and y0 + height <= full_height):
            raise PartialReadError("The requested window lies outside the image.")
        kind = ">i4" if form[0] == "P" else ">i8"
        table = self._data(entry, row_bytes * full_height, deadline)
        rows = np.frombuffer(table[y0 * row_bytes:(y0 + height) * row_bytes], dtype=kind).reshape(height, 2)
        counts, offsets = rows[:, 0].astype(np.int64), rows[:, 1].astype(np.int64)
        used = counts > 0
        if not used.any():
            raise PartialReadError("The compressed plane has no data in this window.")
        low, high = int(offsets[used].min()), int((offsets + counts)[used].max())
        heap_start = entry["data"] + header.get("THEAP", row_bytes * full_height)
        heap = self._read([(heap_start + low, high - low)], deadline)[0]
        # Rebuild a small, valid compressed table holding only these rows.
        small = header.copy()
        for key in ("THEAP", "CHECKSUM", "DATASUM", "ZHECKSUM", "ZDATASUM"):
            small.remove(key, ignore_missing=True)
        small["NAXIS2"], small["ZNAXIS2"], small["PCOUNT"] = height, height, len(heap)
        index = np.stack((counts, np.where(used, offsets - low, 0)), axis=1).astype(kind).tobytes()
        body = index + heap
        blob = (fits.PrimaryHDU().header.tostring(padding=True).encode("ascii")
                + small.tostring(padding=True).encode("ascii") + body.ljust(_padded(len(body)), b"\0"))
        try:
            with fits.open(BytesIO(blob), memmap=False) as hdus:
                return np.array(hdus[1].data[:, x0:x0 + width])
        except (OSError, ValueError, TypeError, IndexError) as error:
            raise PartialReadError("The compressed plane could not be decoded.") from error


def pixel_window(header, ra_deg, dec_deg, size_deg):
    """Window (x0, y0, width, height) covering size_deg around a sky position.

    Clipped at the detector edge, like the archive's own cutouts. The result
    depends only on the exposure header and the request, so every plane of the
    same selection is read over the identical window.
    """
    try:
        wcs = WCS(header).celestial
        x, y = (float(v) for v in wcs.world_to_pixel(SkyCoord(ra=ra_deg * u.deg, dec=dec_deg * u.deg, frame="icrs")))
        # Degrees per pixel along each axis; SPHEREx pixels are not exactly square.
        half_x, half_y = (size_deg / float(scale) / 2 for scale in proj_plane_pixel_scales(wcs))
        full_width, full_height = int(header["NAXIS1"]), int(header["NAXIS2"])
    except (KeyError, ValueError, TypeError) as error:
        raise PartialReadError("The exposure has no usable celestial WCS.") from error
    if not np.isfinite([x, y, half_x, half_y]).all():
        raise PartialReadError("The position cannot be located in this exposure.")
    x0, x1 = max(0, int(np.floor(x - half_x + 0.5))), min(full_width, int(np.floor(x + half_x + 0.5)) + 1)
    y0, y1 = max(0, int(np.floor(y - half_y + 0.5))), min(full_height, int(np.floor(y + half_y + 0.5)) + 1)
    if x1 <= x0 or y1 <= y0:
        raise PartialReadError("The position is outside this exposure.")
    return x0, y0, x1 - x0, y1 - y0


def grid_origin(header, grid):
    """Origin (x0, y0) of an image grid inside the pixels that `header` describes.

    Every window of one exposure shares the detector's reference pixel, shifted
    by the window origin: CRPIX_window = CRPIX_header - origin. `grid` is
    (crpix1, crpix2, width, height) of the loaded image.
    """
    crpix1, crpix2 = grid[0], grid[1]
    offsets = (float(header["CRPIX1"]) - crpix1, float(header["CRPIX2"]) - crpix2)
    if not all(np.isfinite(offsets)) or any(abs(value - round(value)) > 1e-3 for value in offsets):
        raise PartialReadError("The image grid does not match this exposure's pixels.")
    return int(round(offsets[0])), int(round(offsets[1]))


def _science(exposure, deadline=None):
    science = exposure.find("IMAGE", deadline)
    if science is None or science["header"].get("NAXIS") != 2:
        raise PartialReadError("The exposure has no two-dimensional IMAGE extension.")
    return science


class RangeReader:
    """Byte-range access to remote exposures. Owns its HTTP session and layout cache.

    `deadline` arguments are time.monotonic() values bounding a whole read,
    retries included; None means only the per-request limits apply.
    """

    def __init__(self, session: requests.Session | None = None, max_layouts: int = MAX_LAYOUTS):
        self.session = session if session is not None else requests.Session()
        self.max_layouts = max_layouts
        self._lock = RLock()
        self._layouts = OrderedDict()

    def _request(self, url, spec, limit, deadline=None):
        """One ranged GET, retried when the archive is briefly busy."""
        return with_retries(lambda: _request_once(self.session, url, spec, limit, deadline), deadline=deadline)

    def open(self, url, deadline=None):
        with self._lock:
            exposure = self._layouts.get(url)
            if exposure is not None:
                self._layouts.move_to_end(url)
                return exposure
        # Network access happens outside the registry lock.
        exposure = RemoteExposure(self, url)
        parts, exposure.total = self._request(url, f"0-{HEADER_GUESS - 1}", 2 * HEADER_GUESS, deadline)
        exposure._spare[0] = parts[0][1]
        while exposure._extend(fetch=False):
            pass
        if not exposure.hdus:
            raise PartialReadError("The archive file does not start with a FITS header.")
        with self._lock:
            exposure = self._layouts.setdefault(url, exposure)
            while len(self._layouts) > self.max_layouts:
                self._layouts.popitem(last=False)
        return exposure

    def read_cutout(self, url, ra_deg, dec_deg, size_deg, deadline=None):
        """FITS bytes holding the primary header and the IMAGE window only."""
        exposure = self.open(url, deadline)
        science = _science(exposure, deadline)
        x0, y0, width, height = pixel_window(science["header"], ra_deg, dec_deg, size_deg)
        header = science["header"].copy()
        for key in list(header):
            # Every WCS description (primary and alternates) shares the pixel origin.
            if key.startswith("CRPIX1") and len(key) <= 7:
                header[key] = header[key] - x0
            elif key.startswith("CRPIX2") and len(key) <= 7:
                header[key] = header[key] - y0
        primary = exposure.hdus[0]["header"] if exposure.hdus[0]["size"] == 0 else None
        output = BytesIO()
        fits.HDUList([
            fits.PrimaryHDU(header=primary),
            fits.ImageHDU(exposure.window("IMAGE", x0, y0, width, height, deadline), header=header, name="IMAGE"),
        ]).writeto(output)
        return output.getvalue()

    def read_plane(self, url, extension, grid, deadline=None):
        """FITS bytes with one image extension, read over exactly the loaded image's grid.

        `grid` is (crpix1, crpix2, width, height) of the loaded image, so the
        plane lines up with it whichever way that image was obtained.
        """
        exposure = self.open(url, deadline)
        x0, y0 = grid_origin(_science(exposure, deadline)["header"], grid)
        data = exposure.window(extension, x0, y0, int(grid[2]), int(grid[3]), deadline)
        source = exposure.find(extension, deadline)["header"]
        header = fits.Header([card for card in source.cards if card.keyword.startswith(PLANE_CARDS)])
        output = BytesIO()
        fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(data, header=header, name=extension)]).writeto(output)
        return output.getvalue()
