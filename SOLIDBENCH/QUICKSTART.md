# SOLIDBENCH quickstart

Use this guide on a clean macOS computer.

## 1. Install prerequisites

Install Homebrew if it is not already available, then install the current
OpenSCAD snapshot, Node.js, and Python:

```sh
brew install --cask openscad@snapshot
brew install node python
```

Verify them:

```sh
openscad --version
node --version
python3 --version
```

On Apple Silicon, the scripts automatically use the x86_64 slice of a universal
OpenSCAD binary when the native Qt build fails its processor check. Rosetta may
be required:

```sh
softwareupdate --install-rosetta --agree-to-license
```

## 2. Get the repository

```sh
git clone https://github.com/hartswf0/gunnars-depot.html.git
cd gunnars-depot.html/SOLIDBENCH
```

## 3. Install and build frontend dependencies

```sh
npm install
npm run build:css
```

The generated `solidbench.css` is committed for GitHub Pages. Rebuild it after
changing Tailwind classes in `solidbench.html`.

## 4. Configure one AI provider

Choose at least one:

```sh
export ANTHROPIC_API_KEY="..."
export OPENAI_API_KEY="..."
export GEMINI_API_KEY="..."
```

Optional model overrides:

```sh
export ANTHROPIC_MODEL="claude-sonnet-4-6"
export OPENAI_MODEL="gpt-5"
export GEMINI_MODEL="gemini-2.5-flash"
```

Do not commit API keys. Environment variables apply only to the current shell
unless you place them in your shell’s private configuration.

## 5. Run SOLIDBENCH

```sh
python3 solidbench_server.py
```

Open the exact URL printed by the server, normally:

```text
http://127.0.0.1:8765/solidbench.html
```

If that port is occupied:

```sh
python3 solidbench_server.py --port 8770
```

## 6. Build the first object

1. Open **The Builder**.
2. Select Anthropic, OpenAI, or Gemini.
3. Enter a literal requirement with dimensions and use conditions.
4. Submit it once.
5. Watch every numbered render and critique.
6. Open **Code** to inspect the complete `.scad` source.
7. Inspect the returned STL with orbit, section, wall, and overhang tools.
8. Export only when the report and visible result pass.

Example request:

```text
Create a 70 mm wide phone stand for a 12 mm thick phone. Lean the phone 15
degrees, add a 14 mm cable slot, use 2.4 mm walls, round exposed corners, and
keep every unsupported overhang at or below 45 degrees.
```

## 7. Locate generated files

```text
SOLIDBENCH/artifacts/<name>_001.scad
SOLIDBENCH/artifacts/<name>_001.png
SOLIDBENCH/artifacts/<name>_001.json
SOLIDBENCH/artifacts/<name>_NNN.stl
```

Artifacts remain local and are excluded from Git.
