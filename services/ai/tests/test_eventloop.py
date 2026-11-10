import asyncio

import uvicorn

from strata_ai.core import eventloop


def test_windows_gets_a_selector_loop(monkeypatch):
    monkeypatch.setattr(eventloop.sys, "platform", "win32")
    assert eventloop.asyncio_loop_factory() is asyncio.SelectorEventLoop
    config = uvicorn.Config("strata_ai.main:app", loop=eventloop.uvicorn_loop())
    assert config.get_loop_factory() is asyncio.SelectorEventLoop


def test_other_platforms_keep_their_default_loop(monkeypatch):
    monkeypatch.setattr(eventloop.sys, "platform", "linux")
    assert eventloop.asyncio_loop_factory() is None
    assert eventloop.uvicorn_loop() == "auto"


def test_worker_runs_on_the_chosen_loop(monkeypatch):
    seen = {}

    async def fake_main():
        seen["loop"] = type(asyncio.get_running_loop())

    monkeypatch.setattr(eventloop.sys, "platform", "win32")
    monkeypatch.setattr("strata_ai.worker.main.main", fake_main)
    from strata_ai.worker.main import run

    run()
    assert issubclass(seen["loop"], asyncio.SelectorEventLoop)
