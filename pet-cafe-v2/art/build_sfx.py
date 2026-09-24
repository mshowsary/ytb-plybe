# art/build_sfx.py - converts the chosen Kenney CC0 sounds (downloaded packs) to small mono MP3s in public/sfx.
# Run: blender -b --factory-startup --python art/build_sfx.py -- <folder with the unzipped Kenney packs> public/sfx
import aud, sys, glob, os, numpy as np
args = sys.argv[sys.argv.index('--') + 1:]
root, out = args[0], args[1]
os.makedirs(out, exist_ok=True)
PICK = [('cash', 'handleCoins2.ogg', 0.8, None), ('tap', 'select_002.ogg', 0.6, None), ('drop', 'glass_002.ogg', 0.55, None),
        ('pop', 'impactSoft_medium_000.ogg', 0.7, None), ('pop2', 'impactSoft_medium_001.ogg', 0.7, None),
        ('build', 'impactPlank_medium_000.ogg', 0.85, 0.6), ('chime', 'confirmation_001.ogg', 0.6, None), ('clean', 'cloth1.ogg', 0.7, 0.5),
        ('step1', 'footstep_wood_000.ogg', 0.5, None), ('step2', 'footstep_wood_001.ogg', 0.5, None), ('step3', 'footstep_wood_002.ogg', 0.5, None),
        ('whoosh', 'maximize_006.ogg', 0.6, None), ('open', 'open_001.ogg', 0.5, None), ('close', 'close_001.ogg', 0.5, None),
        ('plate', 'impactPlate_light_000.ogg', 0.7, 0.4)]
for name, src, peak, cut in PICK:
    fs = glob.glob(os.path.join(root, '**', src), recursive=True)
    if not fs: print('MISSING', src); continue
    s = aud.Sound(fs[0]).rechannel(1).resample(32000, False)
    a = s.data()
    k = peak / max(1e-4, float(np.abs(a).max()))
    s = s.volume(k)
    if cut: s = s.limit(0, cut).fadeout(cut - 0.08, 0.08)
    path = os.path.join(out, name + '.mp3')
    try:
        s.write(path, 32000, aud.CHANNELS_MONO, aud.FORMAT_S16, aud.CONTAINER_MP3, aud.CODEC_MP3, 64000)
    except Exception as e:
        print('mp3 failed', name, e); s.write(os.path.join(out, name + '.wav'), 32000, aud.CHANNELS_MONO, aud.FORMAT_S16, aud.CONTAINER_WAV, aud.CODEC_PCM)
    print('wrote', name, os.path.getsize(path) if os.path.exists(path) else 'wav')
