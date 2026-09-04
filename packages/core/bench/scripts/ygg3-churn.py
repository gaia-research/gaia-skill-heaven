#!/usr/bin/env python3
"""Classify Yggdrasil III named-skill churn by field class.

Run from a gaia-skill-tree checkout with both refs fetched. Answers: of the
named skills a meta shift modifies, how many touched a field the retrieval
index actually ranks on? See docs/EVIDENCE.md for the result and its caveats.
"""
import subprocess, sys, re, json
def files(ref):
    out = subprocess.run(["git","ls-tree","-r","--name-only",ref,"registry/named/"],capture_output=True,text=True).stdout
    return [f for f in out.split() if f.endswith(".md")]
def show(ref,p):
    r = subprocess.run(["git","show",f"{ref}:{p}"],capture_output=True,text=True)
    return r.stdout if r.returncode==0 else None
def fm(text):
    if not text or not text.startswith("---"): return {}, text or ""
    end = text.find("\n---",3)
    if end<0: return {}, text
    head = text[3:end]; body = text[end+4:]
    d={}; key=None
    for line in head.split("\n"):
        m = re.match(r'^([A-Za-z0-9_]+):\s*(.*)$', line)
        if m:
            key=m.group(1); d[key]=m.group(2).strip()
        elif line.startswith("  ") and key:
            d[key] = d.get(key,"") + " " + line.strip()
    return d, body

A,B = "origin/main","FETCH_HEAD"
fa,fb = set(files(A)), set(files(B))
common = sorted(fa & fb)
RANKED = ["name","title","description","tags","genericSkillRef"]
REACH  = ["installable","suiteRef","suiteComponents","status","links"]
PREST  = ["level","trustMagnitude","overallTrustGrade","trustNumber","rank","provisional"]
c = {"ranked":0,"reach":0,"prestige_only":0,"body":0,"unchanged":0,"any":0}
ranked_ex=[]; reach_ex=[]
for p in common:
    ta,tb = show(A,p), show(B,p)
    if ta==tb: c["unchanged"]+=1; continue
    c["any"]+=1
    da,ba = fm(ta); db,bb = fm(tb)
    rch = [k for k in RANKED if da.get(k)!=db.get(k)]
    rea = [k for k in REACH  if da.get(k)!=db.get(k)]
    bod = ba.strip()!=bb.strip()
    if rch: c["ranked"]+=1; ranked_ex.append((p,rch))
    if rea: c["reach"]+=1; reach_ex.append((p,rea))
    if bod: c["body"]+=1
    if not rch and not rea and not bod: c["prestige_only"]+=1
print(json.dumps({"total_common":len(common),"new_files":len(fb-fa),"removed":len(fa-fb),**c},indent=1))
print("ranked-field examples:", ranked_ex[:6])
print("reach-field examples:", reach_ex[:6])
