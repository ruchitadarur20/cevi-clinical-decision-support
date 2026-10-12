"""Image validation: signature, size, decodability and dimension limits."""
from __future__ import annotations

import io
from dataclasses import dataclass

from PIL import Image, UnidentifiedImageError

PNG_SIG = b"\x89PNG\r\n\x1a\n"


class ImageValidationError(Exception):
    def __init__(self, code: str, message: str, status: int = 422):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


@dataclass(frozen=True)
class ImageInfo:
    format: str
    mime_type: str
    width: int
    height: int
    mode: str
    size_bytes: int


def detect_format(data: bytes) -> str:
    if data.startswith(PNG_SIG):
        return "PNG"
    if data[:3] == b"\xff\xd8\xff":
        return "JPEG"
    raise ImageValidationError(
        "UNSUPPORTED_MEDIA_TYPE", "Only JPEG and PNG images are supported (file signature check failed)", 415
    )


def validate_and_decode(data: bytes, *, max_bytes: int, min_dim: int, max_dim: int, max_pixels: int):
    """Validate raw bytes and return (PIL image fully loaded, ImageInfo)."""
    if not data or len(data) < 16:
        raise ImageValidationError("INVALID_IMAGE", "File is empty or too small to be an image")
    if len(data) > max_bytes:
        raise ImageValidationError("FILE_TOO_LARGE", f"File exceeds the {max_bytes // (1024 * 1024)} MB limit", 413)

    fmt = detect_format(data)

    # Check dimensions from the header BEFORE decoding pixels (decompression-bomb guard).
    Image.MAX_IMAGE_PIXELS = max_pixels
    try:
        with Image.open(io.BytesIO(data)) as probe:
            width, height = probe.size
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise ImageValidationError("INVALID_IMAGE", "Image could not be decoded - the file may be corrupt") from exc

    if width < min_dim or height < min_dim:
        raise ImageValidationError("IMAGE_TOO_SMALL", f"Image must be at least {min_dim}x{min_dim} pixels")
    if width > max_dim or height > max_dim or width * height > max_pixels:
        raise ImageValidationError("IMAGE_TOO_LARGE", f"Image dimensions exceed limits ({max_dim}px / {max_pixels} pixels)")

    try:
        img = Image.open(io.BytesIO(data))
        img.load()  # force full decode so truncated files fail here, not mid-inference
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError) as exc:
        raise ImageValidationError("INVALID_IMAGE", "Image could not be decoded - the file may be corrupt") from exc

    info = ImageInfo(
        format=fmt,
        mime_type="image/png" if fmt == "PNG" else "image/jpeg",
        width=width,
        height=height,
        mode=img.mode,
        size_bytes=len(data),
    )
    return img, info
