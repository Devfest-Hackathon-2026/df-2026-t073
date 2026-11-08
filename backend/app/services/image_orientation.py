"""Fix detection boxes for photos stored sideways with an EXIF orientation tag.

Phone cameras often save pixels in sensor orientation plus a tag saying how to
rotate them for display. Apps (including ours) show the rotated image, but
Cloud Vision reports boxes on the raw pixels, so a box can land on the wrong
object. These helpers read the tag and map boxes into display orientation.
"""

import struct

from app.schemas.capture import Vertex

EXIF_ORIENTATION_TAG = 0x0112
_SOI = b"\xff\xd8"
_APP1 = 0xE1
_SOS = 0xDA
_EXIF_HEADER = b"Exif\x00\x00"


def jpeg_orientation(data: bytes) -> int:
    """EXIF orientation (1-8) of a JPEG, or 1 if absent, unreadable or not a JPEG."""
    if not data.startswith(_SOI):
        return 1
    pos = 2
    while pos + 4 <= len(data):
        if data[pos] != 0xFF:
            return 1
        marker = data[pos + 1]
        if marker == _SOS:
            return 1
        length = struct.unpack(">H", data[pos + 2 : pos + 4])[0]
        segment = data[pos + 4 : pos + 2 + length]
        if marker == _APP1 and segment.startswith(_EXIF_HEADER):
            return _tiff_orientation(segment[len(_EXIF_HEADER) :])
        pos += 2 + length
    return 1


def _tiff_orientation(tiff: bytes) -> int:
    try:
        if tiff[:2] == b"II":
            endian = "<"
        elif tiff[:2] == b"MM":
            endian = ">"
        else:
            return 1
        ifd_offset = struct.unpack(endian + "I", tiff[4:8])[0]
        count = struct.unpack(endian + "H", tiff[ifd_offset : ifd_offset + 2])[0]
        for i in range(count):
            entry = ifd_offset + 2 + i * 12
            tag = struct.unpack(endian + "H", tiff[entry : entry + 2])[0]
            if tag == EXIF_ORIENTATION_TAG:
                value = struct.unpack(endian + "H", tiff[entry + 8 : entry + 10])[0]
                return value if 1 <= value <= 8 else 1
    except struct.error:
        return 1
    return 1


def to_display(vertex: Vertex, orientation: int) -> Vertex:
    """Map a normalized point on the raw pixels to the displayed (rotated) image."""
    x, y = vertex.x, vertex.y
    mapped = {
        1: (x, y),
        2: (1 - x, y),  # mirrored
        3: (1 - x, 1 - y),  # rotated 180
        4: (x, 1 - y),  # mirrored vertically
        5: (y, x),  # transposed
        6: (1 - y, x),  # rotated 90 clockwise (most portrait phone photos)
        7: (1 - y, 1 - x),  # transversed
        8: (y, 1 - x),  # rotated 90 counter-clockwise
    }.get(orientation, (x, y))
    return Vertex(x=min(1.0, max(0.0, mapped[0])), y=min(1.0, max(0.0, mapped[1])))

