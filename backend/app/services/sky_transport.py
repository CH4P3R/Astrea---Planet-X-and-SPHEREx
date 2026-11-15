"""A small JSON header followed by contiguous little-endian float32 directions."""

import json
import struct

SKY_MEDIA_TYPE = "application/vnd.astronomy.sky+octet-stream"


def encode_sky(snapshot):
    metadata = {key: value for key, value in snapshot.items() if key != "directions"}
    metadata["direction_encoding"] = "float32-le"
    header = json.dumps(metadata, separators=(",", ":"), allow_nan=False).encode("utf-8")
    # Padding keeps the numeric section aligned for a zero-copy Float32Array view.
    header += b" " * (-len(header) % 4)
    return b"SKY1" + struct.pack("<I", len(header)) + header + snapshot["directions"].tobytes(order="C")
