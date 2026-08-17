"""
Real-time sync across department dashboards (Section 5: "REST + WebSockets").
Every connected department view gets pushed new reports, risk updates, and
allocation suggestions the moment they happen, instead of polling.
"""
import json
from fastapi import WebSocket
from typing import List


class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, event: str, payload: dict):
        message = json.dumps({"event": event, "payload": payload})
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()
