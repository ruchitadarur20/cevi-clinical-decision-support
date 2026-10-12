import numpy as np
import torch
from PIL import Image

from app.preprocessing import (
    CROP_SIZE, IMAGENET_MEAN, IMAGENET_STD, RESIZE_SIZE, center_crop, preprocess, resize_shorter_side, to_rgb,
)


def test_output_tensor_contract():
    t = preprocess(Image.new("RGB", (300, 200), (10, 20, 30)))
    assert t.shape == (1, 3, CROP_SIZE, CROP_SIZE)
    assert t.dtype == torch.float32


def test_grayscale_and_rgba_become_three_channels():
    assert preprocess(Image.new("L", (80, 80), 128)).shape[1] == 3
    assert preprocess(Image.new("RGBA", (80, 80), (255, 0, 0, 128))).shape[1] == 3


def test_resize_keeps_aspect_ratio_on_shorter_side():
    r = resize_shorter_side(Image.new("RGB", (600, 300)))
    assert min(r.size) == RESIZE_SIZE and r.size == (512, 256)


def test_center_crop_size():
    assert center_crop(Image.new("RGB", (400, 300))).size == (CROP_SIZE, CROP_SIZE)


def test_normalisation_values():
    # A uniform image of value v must map to (v/255 - mean) / std per channel.
    t = preprocess(Image.new("RGB", (64, 64), (255, 255, 255)))
    for c in range(3):
        expected = (1.0 - IMAGENET_MEAN[c]) / IMAGENET_STD[c]
        assert torch.allclose(t[0, c], torch.full((CROP_SIZE, CROP_SIZE), expected), atol=1e-4)


def test_transparency_composited_on_white():
    rgb = np.asarray(to_rgb(Image.new("RGBA", (8, 8), (0, 0, 0, 0))))
    assert rgb.min() == 255


def test_16bit_grayscale_supported():
    arr = (np.linspace(0, 65535, 64 * 64).reshape(64, 64)).astype(np.uint16)
    out = to_rgb(Image.fromarray(arr))
    assert out.mode == "RGB"
