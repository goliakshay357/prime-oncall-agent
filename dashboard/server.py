"""Serve the on-call dashboard locally. Stdlib only, read-only.

Run:   python3 dashboard/server.py
Open:  http://127.0.0.1:8787
"""
import json
import os
import socketserver
from http.server import BaseHTTPRequestHandler
from pathlib import Path

import oncall_state

DASH_DIR = Path(__file__).parent
PORT = int(os.environ.get("ONCALL_PORT", "8787"))


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path in ("/", "/index.html"):
            self._send(200, (DASH_DIR / "index.html").read_bytes(), "text/html; charset=utf-8")
        elif self.path == "/state":
            self._send(200, json.dumps({"sessions": oncall_state.list_sessions()}).encode(), "application/json")
        else:
            self._send(404, b"not found", "text/plain")

    def log_message(self, *args) -> None:  # keep console quiet
        pass


class ReusableThreadingTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with ReusableThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"On-call dashboard: http://127.0.0.1:{PORT}")
        httpd.serve_forever()
