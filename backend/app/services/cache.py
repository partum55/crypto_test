import time
from typing import Any


class TTLCache:
    """Minimal in-process TTL cache. Per-process only: multiple workers would need Redis."""

    def __init__(self, ttl_seconds: float):
        self.ttl = ttl_seconds
        self._data: dict[Any, tuple[float, Any]] = {}

    def get(self, key: Any) -> Any | None:
        entry = self._data.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if time.monotonic() >= expires_at:
            del self._data[key]
            return None
        return value

    def set(self, key: Any, value: Any) -> None:
        self._data[key] = (time.monotonic() + self.ttl, value)
