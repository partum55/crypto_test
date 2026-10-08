from fastapi.testclient import TestClient

from app.main import app


def test_health():
    # No `with` block: skips the lifespan, so no CoinGecko warm-up is started.
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
