"""CEVI ML inference service (FastAPI)."""
from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .config import get_settings
from .model import ModelService, WeightsUnavailable
from .preprocessing import describe, preprocess
from .validation import ImageValidationError, validate_and_decode

DISCLAIMER = (
    "Research prototype using synthetic data. Model output is experimental, has not been clinically validated, "
    "and must not be used for diagnosis, treatment or any clinical decision-making."
)

settings = get_settings()
service = ModelService(settings.weights, settings.torch_home, settings.torch_threads)
STARTED = time.time()


@asynccontextmanager
async def lifespan(_: FastAPI):
    service.load()  # fail-soft: records load_error instead of crashing
    yield


app = FastAPI(title="CEVI ML Service", version="1.0.0", lifespan=lifespan)


def error(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@app.exception_handler(ImageValidationError)
async def _validation_handler(_: Request, exc: ImageValidationError):
    return error(exc.code, exc.message, exc.status)


@app.exception_handler(WeightsUnavailable)
async def _weights_handler(_: Request, exc: WeightsUnavailable):
    return error(
        "MODEL_WEIGHTS_UNAVAILABLE",
        "Trained model weights are not available, so inference is disabled. No predictions are fabricated.",
        503,
    )


@app.exception_handler(RequestValidationError)
async def _request_validation(_: Request, exc: RequestValidationError):
    return error("BAD_REQUEST", "A multipart 'file' field is required", 422)


@app.exception_handler(HTTPException)
async def _http_exc(_: Request, exc: HTTPException):
    return error("HTTP_ERROR", str(exc.detail), exc.status_code)


async def _read_image(file: UploadFile):
    data = await file.read(settings.max_upload_bytes + 1)
    return validate_and_decode(
        data,
        max_bytes=settings.max_upload_bytes,
        min_dim=settings.min_dim,
        max_dim=settings.max_dim,
        max_pixels=settings.max_pixels,
    )


@app.get("/health")
def health():
    st = service.state
    return {
        "status": "ok" if service.ready else "degraded",
        "model_loaded": service._loaded,
        "model_ready": service.ready,
        "weights_source": st.weights_source,
        "load_error": st.load_error,
        "uptime_seconds": round(time.time() - STARTED, 1),
    }


@app.get("/model")
def model_metadata():
    return service.metadata()


@app.post("/preprocess")
async def preprocess_endpoint(file: UploadFile = File(...)):
    started = time.perf_counter()
    img, info = await _read_image(file)
    tensor = preprocess(img)
    return {
        "preprocessing": describe(info, tensor),
        "tensor": {
            "shape": list(tensor.shape),
            "dtype": str(tensor.dtype).replace("torch.", ""),
            "min": round(float(tensor.min()), 4),
            "max": round(float(tensor.max()), 4),
            "mean": round(float(tensor.mean()), 4),
            "std": round(float(tensor.std()), 4),
        },
        "timing": {"preprocess_ms": round((time.perf_counter() - started) * 1000, 2)},
    }


@app.post("/infer")
async def infer(file: UploadFile = File(...)):
    started = time.perf_counter()
    img, info = await _read_image(file)
    t0 = time.perf_counter()
    tensor = preprocess(img)
    pre_ms = (time.perf_counter() - t0) * 1000
    preds, inf_ms = service.predict(tensor, settings.top_k)  # raises WeightsUnavailable -> 503
    return {
        "model": service.metadata(),
        "preprocessing": describe(info, tensor),
        "predictions": preds,
        "timing": {
            "preprocess_ms": round(pre_ms, 2),
            "inference_ms": inf_ms,
            "total_ms": round((time.perf_counter() - started) * 1000, 2),
        },
        "disclaimer": DISCLAIMER,
    }
