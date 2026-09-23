# art/build_map.py — the journey map: a miniature island diorama, modelled in Blender.
#
# Run:  blender -b --factory-startup --python art/build_map.py -- <out_dir> [<preview.png>]
#
# Game coordinates: x east, z south (toward the camera). Blender x = game x, Blender y = -game z.
# Café sites (game x, z): town (-6, 4), beach (9, 7.2), lodge (7, -5), market (-7, -5).
import bpy, bmesh, math, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_DIR = argv[0] if argv else os.path.join(os.path.dirname(__file__), '..', 'public', 'models', 'map')
PREVIEW = argv[1] if len(argv) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
import bkit
from bkit import *
bkit.setup(OUT_DIR)

G = lambda x, z: (x, -z)          # game (x, z) -> Blender (x, y)
TOP = 1.0                          # the grass plateau height

def outline(n=72, rx=15.5, ry=12.0, seed=0.0):
    pts = []
    for i in range(n):
        a = i / n * 2 * math.pi
        r = 1 + 0.10 * math.sin(3 * a + seed) + 0.06 * math.cos(5 * a + 1.3) + 0.03 * math.sin(9 * a)
        pts.append((math.cos(a) * rx * r, math.sin(a) * ry * r))
    return pts

def slab(name, pts, z0, z1, top_col, side_col, inset=0.0):
    """An extruded plateau: a flat top (fan from the centre) and sloped sides."""
    bm = bmesh.new()
    cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
    top = [bm.verts.new((cx + (x - cx) * (1 - inset), cy + (y - cy) * (1 - inset), z1)) for x, y in pts]
    bot = [bm.verts.new((x, y, z0)) for x, y in pts]
    c = bm.verts.new((cx, cy, z1))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((c, top[i], top[j]))
        bm.faces.new((top[i], bot[i], bot[j], top[j]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    finish(o, top_col, 0, False)
    paint(o, top_col, fn=lambda cc: top_col if cc.z > z1 - 0.01 else side_col)
    return o

def island():
    P = []
    base = outline()
    P.append(slab('rim', base, -1.2, 0.35, SAND, WOOD, 0.0))                 # the sandy shore
    P.append(slab('land', base, 0.3, TOP, LEAF, OLIVE, 0.07))                 # the green plateau
    # the beach cove in the south-east: a wide sand ramp down to the water
    cove = [(x + 8.5, y - 6.5) for x, y in outline(24, 5.5, 3.2, 1.0)]
    P.append(slab('cove', cove, -1.0, 0.55, SAND, SAND, 0.0))
    # lighter meadows, a pond, flower dots
    for (x, z, r) in [(-2, 1, 3.2), (3, -1, 2.4), (-9, 0, 2.0)]:
        P.append(cyl(r, r, 0.04, *G(x, z), TOP + 0.02, LIME, 24, smooth=False))
    P.append(cyl(1.6, 1.6, 0.05, *G(1.5, 1.5), TOP + 0.03, SKY, 24, smooth=False))
    P.append(cyl(1.25, 1.25, 0.06, *G(1.5, 1.5), TOP + 0.04, BLUE, 24, smooth=False))
    for k in range(40):
        a = k * 2.399; r = 2 + (k * 37 % 90) / 10
        x, z = math.cos(a) * r * 1.2, math.sin(a) * r * 0.9
        P.append(sph(0.12, *G(x, z), TOP + 0.08, [CORAL, YELLOW, WHITE, PEACH][k % 4], seg=6, rings=4))
    return join(P, 'm_island')

def mountains():
    P = []
    for (x, z, h, r) in [(8.0, -8.6, 4.4, 2.6), (11.4, -6.6, 3.3, 2.0), (4.8, -9.2, 2.9, 1.9), (12.0, -9.4, 2.6, 1.6)]:
        P.append(cyl(r, 0.0, h, *G(x, z), TOP + h / 2, METAL, 7, smooth=False))
        P.append(cyl(r * 0.42, 0.0, h * 0.42, *G(x, z), TOP + h * 0.79, WHITE, 7, smooth=False))
    P.append(cyl(3.0, 3.0, 0.05, *G(7.3, -5.2), TOP + 0.03, WHITE, 20, smooth=False))  # snowfield round the lodge
    return join(P, 'm_mountains')

def town_cafe():
    """The Town Café in miniature: cream walls, a coral striped awning, a paw sign on the roof."""
    P = [box(2.0, 1.6, 1.3, 0, 0, TOP + 0.65, CREAM, 0.03), box(2.2, 1.8, 0.14, 0, 0, TOP + 1.37, CORAL_D, 0.02)]
    for k in range(8): P.append(box(0.25, 0.5, 0.05, -0.875 + k * 0.25, -1.0, TOP + 1.05, CORAL if k % 2 == 0 else WHITE, rot=(math.radians(-25), 0, 0)))
    P += [box(0.5, 0.02, 0.8, 0, -0.81, TOP + 0.4, WOOD_D), box(0.45, 0.02, 0.45, -0.6, -0.81, TOP + 0.7, GLASS), box(0.45, 0.02, 0.45, 0.6, -0.81, TOP + 0.7, GLASS)]
    P.append(cyl(0.5, 0.5, 0.08, 0, -0.2, TOP + 1.95, WHITE, 20, rot=(math.pi / 2, 0, 0))); P.append(cyl(0.04, 0.04, 0.5, 0, -0.2, TOP + 1.5, WOOD_D, 6))
    P.append(sph(0.16, 0, -0.26, TOP + 1.88, CORAL, sy=0.3, seg=10, rings=6))
    for dx, dz in ((-0.17, 0.14), (-0.06, 0.22), (0.06, 0.22), (0.17, 0.14)): P.append(sph(0.06, dx, -0.26, TOP + 1.88 + dz, CORAL, sy=0.3, seg=8, rings=5))
    return join(P, 'm_towncafe')

def beach_shack():
    """The Beach Shack in miniature: a navy-and-white hut under a thatched cone, on a little deck."""
    P = [box(2.4, 2.0, 0.12, 0, 0, 0.6, WOOD, 0.02)]
    for k in range(8): P.append(box(0.22, 1.2, 1.0, -0.77 + k * 0.22, 0.1, 1.15, NAVY if k % 2 == 0 else WHITE))
    P.append(cyl(1.35, 0.05, 1.0, 0, 0.1, 2.15, THATCH, 10, smooth=False))
    P.append(box(1.2, 0.02, 0.5, 0, -0.51, 1.1, WOOD_D))
    for x in (-1.1, 1.1): P.append(cyl(0.04, 0.04, 1.4, x, -0.9, 1.3, WOOD_D, 6))
    return join(P, 'm_beachshack')

def lodge():
    """A snowy log lodge: stacked logs, a white roof, a chimney with a lit window."""
    P = []
    for k in range(6): P.append(cyl(0.11, 0.11, 2.1, 0, -0.75 + 0.0, TOP + 0.12 + k * 0.2, TRUNK if k % 2 else TRUNK_D, 8, rot=(0, math.pi / 2, 0)))
    for k in range(6): P.append(cyl(0.11, 0.11, 2.1, 0, 0.75, TOP + 0.12 + k * 0.2, TRUNK if k % 2 else TRUNK_D, 8, rot=(0, math.pi / 2, 0)))
    P.append(box(1.9, 1.5, 1.2, 0, 0, TOP + 0.6, TRUNK))
    P.append(box(1.4, 2.0, 0.1, -0.5, 0, TOP + 1.55, WHITE, rot=(0, math.radians(-38), 0)))
    P.append(box(1.4, 2.0, 0.1, 0.5, 0, TOP + 1.55, WHITE, rot=(0, math.radians(38), 0)))
    P += [box(0.3, 0.3, 0.8, 0.55, 0.3, TOP + 1.9, RED), box(0.36, 0.36, 0.08, 0.55, 0.3, TOP + 2.3, WHITE)]
    P += [box(0.4, 0.02, 0.35, -0.45, -0.76, TOP + 0.65, YELLOW), box(0.4, 0.02, 0.35, 0.45, -0.76, TOP + 0.65, YELLOW), box(0.35, 0.02, 0.6, 0, -0.76, TOP + 0.3, WOOD_D)]
    return join(P, 'm_lodge')

def market():
    """The night market: three striped stalls, lantern strings, a paper lantern arch."""
    P = [cyl(2.3, 2.3, 0.05, 0, 0, TOP + 0.03, THATCH_L, 24, smooth=False), cyl(1.6, 1.6, 0.05, 0, 0, TOP + 0.05, SAND, 24, smooth=False)]
    for i, (x, z, a, b) in enumerate([(-1.1, 0.4, CORAL, WHITE), (1.1, 0.4, BLUE, WHITE), (0, -1.0, YELLOW, CORAL)]):
        P.append(box(1.0, 0.7, 0.55, *G(x, z), TOP + 0.3, WOOD))
        for sx in (-0.45, 0.45):
            for sz in (-0.3, 0.3): P.append(cyl(0.03, 0.03, 1.2, *G(x + sx, z + sz), TOP + 0.6, WOOD_D, 6))
        for k in range(5): P.append(box(0.2, 0.75, 0.06, *G(x - 0.4 + k * 0.2, z), TOP + 1.25, a if k % 2 == 0 else b, rot=(math.radians(12), 0, 0)))
    for k in range(9):
        a = k / 9 * 2 * math.pi
        P.append(sph(0.1, *G(math.cos(a) * 1.9, math.sin(a) * 1.9), TOP + 1.5 + math.sin(k) * 0.1, [YELLOW, CORAL, HONEY][k % 3], seg=8, rings=5))
    for x in (-1.9, 1.9): P.append(cyl(0.05, 0.05, 1.8, *G(x, 1.8), TOP + 0.9, RED, 6))
    P.append(box(3.9, 0.12, 0.14, *G(0, 1.8), TOP + 1.8, RED))
    for k in range(4): P.append(sph(0.16, *G(-1.2 + k * 0.8, 1.8), TOP + 1.55, CORAL, sz=1.3, seg=8, rings=6))
    return join(P, 'm_market')

def lighthouse():
    P = [cyl(1.0, 1.3, 0.8, 0, 0, 0.1, METAL, 8, smooth=False)]
    for k in range(5): P.append(cyl(0.45 - k * 0.03, 0.42 - k * 0.03, 0.55, 0, 0, 0.75 + k * 0.55, RED if k % 2 == 0 else WHITE, 12))
    P += [cyl(0.38, 0.38, 0.4, 0, 0, 3.6, GLASS, 12), cyl(0.45, 0.0, 0.5, 0, 0, 4.05, RED, 12), cyl(0.5, 0.5, 0.08, 0, 0, 3.4, CHARCOAL, 12)]
    return join(P, 'm_lighthouse')

def boat():
    return join([box(1.4, 0.5, 0.3, 0, 0, 0.15, WHITE, 0.08), box(1.3, 0.45, 0.06, 0, 0, 0.02, NAVY),
                 cyl(0.03, 0.03, 1.4, 0.1, 0, 1.0, WOOD_D, 5), cyl(0.55, 0.0, 1.2, 0.35, 0, 0.95, CORAL, 3, smooth=False)], 'm_boat')

def cloud():
    return join([sph(0.8, 0, 0, 0, WHITE, sz=0.6, seg=10, rings=6), sph(0.6, 0.8, 0.1, -0.05, WHITE, sz=0.6, seg=10, rings=6),
                 sph(0.55, -0.75, -0.1, -0.08, WHITE, sz=0.6, seg=10, rings=6), sph(0.45, 0.2, 0.3, 0.25, WHITE, sz=0.7, seg=10, rings=6)], 'm_cloud')

def pin():
    """A map pin: a round head on a point. The game recolours it per café state."""
    return join([sph(0.45, 0, 0, 1.25, WHITE, seg=16, rings=10), cyl(0.3, 0.0, 0.9, 0, 0, 0.6, WHITE, 16),
                 cyl(0.3, 0.3, 0.04, 0, 0, 0.02, LIGHTGREY, 16)], 'm_pin')

def road():
    """The dotted path between the cafés: stepping stones along a loop over the island."""
    P = []
    pts = [(-6, 4), (-2, 5.5), (2, 5.2), (5.5, 5.8), (8, 6), (9.5, 3), (9, 0), (7, -5), (3, -6.5), (-1, -7), (-4, -6), (-7, -5), (-9, -1.5), (-8, 2), (-6, 4)]
    for i in range(len(pts) - 1):
        (x0, z0), (x1, z1) = pts[i], pts[i + 1]
        n = max(2, int(math.hypot(x1 - x0, z1 - z0) / 0.7))
        for k in range(n):
            t = k / n; x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
            P.append(cyl(0.18, 0.2, 0.06, *G(x, z), TOP + 0.05 if not (x > 6 and z > 4) else 0.6, CREAM, 8, smooth=False))
    return join(P, 'm_road')

models = [island(), mountains(), town_cafe(), beach_shack(), lodge(), market(), lighthouse(), boat(), cloud(), pin(), road()]
for m in models: export(m)
print('EXPORTED', len(models), 'models to', OUT_DIR)

if PREVIEW:
    placed = {'m_towncafe': (-6, 4), 'm_beachshack': (8, 6), 'm_lodge': (7, -5), 'm_market': (-7, -5), 'm_lighthouse': (-13, 8), 'm_boat': (-2, 13), 'm_cloud': (0, 0)}
    for m in models:
        if m.name in placed: x, z = placed[m.name]; m.location = (x, -z, 5 if m.name == 'm_cloud' else 0)
        if m.name == 'm_pin': m.location = (-6, -4, TOP + 2.2)
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0)); paint(active(), SKY); active().data.materials.append(bkit.MAT)
    bpy.ops.object.camera_add(location=(0, -30, 26), rotation=(math.radians(50), 0, 0))
    bpy.context.scene.camera = active(); active().data.lens = 30
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'; sc.display.shading.show_shadows = True
    sc.render.resolution_x, sc.render.resolution_y = 1400, 1000; sc.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True); print('PREVIEW', PREVIEW)
