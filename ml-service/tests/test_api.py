import pytest
from fastapi.testclient import TestClient

from app import main
from app.model import ModelService
from tests.conftest import make_image


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


def post(client, path, data, name="x.png", ctype="image/png"):
    return client.post(path, files={"file": (name, data, ctype)})


def test_health_and_model_metadata(client):
    h = client.get("/health").json()
    assert h["status"] in {"ok", "degraded"}
    m = client.get("/model").json()
    assert m["name"] == "EfficientNet-B0"
    assert m["clinically_validated"] is False
    assert m["input_size"] == [224, 224]
    assert any("not" in n.lower() for n in m["notes"])


def test_preprocess_endpoint(client, png_bytes):
    r = post(client, "/preprocess", png_bytes)
    assert r.status_code == 200
    body = r.json()
    assert body["tensor"]["shape"] == [1, 3, 224, 224]
    assert body["preprocessing"]["normalize"]["mean"] == [0.485, 0.456, 0.406]


def test_infer_contract_when_weights_available(client, png_bytes):
    if not main.service.ready:
        pytest.skip("weights unavailable in this environment")
    r = post(client, "/infer", png_bytes)
    assert r.status_code == 200
    body = r.json()
    preds = body["predictions"]
    assert len(preds) == 5 and [p["rank"] for p in preds] == [1, 2, 3, 4, 5]
    assert all(0.0 <= p["probability"] <= 1.0 for p in preds)
    assert preds == sorted(preds, key=lambda p: -p["probability"])
    assert body["model"]["clinically_validated"] is False
    assert "must not be used" in body["disclaimer"]
    assert body["timing"]["inference_ms"] >= 0


def test_infer_without_weights_returns_503_and_no_predictions(png_bytes, monkeypatch):
    svc = ModelService(weights="none", torch_home="/tmp/unused", num_threads=1)
    monkeypatch.setattr(main, "service", svc)
    with TestClient(main.app) as c:
        r = post(c, "/infer", png_bytes)
        assert r.status_code == 503
        assert r.json()["error"]["code"] == "MODEL_WEIGHTS_UNAVAILABLE"
        assert "predictions" not in r.json()
        assert c.get("/health").json()["model_ready"] is False
        meta = c.get("/model").json()
        assert meta["weights_loaded"] is False


def test_missing_weights_file_is_handled(monkeypatch):
    svc = ModelService(weights="/nonexistent/weights.pth", torch_home="/tmp/unused", num_threads=1)
    st = svc.load()
    assert st.weights_loaded is False and st.load_error


def test_invalid_uploads(client):
    assert post(client, "/infer", b"hello world, definitely not an image").status_code == 415
    assert post(client, "/preprocess", make_image(size=(8, 8))).status_code == 422
    r = client.post("/infer")
    assert r.status_code == 422 and r.json()["error"]["code"] == "BAD_REQUEST"


def test_model_input_shape_through_network():
    from app.preprocessing import preprocess
    from PIL import Image
    svc = ModelService(weights="none", torch_home="/tmp/unused", num_threads=1)
    st = svc.load()
    t = preprocess(Image.new("RGB", (100, 100), (5, 5, 5)))
    import torch
    with torch.inference_mode():
        out = st.model(t)
    assert out.shape == (1, 1000)
