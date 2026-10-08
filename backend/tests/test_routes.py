from fastapi.testclient import TestClient

from app.main import app


class StubService:
    def __init__(self):
        self.calls = []

    async def get_projects(self, require_preview: bool = True):
        self.calls.append(require_preview)
        return {"count": 0, "items": [], "meta": None}  # shape irrelevant: response check below


def test_require_preview_param_is_passed_through():
    stub = StubService()
    app.state.projects = stub
    client = TestClient(app, raise_server_exceptions=False)  # no lifespan -> no network
    client.get("/api/projects")
    client.get("/api/projects?require_preview=false")
    client.get("/api/projects?require_preview=true")
    assert stub.calls == [True, False, True]
    assert client.get("/api/projects?require_preview=maybe").status_code == 422
