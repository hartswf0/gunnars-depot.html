# VOLUND operating rules

Every control must perform one observable operation.

## Sindri — construct

1. Enter an object request.
2. Edit executable OpenSCAD source.
3. Save a new immutable three-digit version.
4. Render that exact source through the local OpenSCAD executable.
5. Display the resulting PNG and compiler output.
6. Change source; never declare a change from a label or slider alone.

## Brokkr — prove

1. Open one versioned SCAD artifact and its matching render.
2. Export that exact source through OpenSCAD.
3. Report the command result, STL byte count, and every emitted warning.
4. Block the print-ready state when export fails or warnings remain unresolved.
5. Bind each reported failure to source text or measured mesh geometry when data permits.

## Shared language game

`request → SCAD source → version → OpenSCAD render → inspect → revise → OpenSCAD export → evidence`

The interface must not substitute labels for operations. “Rendered,” “exported,”
“validated,” and “print-ready” name files and command results, not button states.

## Run

Install OpenSCAD, then execute:

```sh
python3 volund_server.py
```

To request another port explicitly:

```sh
python3 volund_server.py --port 8770
```

If the requested port is occupied, the server selects the next available port
and prints the exact URLs to open.

Open `http://127.0.0.1:8765/Sindri-Eitri.html` and
`http://127.0.0.1:8765/Brokkr.html`.
