#!/usr/bin/env python3
"""SOLIDBENCH + VOLUND: server-owned inference, OpenSCAD, and artifacts."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import argparse, base64, json, os, re, shutil, socket, subprocess

ROOT=Path(__file__).resolve().parent; ART=ROOT/"artifacts"; ART.mkdir(exist_ok=True)
SCRIPTS=ROOT/"scripts"; OPENSCAD=shutil.which("openscad") or "/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD"
MODELS={"anthropic":os.environ.get("ANTHROPIC_MODEL","claude-sonnet-4-6"),"openai":os.environ.get("OPENAI_MODEL","gpt-5"),"gemini":os.environ.get("GEMINI_MODEL","gemini-2.5-flash")}
SYSTEM="""You are VOLUND, an OpenSCAD modeling operator. Return executable OpenSCAD only, without prose or markdown fences. Use millimeters and +Z up. Put editable dimensions and clearances at the top. Use lower_snake_case modules for repeated structures. Use union() for overlapping additive solids and difference() for explicit cutters. Avoid zero-thickness and coplanar ambiguity. Ground printable geometry at Z=0. Maintain walls >=0.8 mm unless the requirement specifies another process; use 0.2-0.5 mm fit clearance; keep unsupported overhangs <=45 degrees or add chamfers; prefer bridges under 10 mm. Set $fn deliberately, normally 48 or 64. Produce one coherent closed printable model. When revising, preserve requirements that already pass and change the smallest parameter or operation set that resolves the critique."""

def clean(v): return re.sub(r"[^a-z0-9_]+","_",str(v).lower()).strip("_") or "model"
def has_openscad(): return Path(OPENSCAD).is_file() or bool(shutil.which(OPENSCAD))
def run(cmd):
    env={**os.environ,"OPENSCAD_BIN":OPENSCAD}; p=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=240,env=env)
    return p.returncode,(p.stdout+p.stderr).strip()
def issues(log): return [x for x in log.splitlines() if re.search(r"warning|error|non.?manifold|self.?intersect|degenerate",x,re.I)]
def next_stem(name):
    code,out=run([str(SCRIPTS/"version-scad.sh"),name,str(ART)])
    if code: raise RuntimeError(out)
    return out.splitlines()[-1].strip()
def request_json(url,body,headers):
    req=Request(url,data=json.dumps(body).encode(),headers={"content-type":"application/json",**headers})
    try:
        with urlopen(req,timeout=120) as r:return json.load(r)
    except HTTPError as e: raise RuntimeError(f"Provider HTTP {e.code}: {e.read().decode()[:500]}")
def provider_text(provider,prompt,image=None,key_override="",model_override=""):
    provider=provider if provider in MODELS else "anthropic";model=model_override.strip() or MODELS[provider]
    env={"anthropic":"ANTHROPIC_API_KEY","openai":"OPENAI_API_KEY","gemini":"GEMINI_API_KEY"}[provider];key=key_override.strip() or os.environ.get(env,"")
    if not key:raise RuntimeError(f"{env} is not set and no request key was supplied")
    encoded=base64.b64encode(image.read_bytes()).decode() if image else None
    if provider=="anthropic":
        content=[{"type":"text","text":prompt}];
        if encoded:content.insert(0,{"type":"image","source":{"type":"base64","media_type":"image/png","data":encoded}})
        data=request_json("https://api.anthropic.com/v1/messages",{"model":model,"max_tokens":3000,"system":SYSTEM,"messages":[{"role":"user","content":content}]},{"x-api-key":key,"anthropic-version":"2023-06-01"})
        return "".join(b.get("text","") for b in data.get("content",[]) if b.get("type")=="text")
    if provider=="openai":
        content=[{"type":"input_text","text":prompt}];
        if encoded:content.insert(0,{"type":"input_image","image_url":"data:image/png;base64,"+encoded,"detail":"high"})
        data=request_json("https://api.openai.com/v1/responses",{"model":model,"instructions":SYSTEM,"input":[{"role":"user","content":content}],"max_output_tokens":3000},{"Authorization":"Bearer "+key})
        return "".join(c.get("text","") for item in data.get("output",[]) for c in item.get("content",[]) if c.get("type")=="output_text")
    parts=[{"text":SYSTEM+"\n\n"+prompt}];
    if encoded:parts.insert(0,{"inline_data":{"mime_type":"image/png","data":encoded}})
    data=request_json(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",{"contents":[{"role":"user","parts":parts}],"generationConfig":{"maxOutputTokens":3000}},{"x-goog-api-key":key})
    return "".join(p.get("text","") for c in data.get("candidates",[]) for p in c.get("content",{}).get("parts",[]))
def source_from(text):
    m=re.search(r"```(?:openscad|scad)?\s*([\s\S]*?)```",text,re.I)
    return (m.group(1) if m else text).strip()
def generate(requirement,prior="",critique="",provider="anthropic",key="",model=""):
    prompt=f"REQUIREMENT:\n{requirement}"
    if prior: prompt+=f"\n\nCURRENT OPENSCAD:\n{prior}\n\nOBSERVED CRITIQUE:\n{critique}\n\nReturn the complete revised source."
    return source_from(provider_text(provider,prompt,None,key,model))
def critique(requirement,source,png,provider="anthropic",key="",model=""):
    prompt="Inspect the literal OpenSCAD render against the requirement. Return JSON only: {\"satisfied\":boolean,\"critique\":\"specific visible mismatch or pass evidence\",\"what_changed\":\"observable change to request next\"}. Do not infer hidden geometry.\n\nREQUIREMENT:\n"+requirement+"\n\nSOURCE:\n"+source
    raw=provider_text(provider,prompt,png,key,model)
    m=re.search(r"\{[\s\S]*\}",raw)
    try:return json.loads(m.group(0) if m else raw)
    except:return {"satisfied":False,"critique":"Vision response was not valid JSON: "+raw[:400],"what_changed":"Return a directly inspectable revision."}
def stream(handler,event): handler.wfile.write((json.dumps(event)+"\n").encode());handler.wfile.flush()

class App(SimpleHTTPRequestHandler):
    def translate_path(self,path): return str((ROOT/urlparse(path).path.lstrip("/")).resolve())
    def json(self,status,payload):
        b=json.dumps(payload).encode();self.send_response(status);self.send_header("Content-Type","application/json");self.send_header("Content-Length",str(len(b)));self.end_headers();self.wfile.write(b)
    def input(self): return json.loads(self.rfile.read(int(self.headers.get("Content-Length","0"))) or b"{}")
    def do_GET(self):
        if self.path=="/api/health": return self.json(200,{"ok":True,"openscad":has_openscad(),"models":MODELS,"providers":{p:bool(os.environ.get(k)) for p,k in {"anthropic":"ANTHROPIC_API_KEY","openai":"OPENAI_API_KEY","gemini":"GEMINI_API_KEY"}.items()}})
        if self.path=="/api/versions":
            rows=[]
            for p in sorted(ART.glob("*.json"),reverse=True):
                try:rows.append(json.loads(p.read_text()))
                except:pass
            return self.json(200,{"ok":True,"versions":rows})
        return super().do_GET()
    def do_POST(self):
        try:d=self.input()
        except Exception as e:return self.json(400,{"ok":False,"error":str(e)})
        if self.path=="/api/chat":
            self.send_response(200);self.send_header("Content-Type","application/x-ndjson");self.send_header("Cache-Control","no-cache");self.end_headers()
            requirement=str(d.get("requirement","")).strip(); name=clean(d.get("name") or "solidbench_model"); limit=max(1,min(8,int(d.get("max_iterations",4))));provider=str(d.get("provider","anthropic"));api_key=str(d.get("api_key",""));model=str(d.get("model",""))
            if not requirement:return stream(self,{"type":"error","message":"Requirement is empty"})
            if not has_openscad():return stream(self,{"type":"error","message":"OpenSCAD executable not found"})
            prior=str(d.get("current_source","")).strip(); history=d.get("history",[]); last_critique="User requested a further operation on the current model." if prior else ""; final=None
            try:
                stream(self,{"type":"state","message":"Revising current OpenSCAD source" if prior else "Generating OpenSCAD source"})
                for index in range(1,limit+1):
                    source=generate(requirement,prior,last_critique,provider,api_key,model);stem=next_stem(name);scad=ART/f"{stem}.scad";png=ART/f"{stem}.png";scad.write_text(source+"\n")
                    stream(self,{"type":"source","iteration":index,"stem":stem,"source":source,"scad":f"artifacts/{scad.name}"})
                    rc,rlog=run([str(SCRIPTS/"render-scad.sh"),str(scad),"--output",str(png),"--render"])
                    if rc or not png.exists(): stream(self,{"type":"iteration","iteration":index,"stem":stem,"ok":False,"log":rlog,"critique":"OpenSCAD render failed; revise source syntax or geometry."});prior=source;last_critique=rlog;continue
                    report=critique(requirement,source,png,provider,api_key,model); final=(stem,source,png,rlog,report)
                    record={"stem":stem,"iteration":index,"requirement":requirement,"scad":f"artifacts/{scad.name}","png":f"artifacts/{png.name}","stl":None,"critique":report,"render_log":rlog}
                    (ART/f"{stem}.json").write_text(json.dumps(record,indent=2));stream(self,{"type":"iteration",**record})
                    if report.get("satisfied"):break
                    prior=source;last_critique=str(report.get("critique",""))+"\nNEXT CHANGE: "+str(report.get("what_changed",""))
                if not final:return stream(self,{"type":"error","message":"No iteration rendered successfully"})
                stem,source,png,rlog,report=final;stl=ART/f"{stem}.stl";ec,elog=run([str(SCRIPTS/"export-stl.sh"),str(ART/f"{stem}.scad"),"--output",str(stl),"--binary"]);warn=issues(elog)
                done={"type":"complete","ok":ec==0 and stl.exists(),"stem":stem,"scad":f"artifacts/{stem}.scad","png":f"artifacts/{png.name}","stl":f"artifacts/{stl.name}" if stl.exists() else None,"warnings":warn,"log":elog,"satisfied":bool(report.get("satisfied"))}
                record=json.loads((ART/f"{stem}.json").read_text());record.update({k:v for k,v in done.items() if k!="type"});(ART/f"{stem}.json").write_text(json.dumps(record,indent=2));stream(self,done)
            except Exception as e:stream(self,{"type":"error","message":str(e)})
            return
        return self.json(404,{"ok":False,"error":"unknown operation"})

def port(preferred):
    for p in range(preferred,preferred+20):
        with socket.socket() as s:
            try:s.bind(("127.0.0.1",p));return p
            except OSError:pass
    raise OSError("No loopback port available")
if __name__=="__main__":
    ap=argparse.ArgumentParser();ap.add_argument("--port",type=int,default=8765);a=ap.parse_args();p=port(a.port)
    print(f"SOLIDBENCH: http://127.0.0.1:{p}/solidbench.html",flush=True);ThreadingHTTPServer(("127.0.0.1",p),App).serve_forever()
