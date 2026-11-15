"""Pure quality and background corrections applied on request (roadmap step 3).

Nothing here touches the network or the cache. Rejected samples become NaN,
the same "leave transparent" convention the raw pixels already use.
"""

import numpy as np


# SOURCE marks pixels on known sources. Masking it would hide the stars.
NEVER_MASKED = frozenset({"SOURCE"})


def bad_bits(flag_bits: list[dict], names) -> tuple[list[str], int]:
    """(names actually defined by this file, their combined bitmask).

    Requested names the file does not define are skipped; SOURCE is never used.
    """
    wanted = {str(name).upper() for name in names} - NEVER_MASKED
    used, mask = [], 0
    for entry in flag_bits:
        if entry["name"] in wanted and 0 <= entry["bit"] < 31:
            used.append(entry["name"])
            mask |= 1 << entry["bit"]
    return used, mask


def corrected(image: np.ndarray, *, zodi=None, variance=None, flags=None, bad_mask: int = 0) -> np.ndarray:
    """A corrected copy of image, in its own floating type.

    zodi: subtracted (IMAGE - ZODI). variance: the result is divided by its
    square root, giving signal-to-noise; non-positive or nonfinite variance
    yields NaN. flags with bad_mask: samples carrying any masked bit become NaN.
    """
    result = np.array(image, copy=True)
    if zodi is not None:
        result -= zodi
    if variance is not None:
        usable = np.isfinite(variance) & (variance > 0)
        sigma = np.sqrt(np.where(usable, variance, 1), dtype=result.dtype)
        result = np.where(usable, result / sigma, np.nan).astype(result.dtype)
    if flags is not None and bad_mask:
        result[(flags & bad_mask) != 0] = np.nan
    return result
