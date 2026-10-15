"""QA: rasterize a guide PDF into 2x2 contact sheets so every page can be looked at.  python3 preview.py out/X.pdf previews [dpi]"""
import glob, os, subprocess, sys
from PIL import Image

pdf, outdir = sys.argv[1], sys.argv[2]
dpi = sys.argv[3] if len(sys.argv) > 3 else '60'
os.makedirs(outdir, exist_ok=True)
for f in glob.glob(os.path.join(outdir, '*.png')):
    os.remove(f)
subprocess.run(['pdftoppm', '-r', dpi, '-png', pdf, os.path.join(outdir, 'p')], stderr=subprocess.DEVNULL)
ims = [Image.open(f) for f in sorted(glob.glob(os.path.join(outdir, 'p-*.png')))]
w, h = ims[0].size
for s in range(0, len(ims), 4):
    sheet = Image.new('RGB', (w * 2 + 10, h * 2 + 10), (190, 190, 190))
    for i, im in enumerate(ims[s:s + 4]):
        sheet.paste(im, ((i % 2) * (w + 10), (i // 2) * (h + 10)))
    sheet.save(os.path.join(outdir, f'sheet{s // 4 + 1}.png'))
print(len(ims), 'pages ->', outdir)
