# Help and troubleshooting

## The page opens but the Builder fails

Check the URL. Full VOLUND mode must be opened through `solidbench_server.py`,
not as a file and not directly from GitHub Pages.

```sh
python3 solidbench_server.py
curl http://127.0.0.1:8765/api/health
```

The health response reports OpenSCAD availability, configured provider models,
and which environment keys exist.

## `Address already in use`

Request another port:

```sh
python3 solidbench_server.py --port 8770
```

The server checks the next twenty ports and prints the selected URL.

## OpenSCAD executable not found

```sh
brew install --cask openscad@snapshot
openscad --version
```

The server checks `PATH` and `/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD`.

## `Incompatible processor` or NEON error

Install Rosetta and use the supplied scripts; they select the x86_64 slice of a
universal OpenSCAD build on Apple Silicon.

```sh
softwareupdate --install-rosetta --agree-to-license
```

## PNG render fails with an OpenGL/CoreGraphics error

Run the server from a logged-in desktop terminal, not an SSH-only or sandboxed
session. macOS OpenSCAD PNG rendering needs access to a graphical session even
when invoked from the command line. STL export may still work without it.

The render script rejects an empty PNG, so the vision loop cannot accidentally
approve missing evidence.

## Provider reports a missing key

Set the corresponding environment variable before starting the server:

```sh
export ANTHROPIC_API_KEY="..."
export OPENAI_API_KEY="..."
export GEMINI_API_KEY="..."
```

Restart the server after changing environment variables.

## Provider returns HTTP 401 or 403

- Verify the key belongs to the selected provider.
- Verify billing and model access.
- Remove whitespace surrounding the key.
- Check that the selected model supports image input.

## Provider returns HTTP 404 or an unknown-model error

Override the provider model with one available to the account:

```sh
ANTHROPIC_MODEL="..." python3 solidbench_server.py
OPENAI_MODEL="..." python3 solidbench_server.py
GEMINI_MODEL="..." python3 solidbench_server.py
```

## A render succeeds but export fails

Read the iteration log and inspect the `.scad` file. Common causes:

- Empty top-level geometry.
- Zero-thickness contact.
- Invalid or undefined parameters.
- Non-manifold boolean results.
- Unsupported imported asset paths.

## The final shape differs from the PNG

Confirm that SCAD, PNG, and STL share the same numbered stem. SOLIDBENCH loads
the final STL specified by the `complete` event; stale browser cache is bypassed
with a timestamp query.

## GitHub Pages limitations

Pages serves HTML, CSS, JavaScript, and static assets. It does not run:

- `solidbench_server.py`
- OpenSCAD
- shell scripts
- server-side provider requests

Use Pages for the static bench and documentation. Run VOLUND locally or deploy
an authenticated HTTPS backend for full builds.
