"""Prepare a stable release version. Does not commit, tag, push or publish."""
from pathlib import Path
import argparse,json,re
root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('version')
new=parser.parse_args().version
assert re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)',new),'Use a stable major.minor.patch version'
old=json.loads((root/'package.json').read_text('utf-8'))['version']
assert tuple(map(int,new.split('.')))>tuple(map(int,old.split('.'))),'Version must increase'
for name in ['package.json','project-file.mjs','update.mjs','desktop/UpdateService.cs','desktop/SpriteCheck.cs','desktop/app.manifest','desktop/README-release.txt']:
    p=root/name
    s=p.read_text('utf-8')
    assert old in s,f'Current version missing from {name}'
    p.write_text(s.replace(old,new),'utf-8')
p=root/'README.md'
p.write_text(p.read_text('utf-8').replace(f'# Sprite Check v{old}',f'# Sprite Check v{new}',1),'utf-8')
print(f'Prepared {old} -> {new}. Review changes, run tests/build, then commit and tag v{new}.')
