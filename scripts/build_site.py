"""Build a static GitHub Pages artifact with the exact packaged Python source."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '_site'
OUT.mkdir(exist_ok=True)
shutil.copytree(ROOT/'site', OUT, dirs_exist_ok=True)
shutil.copytree(ROOT/'src/synthholonoise', OUT/'python/synthholonoise', dirs_exist_ok=True,
                ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
shutil.copyfile(ROOT/'examples/clean.png', OUT/'assets/clean.png')
(OUT/'.nojekyll').touch()
print(OUT)
