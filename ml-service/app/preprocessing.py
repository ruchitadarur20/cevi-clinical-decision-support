"""Standardised EfficientNet-B0 preprocessing.

Pipeline (identical to torchvision's EfficientNet_B0_Weights.IMAGENET1K_V1 transforms):
  decode -> RGB -> resize(256, bicubic, shorter side) -> center-crop(224)
  -> scale to [0,1] float32 -> normalize(mean, std) -> NCHW tensor
"""
from __future__ import annotations

import numpy as np
import torch
from PIL import Image

IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)
RESIZE_SIZE = 256
CROP_SIZE = 224

PIPELINE_CONFIG = {
    "color_mode": "RGB",
    "resize": {"shorter_side": RESIZE_SIZE, "interpolation": "bicubic"},
    "center_crop": [CROP_SIZE, CROP_SIZE],
    "scale": "uint8 -> float32 / 255",
    "normalize": {"mean": list(IMAGENET_MEAN), "std": list(IMAGENET_STD)},
    "layout": "NCHW",
    "dtype": "float32",
}


def to_rgb(img: Image.Image) -> Image.Image:
    """Convert any mode to RGB. Transparency is composited onto white, not black."""
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        bg = Image.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[-1])
        return bg
    if img.mode in ("I;16", "I"):
        arr = np.asarray(img, dtype=np.float32)
        span = max(float(arr.max() - arr.min()), 1.0)
        arr8 = ((arr - arr.min()) / span * 255.0).astype(np.uint8)
        return Image.fromarray(arr8).convert("RGB")
    return img.convert("RGB")


def resize_shorter_side(img: Image.Image, size: int = RESIZE_SIZE) -> Image.Image:
    w, h = img.size
    if w <= h:
        new_w, new_h = size, max(1, round(h * size / w))
    else:
        new_w, new_h = max(1, round(w * size / h)), size
    return img.resize((new_w, new_h), Image.BICUBIC)


def center_crop(img: Image.Image, size: int = CROP_SIZE) -> Image.Image:
    w, h = img.size
    left = max(0, (w - size) // 2)
    top = max(0, (h - size) // 2)
    return img.crop((left, top, left + size, top + size))


def preprocess(img: Image.Image) -> torch.Tensor:
    """Return a normalised float32 tensor of shape (1, 3, 224, 224)."""
    rgb = to_rgb(img)
    cropped = center_crop(resize_shorter_side(rgb))
    arr = np.asarray(cropped, dtype=np.float32) / 255.0  # HWC
    mean = np.asarray(IMAGENET_MEAN, dtype=np.float32)
    std = np.asarray(IMAGENET_STD, dtype=np.float32)
    arr = (arr - mean) / std
    tensor = torch.from_numpy(np.ascontiguousarray(arr.transpose(2, 0, 1))).unsqueeze(0)
    return tensor


def describe(info, tensor: torch.Tensor) -> dict:
    return {
        **PIPELINE_CONFIG,
        "input": {
            "format": info.format,
            "width": info.width,
            "height": info.height,
            "original_mode": info.mode,
        },
        "output_shape": list(tensor.shape),
    }
