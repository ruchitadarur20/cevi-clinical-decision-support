"""EfficientNet-B0 loading and inference.

SAFETY NOTE: EfficientNet-B0 is a generic image-classification architecture. The only weights this
service can load without extra files are torchvision's ImageNet-1k weights, which were trained to
recognise everyday object categories (e.g. "tabby cat"). They are NOT medical weights and their
outputs are not diagnoses. Supply your own validated weights through CEVI_WEIGHTS=<path> if needed.
"""
from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import torch
from torch import nn
from torchvision.models import EfficientNet_B0_Weights, efficientnet_b0

MODEL_NAME = "EfficientNet-B0"


class WeightsUnavailable(Exception):
    pass


@dataclass
class ModelState:
    model: Optional[nn.Module] = None
    labels: list[str] = field(default_factory=list)
    weights_source: str = "none"
    weights_loaded: bool = False
    version: str = "architecture-only"
    trained_task: str = "none (randomly initialised architecture)"
    load_error: Optional[str] = None
    load_ms: Optional[float] = None
    num_parameters: int = 0
    loaded_at: Optional[float] = None


class ModelService:
    """Lazily loads the model once; thread-safe."""

    def __init__(self, weights: str, torch_home: str, num_threads: int = 2):
        self.weights = weights
        self.torch_home = torch_home
        self.state = ModelState()
        self._lock = threading.Lock()
        self._loaded = False
        torch.set_num_threads(max(1, num_threads))

    # ---- loading -------------------------------------------------------
    def load(self) -> ModelState:
        with self._lock:
            if self._loaded:
                return self.state
            started = time.perf_counter()
            st = ModelState()
            try:
                if self.weights == "imagenet":
                    os.environ.setdefault("TORCH_HOME", self.torch_home)
                    torch.hub.set_dir(str(Path(self.torch_home) / "hub"))
                    w = EfficientNet_B0_Weights.IMAGENET1K_V1
                    model = efficientnet_b0(weights=w)
                    st.labels = list(w.meta["categories"])
                    st.weights_source = "torchvision EfficientNet_B0_Weights.IMAGENET1K_V1"
                    st.version = "torchvision-IMAGENET1K_V1"
                    st.trained_task = "ImageNet-1k general object classification (not medical)"
                    st.weights_loaded = True
                elif self.weights == "none":
                    model = efficientnet_b0(weights=None)
                    st.load_error = "Weights disabled (CEVI_WEIGHTS=none): architecture only."
                else:
                    path = Path(self.weights)
                    if not path.is_file():
                        raise FileNotFoundError(f"Weights file not found: {path.name}")
                    model = efficientnet_b0(weights=None)
                    model.load_state_dict(torch.load(path, map_location="cpu", weights_only=True))
                    st.weights_source = f"custom state_dict: {path.name}"
                    st.version = f"custom-{path.stem}"
                    st.trained_task = "custom (provenance and validation unknown to this service)"
                    st.weights_loaded = True
                    n = model.classifier[1].out_features
                    st.labels = [f"class_{i}" for i in range(n)]
                model.eval()
                st.model = model
                st.num_parameters = sum(p.numel() for p in model.parameters())
            except Exception as exc:  # network down, corrupt file, ...
                st = ModelState(load_error=f"{type(exc).__name__}: {exc}"[:300])
                model = efficientnet_b0(weights=None).eval()
                st.model = model
                st.num_parameters = sum(p.numel() for p in model.parameters())
            st.load_ms = round((time.perf_counter() - started) * 1000, 1)
            st.loaded_at = time.time()
            self.state = st
            self._loaded = True
            return st

    @property
    def ready(self) -> bool:
        return self._loaded and self.state.weights_loaded

    # ---- metadata ------------------------------------------------------
    def metadata(self) -> dict:
        st = self.load()
        notes = [
            "EfficientNet-B0 is an image-classification architecture, not a clinically validated diagnostic system.",
            "Outputs are experimental and must not be used for clinical decision-making.",
        ]
        if st.weights_source.startswith("torchvision"):
            notes.append(
                "Weights were trained on ImageNet-1k (everyday object categories). Predicted labels are NOT medical findings."
            )
        if not st.weights_loaded:
            notes.append(f"Trained weights unavailable: {st.load_error}")
        return {
            "name": MODEL_NAME,
            "version": st.version,
            "architecture": "torchvision.models.efficientnet_b0",
            "weights_source": st.weights_source,
            "weights_loaded": st.weights_loaded,
            "trained_task": st.trained_task,
            "clinically_validated": False,
            "num_parameters": st.num_parameters,
            "input_size": [224, 224],
            "notes": notes,
        }

    # ---- inference -----------------------------------------------------
    @torch.inference_mode()
    def predict(self, tensor: torch.Tensor, top_k: int = 5) -> tuple[list[dict], float]:
        st = self.load()
        if not st.weights_loaded or st.model is None:
            raise WeightsUnavailable(st.load_error or "Trained weights are not available")
        started = time.perf_counter()
        logits = st.model(tensor)
        probs = torch.softmax(logits, dim=1)[0]
        k = min(top_k, probs.numel())
        values, indices = torch.topk(probs, k)
        elapsed = (time.perf_counter() - started) * 1000
        preds = [
            {
                "rank": r + 1,
                "class_index": int(i),
                "label": st.labels[int(i)] if int(i) < len(st.labels) else f"class_{int(i)}",
                "probability": round(float(v), 6),
            }
            for r, (v, i) in enumerate(zip(values.tolist(), indices.tolist()))
        ]
        return preds, round(elapsed, 2)
