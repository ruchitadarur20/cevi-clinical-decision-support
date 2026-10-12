import pytest

from app.validation import ImageValidationError, validate_and_decode
from tests.conftest import make_image

LIMITS = dict(max_bytes=1024 * 1024, min_dim=32, max_dim=2048, max_pixels=4_000_000)


def test_valid_png_and_jpeg(png_bytes, jpeg_bytes):
    _, info = validate_and_decode(png_bytes, **LIMITS)
    assert (info.format, info.width, info.height) == ("PNG", 128, 96)
    _, info = validate_and_decode(jpeg_bytes, **LIMITS)
    assert info.format == "JPEG"


@pytest.mark.parametrize("payload", [b"", b"GIF89a" + b"\x00" * 40, b"%PDF-1.4" + b"\x00" * 40, b"not an image at all!!"])
def test_rejects_non_images_by_signature(payload):
    with pytest.raises(ImageValidationError) as e:
        validate_and_decode(payload, **LIMITS)
    assert e.value.code in {"UNSUPPORTED_MEDIA_TYPE", "INVALID_IMAGE"}


def test_rejects_truncated_png(png_bytes):
    with pytest.raises(ImageValidationError) as e:
        validate_and_decode(png_bytes[: len(png_bytes) // 2], **LIMITS)
    assert e.value.code == "INVALID_IMAGE"


def test_rejects_small_image():
    with pytest.raises(ImageValidationError) as e:
        validate_and_decode(make_image(size=(16, 16)), **LIMITS)
    assert e.value.code == "IMAGE_TOO_SMALL"


def test_rejects_oversized_dimensions():
    with pytest.raises(ImageValidationError) as e:
        validate_and_decode(make_image(size=(3000, 64)), **LIMITS)
    assert e.value.code == "IMAGE_TOO_LARGE"


def test_rejects_large_file(png_bytes):
    with pytest.raises(ImageValidationError) as e:
        validate_and_decode(png_bytes, **{**LIMITS, "max_bytes": 100})
    assert e.value.code == "FILE_TOO_LARGE"
    assert e.value.status == 413
