#!/usr/bin/env python3
"""Local OpenSCAD bridge for the VOLUND interfaces.

Serves files and exposes concrete filesystem/OpenSCAD operations. Bind only to
loopback: source text is intentionally written and executed as OpenSCAD input.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
import argparse, json, re, shutil, socket, subprocess

ROOT = Path(__file__).resolve().parent
BUILDS = ROOT / "builds"
BUILDS.mkdir(exist_ok=True)
OPENSCAD = shutil.which("openscad") or "/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD"

def safe_name(value):
    value = re.sub(r"[^a-z0-9_]+", "_", str(value).lower()).strip("_")
    return value or "model"

def next_version(name):
    found = []
    for path in BUILDS.glob(f"{name}_[0-9][0-9][0-9].scad"):
        found.append(int(path.stem.rsplit("_", 1)[1]))
    return max(found, default=0) + 1

def run(args):
    proc = subprocess.run(args, cwd=ROOT, text=True, capture_output=True, timeout=180)
    return proc.returncode, (proc.stdout + proc.stderr).strip()

class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        relative = urlparse(path).path.lstrip("/")
        return str((ROOT / relative).resolve())

    def send_json(self, status, payload):
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers(); self.wfile.write(data)

    def body(self):
        size = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(size) or b"{}")

    def do_GET(self):
        if self.path == "/api/health":
            executable = Path(OPENSCAD).is_file() or bool(shutil.which(OPENSCAD))
            return self.send_json(200, {"ok": True, "openscad": executable, "executable": OPENSCAD})
        if self.path == "/api/artifacts":
            files = [{"name": p.name, "bytes": p.stat().st_size} for p in sorted(BUILDS.iterdir()) if p.is_file()]
            return self.send_json(200, {"ok": True, "files": files})
        return super().do_GET()

    def do_POST(self):
        try: data = self.body()
        except Exception as exc: return self.send_json(400, {"ok": False, "error": str(exc)})
        name = safe_name(data.get("name", "model"))
        if self.path == "/api/version":
            version = next_version(name); stem = f"{name}_{version:03d}"
            source = str(data.get("source", "")).strip()
            if not source: return self.send_json(400, {"ok": False, "error": "source is empty"})
            (BUILDS / f"{stem}.scad").write_text(source + "\n")
            return self.send_json(200, {"ok": True, "stem": stem, "source": f"builds/{stem}.scad"})
        stem = safe_name(data.get("stem", ""))
        source = BUILDS / f"{stem}.scad"
        if not source.exists(): return self.send_json(404, {"ok": False, "error": f"missing {source.name}"})
        if not (Path(OPENSCAD).is_file() or shutil.which(OPENSCAD)):
            return self.send_json(503, {"ok": False, "error": "OpenSCAD executable not found", "required": OPENSCAD})
        if self.path == "/api/render":
            output = BUILDS / f"{stem}.png"
            code, log = run([OPENSCAD, "--viewall", "--autocenter", "--imgsize", "1100,800", "--render", "-o", str(output), str(source)])
            return self.send_json(200 if code == 0 and output.exists() else 422, {"ok": code == 0 and output.exists(), "artifact": f"builds/{output.name}", "log": log})
        if self.path == "/api/export":
            output = BUILDS / f"{stem}.stl"
            code, log = run([OPENSCAD, "--export-format", "binstl", "-o", str(output), str(source)])
            warning = bool(re.search(r"non.?manifold|self.?intersect|degenerate|warning", log, re.I))
            ok = code == 0 and output.exists()
            return self.send_json(200 if ok else 422, {"ok": ok, "artifact": f"builds/{output.name}", "bytes": output.stat().st_size if output.exists() else 0, "warning": warning, "log": log})
        return self.send_json(404, {"ok": False, "error": "unknown operation"})

def available_port(preferred):
    for port in range(preferred, preferred + 20):
        with socket.socket() as probe:
            try: probe.bind(("127.0.0.1", port))
            except OSError: continue
            return port
    raise OSError(f"No available port in range {preferred}-{preferred + 19}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the local VOLUND OpenSCAD bridge")
    parser.add_argument("--port", type=int, default=8765, help="preferred loopback port (default: 8765)")
    args = parser.parse_args()
    port = available_port(args.port)
    if port != args.port: print(f"Port {args.port} is occupied; using {port}.")
    print(f"VOLUND: http://127.0.0.1:{port}/Sindri-Eitri.html")
    print(f"BROKKR: http://127.0.0.1:{port}/Brokkr.html")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
