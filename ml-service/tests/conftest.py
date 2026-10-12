import io
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def make_image(size=(128, 96), mode="RGB", fmt="PNG") -> bytes:
    rng = np.random.default_rng(7)
    if mode == "L":
        arr = rng.integers(0, 255, (size[1], size[0]), dtype=np.uint8)
    elif mode == "RGBA":
        arr = rng.integers(0, 255, (size[1], size[0], 4), dtype=np.uint8)
    else:
        arr = rng.integers(0, 255, (size[1], size[0], 3), dtype=np.uint8)
    img = Image.fromarray(arr, mode=mode if mode != "RGB" else None)
    if fmt == "JPEG" and img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


@pytest.fixture()
def png_bytes():
    return make_image()


@pytest.fixture()
def jpeg_bytes():
    return make_image(fmt="JPEG")
