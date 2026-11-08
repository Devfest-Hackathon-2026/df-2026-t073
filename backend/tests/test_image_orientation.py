import struct

import pytest

from app.schemas.capture import Vertex
from app.services.image_orientation import jpeg_orientation, to_display


def jpeg_with_orientation(value: int, endian: str = "<") -> bytes:
    """Minimal JPEG: SOI + APP1 Exif with one IFD entry (orientation) + SOS."""
    order = b"II" if endian == "<" else b"MM"
    tiff = order + struct.pack(endian + "H", 42) + struct.pack(endian + "I", 8)
    tiff += struct.pack(endian + "H", 1)  # one entry
    tiff += struct.pack(endian + "HHI", 0x0112, 3, 1) + struct.pack(endian + "HH", value, 0)
    tiff += struct.pack(endian + "I", 0)  # no next IFD
    app1 = b"Exif\x00\x00" + tiff
    return b"\xff\xd8" + b"\xff\xe1" + struct.pack(">H", len(app1) + 2) + app1 + b"\xff\xda\x00\x02"


@pytest.mark.parametrize("endian", ["<", ">"])
@pytest.mark.parametrize("value", [1, 3, 6, 8])
def test_reads_orientation(value: int, endian: str) -> None:
    assert jpeg_orientation(jpeg_with_orientation(value, endian)) == value


def test_defaults_to_upright() -> None:
    assert jpeg_orientation(b"\x89PNG....") == 1
    assert jpeg_orientation(b"\xff\xd8\xff\xda\x00\x02") == 1  # JPEG without EXIF
    assert jpeg_orientation(b"") == 1


def test_rotated_90_clockwise() -> None:
    # Observed in testing: a TV at the right of a portrait photo was boxed at the
    # top-left, because the raw pixels are rotated 90 degrees.
    p = to_display(Vertex(x=0.24, y=0.08), 6)
    assert (round(p.x, 2), round(p.y, 2)) == (0.92, 0.24)


def test_other_orientations() -> None:
    v = Vertex(x=0.2, y=0.3)
    assert to_display(v, 1) == v
    assert (round(to_display(v, 3).x, 2), round(to_display(v, 3).y, 2)) == (0.8, 0.7)
    assert (round(to_display(v, 8).x, 2), round(to_display(v, 8).y, 2)) == (0.3, 0.8)
