"""Runtime configuration (environment based)."""
import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    # imagenet  -> torchvision EfficientNet_B0_Weights.IMAGENET1K_V1 (general-purpose, NOT medical)
    # none      -> architecture only; /infer reports MODEL_WEIGHTS_UNAVAILABLE
    # <path>    -> custom state_dict file (e.g. weights trained by the user on a validated dataset)
    weights: str = os.getenv("CEVI_WEIGHTS", "imagenet")
    max_upload_bytes: int = int(float(os.getenv("CEVI_MAX_UPLOAD_MB", "8")) * 1024 * 1024)
    min_dim: int = int(os.getenv("CEVI_MIN_DIM", "32"))
    max_dim: int = int(os.getenv("CEVI_MAX_DIM", "8192"))
    max_pixels: int = int(os.getenv("CEVI_MAX_PIXELS", "40000000"))
    torch_threads: int = int(os.getenv("CEVI_TORCH_THREADS", "2"))
    top_k: int = int(os.getenv("CEVI_TOP_K", "5"))
    torch_home: str = os.getenv("TORCH_HOME", str(ROOT.parent / ".local" / "torch"))


def get_settings() -> Settings:
    return Settings()
