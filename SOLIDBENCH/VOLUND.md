# Run SOLIDBENCH with VOLUND

Requirements:

- OpenSCAD installed at `/Applications/OpenSCAD.app` or available as `openscad`.
- At least one provider key set in the server process environment, or supplied
  in the local Builder panel for a single request.

```sh
cd /Users/gaia/GUNNAR/gunnars-depot.html/SOLIDBENCH
export ANTHROPIC_API_KEY="your-key"
# Optional alternatives:
export OPENAI_API_KEY="your-key"
export GEMINI_API_KEY="your-key"
python3 solidbench_server.py
```

Open the URL printed by the server. Do not open `solidbench.html` directly as a
file: the Builder requires `/api/chat` and artifact URLs from the local server.

Optional controls:

```sh
ANTHROPIC_MODEL=claude-sonnet-4-6 \
OPENAI_MODEL=gpt-5 \
GEMINI_MODEL=gemini-2.5-flash \
python3 solidbench_server.py --port 8770
```

Each Builder request streams these records to the browser:

`state → source → iteration → … → complete`

Each successful iteration persists:

`<name>_NNN.scad`, `<name>_NNN.png`, and `<name>_NNN.json`

The final successful render also persists `<name>_NNN.stl`.
