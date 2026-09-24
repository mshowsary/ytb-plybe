# art/build_beach.py — the Beach Shack's props, modelled in Blender and exported as glTF.
#
# Run:  blender -b --factory-startup --python art/build_beach.py -- <out_dir> [<preview.png>]
#
# Every model shares ONE palette texture (palette.png, 8 x 4 swatches of 8 px). Each face is coloured
# by pointing its UVs at the centre of a swatch, so every beach prop uses the same material and the
# game can merge the whole set into a single draw call.
#
# Axes: Blender is Z-up; the glTF exporter turns it Y-up. A model's FRONT faces Blender -Y, which
# becomes +Z in the game (toward the camera / the table a chair faces).
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix, Euler

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_DIR = argv[0] if argv else os.path.join(os.path.dirname(__file__), '..', 'public', 'models', 'beach')
PREVIEW = argv[1] if len(argv) > 1 else None

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bkit
from bkit import *

# ---- the models ------------------------------------------------------------------------------
def chair(name, cushion):
    """A white wooden bistro chair with a coloured cushion. Seat top at 0.47, front toward -Y."""
    P = []
    for sx in (-0.17, 0.17):
        for sy in (-0.17, 0.17):
            P.append(cyl(0.022, 0.018, 0.44, sx, sy, 0.22, WHITE, 8))
    P.append(box(0.44, 0.44, 0.045, 0, 0, 0.44, WHITE, 0.01))
    P.append(box(0.4, 0.4, 0.05, 0, -0.01, 0.485, cushion, 0.018))
    # the back: two posts and three slats, very slightly reclined
    for sx in (-0.19, 0.19): P.append(cyl(0.022, 0.022, 0.5, sx, 0.2, 0.71, WHITE, 8, rot=(math.radians(-8), 0, 0)))
    for k in range(3): P.append(box(0.4, 0.03, 0.06, 0, 0.215 + k * 0.012, 0.6 + k * 0.13, WHITE if k != 1 else cushion, 0.01, rot=(math.radians(-8), 0, 0)))
    return join(P, name)

def table(name):
    """A round café table: white top with a navy rim on a driftwood pedestal. Top at 0.76, r 0.52."""
    P = [cyl(0.52, 0.52, 0.045, 0, 0, 0.74, WHITE, 32, bevel=0.01),
         cyl(0.535, 0.535, 0.03, 0, 0, 0.71, NAVY, 32),
         cyl(0.06, 0.08, 0.68, 0, 0, 0.36, WOOD, 12),
         cyl(0.28, 0.32, 0.05, 0, 0, 0.025, WOOD_D, 20),
         cyl(0.05, 0.05, 0.1, 0.0, 0.26, 0.81, GLASS, 10),            # a little vase with a flower
         sph(0.05, 0.0, 0.26, 0.9, CORAL, seg=10, rings=6)]
    return join(P, name)

def parasol(name, a, b, h=2.4, r=1.2):
    """A beach parasol: 8 striped panels with a scalloped fringe, on a white pole."""
    P = [cyl(0.03, 0.03, h, 0, 0, h / 2, WHITE, 8),
         cyl(0.18, 0.22, 0.08, 0, 0, 0.04, WHITE, 12)]
    def stripes(c):
        ang = math.atan2(c.y, c.x) % (2 * math.pi)
        return a if int(ang / (math.pi / 4)) % 2 == 0 else b
    P.append(cyl(r, 0.04, 0.42, 0, 0, h + 0.1, a, 16, smooth=False, fn=stripes))
    for k in range(16):                                        # the fringe: little triangles round the edge
        t = (k + 0.5) / 16 * 2 * math.pi
        P.append(cyl(0.1, 0.0, 0.14, math.cos(t) * r * 0.97, math.sin(t) * r * 0.97, h - 0.17, a if k % 2 else b, 3, rot=(math.pi, 0, t), smooth=False))
    P.append(sph(0.05, 0, 0, h + 0.33, WHITE, seg=8, rings=5))
    return join(P, name)

def lounger(name, stripe):
    """A sun lounger: white frame, striped cushion, the back raised. Long axis along Y."""
    P = []
    for sx in (-0.3, 0.3):
        P.append(box(0.04, 1.75, 0.05, sx, 0, 0.3, WHITE, 0.01))
        for sy in (-0.75, 0.6): P.append(cyl(0.02, 0.02, 0.3, sx, sy, 0.15, WHITE, 8))
    for k in range(6):                                  # the cushion in six stripes, as separate strips
        x = -0.29 + (k + 0.5) * 0.58 / 6; c = stripe if k % 2 == 0 else WHITE
        P.append(box(0.58 / 6, 1.1, 0.07, x, -0.3, 0.36, c, 0.01))
        P.append(box(0.58 / 6, 0.62, 0.07, x, 0.52, 0.52, c, 0.01, rot=(math.radians(35), 0, 0)))
    P.append(box(0.3, 0.14, 0.08, 0, 0.62, 0.64, WHITE, 0.03, rot=(math.radians(35), 0, 0)))   # pillow
    return join(P, name)

def palm(name, lean=0.35, height=4.0, fronds=8, seed=0):
    """A coconut palm: a ringed trunk curving along a bezier, drooping fronds with leaflet notches."""
    P = []
    p0, p1, p2 = Vector((0, 0, 0)), Vector((lean * 0.2, 0, height * 0.5)), Vector((lean, lean * 0.2, height))
    bez = lambda t: (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2
    tan = lambda t: (2 * (1 - t) * (p1 - p0) + 2 * t * (p2 - p1)).normalized()
    n = 11
    for k in range(n):
        t = (k + 0.5) / n
        c, d = bez(t), tan(t)
        r = 0.17 - 0.06 * t
        o = cyl(r * 0.92, r * 1.08, height / n * 1.02, c.x, c.y, c.z, TRUNK if k % 2 else TRUNK_D, 10, smooth=True)
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = d.to_track_quat('Z', 'Y')
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        P.append(o)
    top = bez(1.0)
    for i in range(fronds):
        a = i / fronds * 2 * math.pi + seed
        L, rise, droop = 1.7 + 0.25 * ((i * 37) % 3) / 2, 0.35, 1.2
        dirv = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-math.sin(a), math.cos(a), 0))
        verts, faces = [], []
        steps = 12
        for s in range(steps + 1):
            t = s / steps
            base = top + dirv * (L * t) + Vector((0, 0, rise * math.sin(math.pi * t * 0.7) - droop * t * t))
            w = 0.34 * math.sin(math.pi * min(1, t * 1.15)) * (1.0 if s % 2 == 0 else 0.72)   # notched leaflets
            verts += [base - side * w + Vector((0, 0, -0.05 * w)), base + Vector((0, 0, 0.03)), base + side * w + Vector((0, 0, -0.05 * w))]
            if s:
                k = (s - 1) * 3
                faces += [(k, k + 3, k + 4, k + 1), (k + 1, k + 4, k + 5, k + 2)]
        P.append(mesh_obj('frond', verts, faces, LEAF if i % 2 else LEAF_D, smooth=True))
    for j in range(3):
        a = j * 2.1 + seed
        P.append(sph(0.12, top.x + math.cos(a) * 0.14, top.y + math.sin(a) * 0.14, top.z - 0.14, COCONUT, seg=10, rings=7))
    return join(P, name)

def surfboard(name, a, b):
    """A surfboard stuck upright in the sand, with a centre stripe."""
    stripe = lambda c: b if abs(c.x) < 0.05 else a
    o = sph(0.26, 0, 0, 1.0, a, sx=1, sy=0.18, sz=4.0, seg=20, rings=12, fn=stripe)
    return join([o, box(0.02, 0.1, 0.12, 0, 0.05, 0.2, BLACK)], name)

def cabana(name, a):
    """A striped beach cabana with a pointed roof and an open doorway."""
    P = []
    P.append(box(1.76, 1.56, 1.78, 0, 0, 0.9, WHITE))
    for k in range(6):                                  # canvas stripes on the front and back
        x = -0.9 + (k + 0.5) * 0.3
        for y in (-0.795, 0.795): P.append(box(0.3, 0.02, 1.8, x, y, 0.9, a if k % 2 == 0 else WHITE))
    for k in range(5):                                  # and down the sides
        y = -0.8 + (k + 0.5) * 0.32
        for x in (-0.895, 0.895): P.append(box(0.02, 0.32, 1.8, x, y, 0.9, a if k % 2 == 0 else WHITE))
    P.append(box(0.8, 0.02, 1.3, 0, -0.815, 0.65, NAVY_D))
    P.append(box(2.0, 1.8, 0.12, 0, 0, 1.86, a, 0.02))
    P.append(cyl(1.35, 0.02, 0.8, 0, 0, 2.3, WHITE, 4, rot=(0, 0, math.pi / 4), smooth=False, fn=lambda c: a if c.x * c.y > 0 else WHITE))
    P.append(cyl(0.015, 0.015, 0.5, 0, 0, 2.9, WHITE, 6)); P.append(box(0.3, 0.01, 0.18, 0.15, 0, 3.05, CORAL))
    return join(P, name)

def tiki(name):
    """A tiki torch: a bamboo pole, a woven cup, a flame."""
    P = [cyl(0.05, 0.06, 1.8, 0, 0, 0.9, WOOD, 8)]
    for k in range(4): P.append(cyl(0.065, 0.065, 0.04, 0, 0, 0.35 + k * 0.4, WOOD_D, 8))
    P += [cyl(0.13, 0.08, 0.24, 0, 0, 1.9, THATCH, 10), cyl(0.09, 0.0, 0.3, 0, 0, 2.15, CORAL, 8), cyl(0.05, 0.0, 0.18, 0, 0, 2.12, YELLOW, 8)]
    return join(P, name)

def lifeguard(name):
    P = []
    for sx in (-0.6, 0.6):
        for sy in (-0.6, 0.6): P.append(cyl(0.06, 0.07, 2.2, sx, sy, 1.1, WHITE, 8))
    P.append(box(1.7, 1.7, 0.1, 0, 0, 2.2, WOOD, 0.01))
    P.append(box(1.6, 1.6, 0.9, 0, 0, 2.7, CORAL, 0.02, fn=lambda c: WHITE if abs(c.z - 2.7) < 0.12 else CORAL))
    P.append(box(1.3, 0.02, 0.45, 0, -0.81, 2.75, GLASS))
    P.append(cyl(1.4, 0.05, 0.8, 0, 0, 3.55, WHITE, 4, rot=(0, 0, math.pi / 4), smooth=False))
    P.append(box(0.5, 1.9, 0.06, 0.2, -1.35, 1.1, WOOD, rot=(math.radians(50), 0, 0)))
    P.append(torus(0.28, 0.07, 0, -0.86, 2.7, CORAL, rot=(math.pi / 2, 0, 0), fn=lambda c: CORAL if int((math.atan2(c.z, c.x) + 4) / 0.785) % 2 else WHITE))
    return join(P, name)

def plant(name):
    """A tropical plant in a navy pot: broad leaves fanning out."""
    P = [cyl(0.24, 0.18, 0.38, 0, 0, 0.19, NAVY, 14), cyl(0.25, 0.25, 0.04, 0, 0, 0.38, WHITE, 14), cyl(0.21, 0.21, 0.02, 0, 0, 0.37, COCONUT, 14)]
    for i in range(7):
        a = i / 7 * 2 * math.pi
        d, s = Vector((math.cos(a), math.sin(a), 0)), Vector((-math.sin(a), math.cos(a), 0))
        verts, faces = [], []
        for k in range(7):
            t = k / 6
            base = Vector((0, 0, 0.4)) + d * 0.5 * t + Vector((0, 0, 0.55 * math.sin(math.pi * t * 0.8)))
            w = 0.16 * math.sin(math.pi * t)
            verts += [base - s * w, base + Vector((0, 0, 0.02)), base + s * w]
            if k: j = (k - 1) * 3; faces += [(j, j + 3, j + 4, j + 1), (j + 1, j + 4, j + 5, j + 2)]
        P.append(mesh_obj('leaf', verts, faces, LEAF if i % 2 else LIME))
    return join(P, name)

def lifering(name):
    return join([torus(0.3, 0.08, 0, 0, 0, CORAL, rot=(math.pi / 2, 0, 0), fn=lambda c: CORAL if int((math.atan2(c.z, c.x) + 4) / 0.785) % 2 else WHITE)], name)

def counter(name, accent):
    """The beach bar counter: whitewashed planks, a navy kick band, an accent stripe and a dark
    driftwood top (so pale goods stand out). 1.8 x 0.8, top at 0.93; guests stand at -Y."""
    P = []
    n = 12
    for k in range(n): P.append(box(1.8 / n - 0.012, 0.76, 0.74, -0.9 + (k + 0.5) * 1.8 / n, 0, 0.45, CREAM, 0.008))
    P.append(box(1.82, 0.78, 0.12, 0, 0, 0.06, NAVY, 0.01))
    P.append(box(1.82, 0.02, 0.1, 0, -0.39, 0.7, accent))
    P.append(box(1.88, 0.84, 0.07, 0, 0, 0.895, WOOD_D, 0.015))
    P.append(box(1.72, 0.66, 0.012, 0, 0, 0.935, TRUNK_D))
    return join(P, name)

def till(name):
    P = []
    n = 9
    for k in range(n): P.append(box(1.4 / n - 0.012, 0.76, 0.74, -0.7 + (k + 0.5) * 1.4 / n, 0, 0.45, NAVY, 0.008))
    P += [box(1.42, 0.78, 0.12, 0, 0, 0.06, NAVY_D, 0.01), box(1.42, 0.02, 0.1, 0, -0.39, 0.7, WHITE),
          box(1.48, 0.84, 0.07, 0, 0, 0.895, WOOD_D, 0.015),
          box(0.56, 0.44, 0.12, 0, 0, 0.99, CHARCOAL, 0.02), box(0.5, 0.34, 0.2, 0, 0.03, 1.14, TEAL, 0.03),
          box(0.36, 0.03, 0.2, 0, 0.1, 1.3, BLACK, 0.01, rot=(math.radians(30), 0, 0)),
          sph(0.12, 0.45, 0.0, 1.02, COCONUT, sz=0.85), cyl(0.11, 0.11, 0.02, 0.45, 0, 1.11, WHITE, 12), cyl(0.05, 0.05, 0.03, 0.45, 0, 1.13, YELLOW, 10)]
    return join(P, name)

# ---- build, export, preview -------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
import bkit
bkit.setup(OUT_DIR)
models = [
    table('b_table'), chair('b_chair_coral', CORAL), chair('b_chair_navy', NAVY),
    parasol('b_parasol_navy', NAVY, WHITE), parasol('b_parasol_coral', CORAL, WHITE), parasol('b_parasol_teal', TEAL, WHITE),
    lounger('b_lounger_navy', NAVY), lounger('b_lounger_coral', CORAL),
    palm('b_palm_a', 0.5, 4.2, 8, 0.0), palm('b_palm_b', -0.4, 3.6, 7, 0.7),
    surfboard('b_surf_coral', CORAL, WHITE), surfboard('b_surf_navy', NAVY, YELLOW), surfboard('b_surf_teal', TEAL, WHITE),
    cabana('b_cabana_navy', NAVY), cabana('b_cabana_coral', CORAL), tiki('b_tiki'), lifeguard('b_lifeguard'),
    plant('b_plant'), lifering('b_lifering'),
    counter('b_counter_teal', TEAL), counter('b_counter_coral', CORAL), counter('b_counter_yellow', YELLOW), counter('b_counter_blue', BLUE),
    till('b_till'),
]
for m in models: export(m)
print('EXPORTED', len(models), 'models to', OUT_DIR)

if PREVIEW:
    cols = 6
    for i, m in enumerate(models):
        m.location = ((i % cols) * 2.8, -(i // cols) * 3.2, 0)
    bpy.ops.object.camera_add(location=(18, -26, 16), rotation=(math.radians(62), 0, math.radians(30)))
    cam = active(); bpy.context.scene.camera = cam; cam.data.lens = 32
    bpy.ops.object.light_add(type='SUN', location=(0, 0, 10), rotation=(math.radians(40), math.radians(20), 0))
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
    sc.display.shading.show_shadows = True; sc.display.shading.show_cavity = True
    sc.render.resolution_x, sc.render.resolution_y = 1600, 1000
    sc.render.filepath = PREVIEW
    bpy.ops.mesh.primitive_plane_add(size=60, location=(7, -5, 0)); paint(active(), SAND); active().data.materials.append(bkit.MAT)
    bpy.ops.render.render(write_still=True)
    print('PREVIEW', PREVIEW)
