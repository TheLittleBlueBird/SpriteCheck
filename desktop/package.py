from pathlib import Path
import argparse, zipfile, hashlib, json

tool = Path(__file__).resolve().parent.parent
version = json.loads((tool/'package.json').read_text('utf-8'))['version']
parser = argparse.ArgumentParser()
parser.add_argument('--release-dir', type=Path, default=tool/'dist'/f'SpriteCheck-{version}-win-x64')
parser.add_argument('--evidence', type=Path)
args = parser.parse_args()
release = args.release_dir.resolve()
assert release.name == f'SpriteCheck-{version}-win-x64', 'Unexpected release folder name'
files = [release/n for n in ['Sprite Check.exe','SpriteCheck.Updater.exe','Sprite Check.exe.config','sprite-check.ico','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','README.txt','GUIDE.md']]
for folder in ['app','Unity','licenses']:
    files += [p for p in (release/folder).rglob('*') if p.is_file()]
assert all(p.is_file() and not p.is_symlink() for p in files)
assert not any(p.name == 'skeleton-demo.png' for p in files), 'Artist fixture must not be published'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = release/'update-package.json'
manifest.write_text(json.dumps({'product':'SpriteCheck','schema':1,'version':version,'files':{p.relative_to(release).as_posix():sha(p) for p in sorted(files)}},indent=2),encoding='utf-8')
files.append(manifest)
target = release.parent/(release.name+'.zip')
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for file in sorted(files): archive.write(file,Path(release.name)/file.relative_to(release))
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    for file in files: assert archive.read((Path(release.name)/file.relative_to(release)).as_posix()) == file.read_bytes()
digest = sha(target)
target.with_suffix('.zip.sha256').write_text(f'{digest}  {target.name}'+chr(10),encoding='ascii')
inventory={p.relative_to(release).as_posix():{'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(files)}
if args.evidence:
    assert args.evidence.is_dir()
    (args.evidence/'release-inventory.json').write_text(json.dumps({'files':inventory,'zip':str(target),'zip_bytes':target.stat().st_size,'zip_sha256':digest,'crc_and_member_bytes':'PASS'},indent=2),encoding='utf-8')
print(f'PASS {len(files)} ZIP members; {target.stat().st_size:,} bytes; {target}')
