import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import httpx


@pytest.fixture(autouse=True)
def offline_network(monkeypatch):
    """Block only external CelesTrak fetches so tests exercise the fallback.

    Starlette TestClient subclasses httpx.Client, so patch `send` rather than
    `get`/`request` and let in-process test traffic through.
    """
    original_send = httpx.Client.send

    def _send(self, request, *args, **kwargs):
        if "celestrak" in str(request.url):
            raise httpx.ConnectError("tests are offline")
        return original_send(self, request, *args, **kwargs)

    monkeypatch.setattr(httpx.Client, "send", _send)


@pytest.fixture()
def catalog():
    from catalog import TleCatalog
    return TleCatalog()
