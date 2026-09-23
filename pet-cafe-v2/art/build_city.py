# art/build_city.py — the café city: a miniature seaside town, rendered offline in Cycles for the map.
#
# Run:  blender -b --factory-startup --python art/build_city.py -- <out_dir> [preview|final|layout]
#   preview  a quick 1200 px render to judge the composition (city_preview.png)
#   final    the full-size render (city.png) + occluders.glb + city.json
#   layout   only occluders.glb + city.json (no render)
#
# The game draws city.png behind an orthographic camera that matches this one exactly (city.json holds
# it), writes occluders.glb into the depth buffer only, and then draws the live things over it — cars,
# walkers, pets, the boat — so they pass behind houses and trees like they belong in the picture.
#
# Blender coordinates: x east, y north, z up. city.json is in the game's (three.js) frame: x, z=-y, y=z.
# Houses and shops are Kenney's CC0 city kits (art/kenney), recoloured warm; everything else is modelled here.
import bpy, bmesh, math, random, json, os, sys
from mathutils import Vector, Matrix, Euler
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_DIR = os.path.abspath(argv[0]) if argv else os.path.join(HERE, '..', 'public', 'map')
MODE = argv[1] if len(argv) > 1 else 'preview'
VIEW, LOOK, EXPO = (argv[2] if len(argv) > 2 else 'Standard'), (argv[3] if len(argv) > 3 else 'None'), float(argv[4]) if len(argv) > 4 else -0.25
KEN = os.path.join(HERE, 'kenney')
KK = os.path.join(HERE, '..', 'public', 'kk', 'city')
os.makedirs(OUT_DIR, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene
rnd = random.Random(11)

# ---- camera and frame --------------------------------------------------------------------------
ELEV, YAW = math.radians(40), math.radians(-45)       # looking north-east, 40° down
FRAME_W, IMG_W, IMG_H = 104.0, 3200, 2400
FRAME_H = FRAME_W * IMG_H / IMG_W
TARGET = Vector((15.9, 1.7, 0.0))
FWD = Vector((math.sin(-YAW) * math.cos(ELEV), math.cos(-YAW) * math.cos(ELEV), -math.sin(ELEV)))
RIGHT = Vector((math.cos(-YAW), -math.sin(-YAW), 0.0))
UP = RIGHT.cross(FWD).normalized()

def screen(p):
    """world point -> frame coords (-0.5..0.5 across, -0.5..0.5 up)"""
    d = Vector(p) - TARGET
    return d.dot(RIGHT) / FRAME_W, d.dot(UP) / FRAME_H

def visible(x0, y0, x1, y1, h=10, m=0.04):
    pts = [screen((x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (0, h)]
    return not (max(p[0] for p in pts) < -0.5 - m or min(p[0] for p in pts) > 0.5 + m or
                max(p[1] for p in pts) < -0.5 - m or min(p[1] for p in pts) > 0.5 + m)

# ---- collections ---------------------------------------------------------------------------------
def coll(name, render=True):
    c = bpy.data.collections.new(name); SC.collection.children.link(c)
    if not render: c.hide_render = True; c.hide_viewport = True
    return c
C_CITY, C_TPL, C_OCC = coll('city'), coll('templates', False), coll('occluders', False)

# ---- materials ---------------------------------------------------------------------------------
def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
def srgb(h):
    h = h.lstrip('#'); return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]

MATS = {}
def mat(hexv, rough=0.8, emit=0.0, metal=0.0, trans=0.0, ior=1.45, spec=0.35, name=None, coat=0.0):
    key = name or f'{hexv}_{rough}_{emit}_{metal}_{trans}'
    if key in MATS: return MATS[key]
    m = bpy.data.materials.new(key); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*lin(hexv), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Specular IOR Level'].default_value = spec
    if coat: b.inputs['Coat Weight'].default_value = coat
    if emit:
        b.inputs['Emission Color'].default_value = (*lin(hexv), 1); b.inputs['Emission Strength'].default_value = emit
    if trans:
        b.inputs['Transmission Weight'].default_value = trans; b.inputs['IOR'].default_value = ior
    m.diffuse_color = (*lin(hexv), 1)
    MATS[key] = m
    return m

# the town's colours
GRASS, GRASS_L, GRASS_D = mat('#86C45A'), mat('#9BD06A'), mat('#6FAF4A')
ASPHALT = mat('#7C8591', 0.9)
LINE = mat('#F4F1E6', 0.7)
WALK, CURB = mat('#EADFCB', 0.85), mat('#D9CBB3', 0.85)
PAVER, PAVER_D = mat('#E6D3B3', 0.85), mat('#D8C09C', 0.85)
PATH = mat('#E9DAB9', 0.9)
SAND, SAND_W = mat('#F1DDA8', 0.95), mat('#E2C58C', 0.95)
LEAF = [mat('#6DB948'), mat('#58A63E'), mat('#86C957'), mat('#4E9A3B')]
TRUNK = mat('#8A5B3C')
HEDGE = mat('#4F9B43')
CREAM, CREAM2, WHITE = mat('#F4E4C4'), mat('#F7DCC0'), mat('#FFF8EC')
TERRA, BRICK = mat('#E3763F'), mat('#B5553F')
WOOD, WOOD_D, WOOD_L = mat('#A86F45'), mat('#7C4E2F'), mat('#C9935E')
GLASS_W = mat('#FFD29A', 0.4, emit=2.2, name='warmglass')        # lit windows
GLASS_B = mat('#9FCBE3', 0.15, spec=0.7, name='blueglass')
GREEN_A, CORAL, CORAL_D = mat('#2F9A5C'), mat('#F06A55'), mat('#D9503F')
DARK = mat('#34404A', 0.6)
METAL = mat('#B9C3CA', 0.35, metal=0.6)
LAMPGLOW = mat('#FFE3A8', 0.3, emit=6.0, name='lampglow')
PAW = mat('#5E3A24', 0.7)
POT = mat('#C9764E')
FLOWERS = [mat('#F2616D'), mat('#FFC940'), mat('#F79BC2'), mat('#FFFFFF'), mat('#B98CEB')]
STONE = mat('#D8CFC0', 0.9)
POOL = mat('#5CC9E6', 0.08, spec=0.8, name='pool', coat=0.8)
FOUNTAIN_W = mat('#8ADCF0', 0.05, spec=0.8, name='fountainwater')

# ---- a mesh builder: many primitives into one object, one material slot per colour ------------------
class Mesh:
    def __init__(self, name):
        self.name, self.bm, self.mats = name, bmesh.new(), []
    def _mi(self, m):
        if m not in self.mats: self.mats.append(m)
        return self.mats.index(m)
    def _fin(self, verts, m, bevel=0.0, seg=1, smooth=False):
        faces = list({f for v in verts for f in v.link_faces})
        mi = self._mi(m)
        for f in faces: f.material_index = mi; f.smooth = smooth
        if bevel > 0:
            edges = list({e for f in faces for e in f.edges})
            bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, segments=seg, affect='EDGES', profile=0.5, clamp_overlap=True)
        return faces
    def box(self, sx, sy, sz, x, y, z, m, rz=0.0, rx=0.0, ry=0.0, bevel=0.0):
        M = Matrix.Translation((x, y, z + sz / 2)) @ Euler((rx, ry, rz)).to_matrix().to_4x4() @ Matrix.Diagonal((sx, sy, sz, 1))
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=M)
        return self._fin(r['verts'], m, bevel)
    def cyl(self, r1, r2, h, x, y, z, m, seg=16, rx=0.0, ry=0.0, rz=0.0, smooth=True, bevel=0.0):
        M = Matrix.Translation((x, y, z)) @ Euler((rx, ry, rz)).to_matrix().to_4x4() @ Matrix.Translation((0, 0, h / 2))
        r = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h, matrix=M)
        return self._fin(r['verts'], m, bevel, smooth=smooth)
    def ico(self, r, x, y, z, m, sub=1, s=(1, 1, 1), jitter=0.0, rz=0.0):
        M = Matrix.Translation((x, y, z)) @ Euler((0, 0, rz)).to_matrix().to_4x4() @ Matrix.Diagonal((*s, 1))
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r, matrix=M)
        if jitter:
            for v in res['verts']:
                v.co += Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * jitter * r
        return self._fin(res['verts'], m)
    def sph(self, r, x, y, z, m, s=(1, 1, 1), seg=12, rings=8, rx=0.0, rz=0.0):
        M = Matrix.Translation((x, y, z)) @ Euler((rx, 0, rz)).to_matrix().to_4x4() @ Matrix.Diagonal((*s, 1))
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=rings, radius=r, matrix=M)
        return self._fin(res['verts'], m, smooth=True)
    def prism(self, pts, z0, z1, m, smooth=False):
        bm = self.bm
        bot = [bm.verts.new((x, y, z0)) for x, y in pts]; top = [bm.verts.new((x, y, z1)) for x, y in pts]
        n = len(pts); fs = [bm.faces.new(top), bm.faces.new(list(reversed(bot)))]
        for i in range(n):
            j = (i + 1) % n; fs.append(bm.faces.new((bot[i], bot[j], top[j], top[i])))
        mi = self._mi(m)
        for f in fs: f.material_index = mi; f.smooth = smooth
        return fs
    def quad_strip(self, left, right, m):
        """a flat ribbon between two polylines (for paths and foam)"""
        bm = self.bm; L = [bm.verts.new(p) for p in left]; R = [bm.verts.new(p) for p in right]
        mi = self._mi(m)
        for i in range(len(L) - 1):
            f = bm.faces.new((L[i], R[i], R[i + 1], L[i + 1])); f.material_index = mi
    def hip_roof(self, x0, y0, x1, y1, z, h, m, gable=False):
        bm = self.bm; w, d = x1 - x0, y1 - y0; cy, cx = (y0 + y1) / 2, (x0 + x1) / 2
        c = [bm.verts.new(p) for p in ((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z))]
        if w >= d:
            k = 0 if gable else d / 2
            r = [bm.verts.new((x0 + k, cy, z + h)), bm.verts.new((x1 - k, cy, z + h))]
            fs = [bm.faces.new((c[0], c[1], r[1], r[0])), bm.faces.new((c[2], c[3], r[0], r[1])),
                  bm.faces.new((c[1], c[2], r[1])), bm.faces.new((c[3], c[0], r[0])), bm.faces.new((c[3], c[2], c[1], c[0]))]
        else:
            k = 0 if gable else w / 2
            r = [bm.verts.new((cx, y0 + k, z + h)), bm.verts.new((cx, y1 - k, z + h))]
            fs = [bm.faces.new((c[1], c[2], r[1], r[0])), bm.faces.new((c[3], c[0], r[0], r[1])),
                  bm.faces.new((c[0], c[1], r[0])), bm.faces.new((c[2], c[3], r[1])), bm.faces.new((c[3], c[2], c[1], c[0]))]
        mi = self._mi(m)
        for f in fs: f.material_index = mi
        bmesh.ops.recalc_face_normals(bm, faces=fs)
    def done(self, xf=None, collection=None):
        if xf is not None: bmesh.ops.transform(self.bm, matrix=xf, verts=self.bm.verts)
        me = bpy.data.meshes.new(self.name); self.bm.to_mesh(me); self.bm.free()
        for m in self.mats: me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me); (collection or C_CITY).objects.link(ob)
        return ob

def xform(x, y, rz=0.0, s=1.0, z=0.0):
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Scale(s, 4)

# ---- occluders: simple solids that stand in for tall things in the game's depth buffer ----------------
OCC = Mesh('occluders')
def occ_box(x0, y0, x1, y1, h, z=0.0):
    OCC.box(x1 - x0, y1 - y0, h, (x0 + x1) / 2, (y0 + y1) / 2, z, WHITE)
def occ_obj_hull(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.transform(bm, matrix=ob.matrix_world, verts=bm.verts)
    pts = [v.co.copy() for v in bm.verts]; bm.free()
    if len(pts) < 4: return
    t = bmesh.new(); vs = [t.verts.new(p) for p in pts]
    bmesh.ops.convex_hull(t, input=vs)
    me = bpy.data.meshes.new('hull'); t.to_mesh(me); t.free()
    OCC.bm.from_mesh(me); bpy.data.meshes.remove(me)

# ---- Kenney kits, recoloured ---------------------------------------------------------------------
def import_joined(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    bm = bmesh.new()
    for o in meshes:
        me = o.data.copy(); me.transform(o.matrix_world)
        bm.from_mesh(me); bpy.data.meshes.remove(me)
    out = bpy.data.meshes.new(os.path.basename(path).split('.')[0]); bm.to_mesh(out); bm.free()
    for o in new: bpy.data.objects.remove(o, do_unlink=True)
    return out

def recolor(src, name, repl):
    img = bpy.data.images.load(src, check_existing=True)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    for (row, col), hexv in repl.items():
        y0, y1 = h - (row + 1) * h // 4, h - row * h // 4
        x0, x1 = col * w // 8, (col + 1) * w // 8
        reg = px[y0:y1, x0:x1, :3]
        lum = reg @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        f = (lum / max(float(lum.mean()), 1e-4)) ** 0.5
        px[y0:y1, x0:x1, :3] = np.clip(np.array(srgb(hexv), dtype=np.float32)[None, None, :] * f[..., None], 0, 1)
    out = bpy.data.images.new(name, w, h, alpha=True)
    out.pixels.foreach_set(px.ravel()); out.pack()
    return out

def tex_mat(name, img, rough=0.75):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough; b.inputs['Specular IOR Level'].default_value = 0.3
    return m

SUB_MAP = os.path.join(KEN, 'suburban', 'Textures', 'colormap.png')
COM_MAP = os.path.join(KEN, 'commercial', 'Textures', 'colormap.png')
ROOFS = ['#DC7445', '#C9564A', '#E9924E', '#A9604A', '#7F97AE', '#D86A55']
WALLS = ['#F8EDD7', '#F6D2B4', '#F6E3A8', '#F3CFC5', '#FCF7EE', '#D9EBDD', '#DCE8F2', '#F2DEC4']
SUB_MATS = [tex_mat(f'sub{i}', recolor(SUB_MAP, f'subcol{i}', {(1, 0): ROOFS[i % len(ROOFS)], (2, 3): WALLS[(i * 3) % len(WALLS)], (2, 0): '#A89C90', (3, 1): '#5FA84A'}))
            for i in range(8)]
COM_MATS = [tex_mat(f'com{i}', recolor(COM_MAP, f'comcol{i}', {(2, 3): ['#FBEBD0', '#F9D8BE', '#FAE8B4', '#F4E0CF', '#FFF5E6'][i],
                                                              (2, 0): ['#DB8F6C', '#8FB7CF', '#E2B26F', '#93C2A3', '#E89E86'][i], (2, 1): '#8C7A6E'}))
            for i in range(5)]
KMESH = {}
def ken(kind, name):
    key = (kind, name)
    if key not in KMESH: KMESH[key] = import_joined(os.path.join(KEN, kind, name + '.glb'))
    return KMESH[key]
VARIANT = {}
def ken_variant(kind, name, m):
    key = (kind, name, m.name)
    if key not in VARIANT:
        me = ken(kind, name).copy(); me.materials.clear(); me.materials.append(m); VARIANT[key] = me
    return VARIANT[key]
def place(me, x, y, rz=0.0, s=1.0, z=0.0, occ=True, name='k'):
    ob = bpy.data.objects.new(name, me); C_CITY.objects.link(ob)
    ob.matrix_world = xform(x, y, rz, s, z)
    if occ: occ_obj_hull(ob)
    return ob

KKMESH = {}
def kk(name):
    if name not in KKMESH: KKMESH[name] = import_joined(os.path.join(KK, name + '.gltf'))
    return KKMESH[name]

# ---- templates: trees, palms, lamps ------------------------------------------------------------
def tree_template(i):
    T = Mesh(f'tree{i}'); h = [1.6, 2.0, 1.3, 1.8][i]
    T.cyl(0.22, 0.16, h + 0.6, 0, 0, 0, TRUNK, seg=7, smooth=False)
    blobs = [[(0, 0, h + 1.2, 1.35), (0.7, 0.3, h + 0.7, 0.95), (-0.6, -0.35, h + 0.8, 0.9)],
             [(0, 0, h + 1.4, 1.2), (0.1, 0.2, h + 2.3, 0.8)],
             [(0, 0, h + 1.1, 1.5), (0.8, -0.2, h + 0.8, 0.9), (-0.5, 0.6, h + 0.9, 0.85), (0.1, -0.1, h + 2.0, 0.8)],
             [(0, 0, h + 1.3, 1.25), (-0.7, 0.2, h + 0.9, 0.8)]][i]
    for k, (x, y, z, r) in enumerate(blobs):
        T.ico(r, x, y, z, LEAF[(i + k) % 4], sub=1, jitter=0.12)
    return T.done(collection=C_TPL).data
def palm_template(i):
    T = Mesh(f'palm{i}'); lean = [0.5, -0.4, 0.8][i]; hgt = [5.2, 4.4, 6.0][i]
    p = Vector((0, 0, 0)); segs = 7
    for k in range(segs):
        t = (k + 1) / segs; q = Vector((lean * t * t * 1.4, 0, hgt * t))
        d = q - p; L = d.length
        T.cyl(0.24 - 0.08 * t, 0.2 - 0.08 * t, L + 0.05, p.x, p.y, p.z, WOOD if k % 2 else WOOD_L, seg=7, ry=math.atan2(d.x, d.z), smooth=False)
        p = q
    for f in range(8):
        a = f / 8 * 2 * math.pi + i; L = 2.4
        pts_l, pts_r = [], []
        for s in range(6):
            t = s / 5; r = L * t; dz = 0.5 * t - 1.6 * t * t
            w = 0.55 * math.sin(math.pi * min(1, t * 1.1 + 0.05))
            cx, cy = p.x + math.cos(a) * r, p.y + math.sin(a) * r
            nx, ny = -math.sin(a) * w, math.cos(a) * w
            pts_l.append((cx + nx, cy + ny, p.z + dz + 0.1)); pts_r.append((cx - nx, cy - ny, p.z + dz))
        T.quad_strip(pts_l, pts_r, LEAF[(f + i) % 3])
    for c in range(3): T.sph(0.2, p.x + math.cos(c * 2.1) * 0.25, p.y + math.sin(c * 2.1) * 0.25, p.z - 0.25, WOOD_D)
    return T.done(collection=C_TPL).data
def lamp_template():
    T = Mesh('lamp')
    T.cyl(0.18, 0.14, 0.3, 0, 0, 0, DARK, seg=8)
    T.cyl(0.07, 0.06, 3.4, 0, 0, 0.3, DARK, seg=8)
    T.cyl(0.26, 0.16, 0.12, 0, 0, 3.7, DARK, seg=8)
    T.cyl(0.2, 0.2, 0.42, 0, 0, 3.82, LAMPGLOW, seg=8)
    T.cyl(0.08, 0.3, 0.26, 0, 0, 4.24, DARK, seg=8)
    return T.done(collection=C_TPL).data
TREES = [tree_template(i) for i in range(4)]
PALMS = [palm_template(i) for i in range(3)]
LAMP = lamp_template()

def tree(x, y, s=1.0, kind=None, occ=True):
    me = TREES[kind if kind is not None else rnd.randrange(4)]
    ob = place(me, x, y, rnd.uniform(0, 6.28), s * rnd.uniform(0.9, 1.1), occ=False, name='tree')
    if occ: OCC.ico(1.3 * s, x, y, 3.0 * s, WHITE, sub=1, s=(1, 1, 0.9))
    return ob
def palm(x, y, s=1.0, kind=None):
    ob = place(PALMS[kind if kind is not None else rnd.randrange(3)], x, y, rnd.uniform(0, 6.28), s, occ=False, name='palm')
    return ob
def lamp(x, y):
    place(LAMP, x, y, 0, 1.0, occ=False, name='lamp')

# ---- the street grid, and the coast that cuts it on a diagonal ------------------------------------
BLOCK, ROAD, P = 24.0, 6.0, 30.0
WALKW = 2.2
K = 44.0                                   # the promenade's inner edge is the line x - y = K: upright on screen
R2 = math.sqrt(0.5)
U, N = Vector((R2, R2, 0)), Vector((R2, -R2, 0))       # along the coast (north-east), out to sea (south-east)
def coast_d(x, y): return (x - y) * R2 - K * R2         # distance seaward of the promenade's inner edge
def at(t, d, z=0.0):
    p = U * t + N * (K * R2 + d); return (p.x, p.y, z)
CROAD = 6.6                                             # the coast road between the blocks and the promenade
LAND = lambda x, y: coast_d(x, y) + CROAD               # <= 0 where blocks may stand
I_RANGE, J_RANGE = range(-4, 4), range(-4, 5)

def rrect(cx, cy, w, h, r, seg=5):
    pts = []
    for qx, qy, a0 in ((cx + w / 2 - r, cy + h / 2 - r, 0), (cx - w / 2 + r, cy + h / 2 - r, 90),
                       (cx - w / 2 + r, cy - h / 2 + r, 180), (cx + w / 2 - r, cy - h / 2 + r, 270)):
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg); pts.append((qx + r * math.cos(a), qy + r * math.sin(a)))
    return pts
def clip(pts, f):
    """keep the part of a convex polygon where f(x, y) <= 0 (f linear)"""
    out = []
    for k in range(len(pts)):
        a, b = pts[k], pts[(k + 1) % len(pts)]; fa, fb = f(*a), f(*b)
        if fa <= 0: out.append(a)
        if (fa <= 0) != (fb <= 0):
            t = fa / (fa - fb); out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out
def area(pts):
    return abs(sum(pts[k][0] * pts[(k + 1) % len(pts)][1] - pts[(k + 1) % len(pts)][0] * pts[k][1] for k in range(len(pts)))) / 2

G = Mesh('ground')
G.prism(clip([(-220, -220), (220, -220), (220, 220), (-220, 220)], lambda x, y: coast_d(x, y) + 0.2), -0.2, 0.0, ASPHALT)

BLOCKS = {}
def block_kind(i, j):
    if (i, j) == (0, 0): return 'park'
    if (i, j) == (0, 1): return 'town'
    if (i, j) == (1, 1): return 'mall'
    if (i, j) in ((1, 0), (-1, 1), (-1, 2), (0, 2), (1, 2), (0, 3)): return 'shops'
    if (i, j) in ((-2, -1), (-1, 3)): return 'green'
    return 'houses'
for i in I_RANGE:
    for j in J_RANGE:
        cx, cy = P * i, P * j
        if not visible(cx - 15, cy - 15, cx + 15, cy + 15, 12): continue
        outer = clip(rrect(cx, cy, BLOCK, BLOCK, 2.4), LAND)
        if len(outer) < 3 or area(outer) < 0.04 * BLOCK * BLOCK: continue
        BLOCKS[(i, j)] = block_kind(i, j) if area(outer) > 0.6 * BLOCK * BLOCK else 'green'
        G.prism(outer, 0.0, 0.16, CURB)
        G.prism(clip(rrect(cx, cy, BLOCK - 0.3, BLOCK - 0.3, 2.3), lambda x, y: LAND(x, y) + 0.15), 0.16, 0.2, WALK)

# dashed centre lines and zebra crossings
def dashes(x0, y0, x1, y1):
    L = math.hypot(x1 - x0, y1 - y0); n = int(L / 3.2)
    for k in range(n):
        t = (k + 0.5) / n; x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        if LAND(x, y) > -3.0: continue
        G.box(1.5 if x1 != x0 else 0.16, 1.5 if y1 != y0 else 0.16, 0.02, x, y, 0.0, LINE)
def zebra(x, y, ns):
    # stripes lie along the road; ns: the road runs north-south, so they are spaced across x
    if LAND(x, y) > -4.0: return
    for k in range(6):
        o = -2.2 + k * 0.88
        if ns: G.box(0.5, 1.8, 0.02, x + o, y, 0.0, LINE)
        else: G.box(1.8, 0.5, 0.02, x, y + o, 0.0, LINE)
for i in I_RANGE:
    for j in J_RANGE:
        cx, cy = P * i, P * j
        if not visible(cx - 15, cy - 15, cx + 15, cy + 15, 12): continue
        rx, ry = cx + P / 2, cy + P / 2
        dashes(rx, cy - 11, rx, cy + 11); dashes(cx - 11, ry, cx + 11, ry)
        if abs(i) <= 2 and abs(j) <= 2:
            zebra(rx, cy + 10.2, True); zebra(rx, cy - 10.2, True)
            zebra(cx + 10.2, ry, False); zebra(cx - 10.2, ry, False)
# the coast road's centre line
T0, T1 = -150.0, 150.0
t = T0
while t < T1:
    x, y, _ = at(t, -CROAD / 2 - 0.2)
    if visible(x - 2, y - 2, x + 2, y + 2, 1) and not (-8.5 < t < -2.5): G.box(1.5, 0.16, 0.02, x, y, 0.0, LINE, rz=math.pi / 4)
    t += 3.2
# a zebra over the coast road to the Beach Café's steps
for k in range(6):
    x, y, _ = at(-5.5, -CROAD / 2 - 2.4 + k * 0.95)
    G.box(1.9, 0.5, 0.025, x, y, 0.0, LINE, rz=math.pi / 4)
G.done()

# ---- the seaside: promenade and rail, sand, foam, and a sea that deepens from the shore -----------------
SEA_Z = -0.32
def dshore(t): return 14.5 + 2.0 * math.sin(t / 11.0) + 1.0 * math.sin(t / 4.1 + 1.0)
BEACH_T, BEACH_D = 0.0, 10.4                     # the Beach Café's deck centre, in coast coordinates
S = Mesh('beach')
S.prism([at(T0, -0.25)[:2], at(T1, -0.25)[:2], at(T1, 0.1)[:2], at(T0, 0.1)[:2]], -0.2, 0.26, CURB)
S.prism([at(T0, 0.1)[:2], at(T1, 0.1)[:2], at(T1, 3.8)[:2], at(T0, 3.8)[:2]], -0.2, 0.22, WALK)
for k in range(int((T1 - T0) / 3.0)):          # paving joints
    t = T0 + k * 3.0; x, y, _ = at(t, 1.95)
    if visible(x - 3, y - 3, x + 3, y + 3, 1): S.box(0.06, 3.6, 0.01, x, y, 0.22, CURB, rz=math.pi / 4)
# the wooden rail along the sand, open where steps go down
def rail_run(a, b):
    if b - a < 1: return
    pa, pb = Vector(at(a, 3.55)), Vector(at(b, 3.55)); mid = (pa + pb) / 2
    if not visible(min(pa.x, pb.x), min(pa.y, pb.y), max(pa.x, pb.x), max(pa.y, pb.y), 2): return
    S.box((pb - pa).length, 0.14, 0.12, mid.x, mid.y, 0.95, WOOD_L, rz=math.pi / 4)
    S.box((pb - pa).length, 0.1, 0.08, mid.x, mid.y, 0.6, WOOD_L, rz=math.pi / 4)
    n = max(1, int((b - a) / 2.2))
    for k in range(n + 1):
        x, y, _ = at(a + (b - a) * k / n, 3.55); S.box(0.16, 0.16, 0.9, x, y, 0.2, WOOD)
gaps = [(-62, -58), (BEACH_T - 8.0, BEACH_T - 3.0), (38, 42)]
edges = [T0] + [v for g in gaps for v in g] + [T1]
for k in range(0, len(edges), 2): rail_run(edges[k], edges[k + 1])
# the sand: a sloping grid so the water finds its own wavy line
ts = [T0 + k * 2.0 for k in range(int((T1 - T0) / 2.0) + 1)]; ds = [3.8 + k * 0.8 for k in range(48)]
def sand_z(t, d): return 0.2 - max(0.0, d - (dshore(t) - 4.0)) * 0.12 - 0.025 * math.sin(t * 0.7 + d * 1.3)
grid = [[S.bm.verts.new(at(t, d, sand_z(t, d))) for d in ds] for t in ts]
# wet sand darkens smoothly toward the water: a per-vertex 'wet' value read by the sand material
SANDMIX = bpy.data.materials.new('sandmix'); SANDMIX.use_nodes = True
_nt = SANDMIX.node_tree; _b = _nt.nodes['Principled BSDF']
_at = _nt.nodes.new('ShaderNodeAttribute'); _at.attribute_name = 'wet'
_rp = _nt.nodes.new('ShaderNodeValToRGB'); _nt.links.new(_at.outputs['Fac'], _rp.inputs['Fac'])
_rp.color_ramp.elements[0].color = (*lin('#F3DFA9'), 1); _rp.color_ramp.elements[1].color = (*lin('#DDBE84'), 1)
_nt.links.new(_rp.outputs['Color'], _b.inputs['Base Color']); _b.inputs['Roughness'].default_value = 0.95
mi_s = S._mi(SANDMIX)
for a in range(len(ts) - 1):
    for b in range(len(ds) - 1):
        f = S.bm.faces.new((grid[a][b], grid[a + 1][b], grid[a + 1][b + 1], grid[a][b + 1]))
        f.material_index = mi_s
# foam where the water meets the sand, and softer wave lines beyond it
FOAM = mat('#FFFFFF', 0.6, name='foam')
for off, w0, w1, broken in ((0.15, -0.35, 0.8, False), (2.4, -0.1, 0.14, True), (5.0, -0.07, 0.09, True)):
    left, right = [], []
    for k in range(0, 601):
        t = T0 + k * 0.5; d = dshore(t) + off + 0.35 * math.sin(t * 0.9) + (0.6 * math.sin(t * 0.13 + off) if broken else 0)
        w = 1.0 + 0.4 * math.sin(t * 0.37 + off)
        on = not broken or math.sin(t * 0.23 + off * 3) + 0.4 * math.sin(t * 0.61) > 0.15
        if on:
            left.append(at(t, d + w0 * w, SEA_Z + 0.02)); right.append(at(t, d + w1 * w, SEA_Z + 0.02))
        elif len(left) > 1:
            S.quad_strip(left, right, FOAM); left, right = [], []
        else: left, right = [], []
    if len(left) > 1: S.quad_strip(left, right, FOAM)
beach_ob = S.done()
_me = beach_ob.data; _wet = _me.color_attributes.new(name='wet', type='FLOAT_COLOR', domain='POINT')
for v in _me.vertices:
    t, d = (v.co.x + v.co.y) * R2, coast_d(v.co.x, v.co.y)
    w = min(1.0, max(0.0, (d - (dshore(t) - 3.2)) / 2.6)); w = w * w * (3 - 2 * w)
    _wet.data[v.index].color = (w, w, w, 1.0)
# the sea
bm = bmesh.new()
vs = [bm.verts.new(at(t, d, SEA_Z)) for t, d in ((T0 - 150, 8), (T1 + 150, 8), (T1 + 150, 400), (T0 - 150, 400))]
bm.faces.new(vs); sea = bpy.data.meshes.new('sea'); bm.to_mesh(sea); bm.free()
sea_ob = bpy.data.objects.new('sea', sea); C_CITY.objects.link(sea_ob)
m = bpy.data.materials.new('sea'); m.use_nodes = True
nt = m.node_tree; b = nt.nodes['Principled BSDF']; L = nt.links.new
geo = nt.nodes.new('ShaderNodeNewGeometry'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); L(geo.outputs['Position'], sep.inputs['Vector'])
sub = nt.nodes.new('ShaderNodeMath'); sub.operation = 'SUBTRACT'; L(sep.outputs['X'], sub.inputs[0]); L(sep.outputs['Y'], sub.inputs[1])
dd = nt.nodes.new('ShaderNodeMath'); dd.operation = 'MULTIPLY_ADD'; L(sub.outputs[0], dd.inputs[0]); dd.inputs[1].default_value = R2; dd.inputs[2].default_value = -K * R2
nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.05; L(geo.outputs['Position'], nz.inputs['Vector'])
wob = nt.nodes.new('ShaderNodeMath'); wob.operation = 'MULTIPLY_ADD'; L(nz.outputs['Fac'], wob.inputs[0]); wob.inputs[1].default_value = 8.0; L(dd.outputs[0], wob.inputs[2])
mr = nt.nodes.new('ShaderNodeMapRange'); L(wob.outputs[0], mr.inputs['Value']); mr.inputs['From Min'].default_value = 21.0; mr.inputs['From Max'].default_value = 75.0
ramp = nt.nodes.new('ShaderNodeValToRGB'); L(mr.outputs['Result'], ramp.inputs['Fac'])
cr = ramp.color_ramp; cr.elements[0].position = 0.0; cr.elements[0].color = (*lin('#8EE3E0'), 1)
cr.elements[1].position = 1.0; cr.elements[1].color = (*lin('#1B86C4'), 1)
for pos, hexv in ((0.08, '#4FD0DE'), (0.3, '#2DB4DA'), (0.62, '#2197CE')):
    e = cr.elements.new(pos); e.color = (*lin(hexv), 1)
L(ramp.outputs['Color'], b.inputs['Base Color'])
b.inputs['Roughness'].default_value = 0.16; b.inputs['Specular IOR Level'].default_value = 0.55
bn = nt.nodes.new('ShaderNodeTexNoise'); bn.inputs['Scale'].default_value = 0.9; bn.inputs['Detail'].default_value = 3.0
L(geo.outputs['Position'], bn.inputs['Vector'])
bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.12; L(bn.outputs['Fac'], bump.inputs['Height']); L(bump.outputs['Normal'], b.inputs['Normal'])
sea.materials.append(m)

# ---- block contents ------------------------------------------------------------------------
SIDE = BLOCK / 2 - WALKW          # inner half-size: the lot area is [c-SIDE, c+SIDE]

def street_trees(cx, cy, skip=()):
    e = BLOCK / 2 - 0.9
    for k in range(-1, 2):
        o = k * 7.5
        for (x, y, side) in ((cx + o, cy - e, 's'), (cx + o, cy + e, 'n'), (cx - e, cy + o, 'w'), (cx + e, cy + o, 'e')):
            if side in skip or LAND(x, y) > -1.2: continue
            if k == 0: lamp(x, y)
            else: tree(x, y, 0.95)

def lots(cx, cy):
    lot = 2 * SIDE / 3
    for a in range(3):
        for b in range(3):
            x, y = cx - SIDE + lot * (a + 0.5), cy - SIDE + lot * (b + 0.5)
            rz = 0.0 if b == 0 else math.pi if b == 2 else (-math.pi / 2 if a == 0 else math.pi / 2)
            yield a, b, x, y, rz, LAND(x, y) <= -4.6

def yard(cx, cy, m, z1=0.23):
    Y = Mesh('yard'); Y.prism(clip(rrect(cx, cy, 2 * SIDE, 2 * SIDE, 1.2), lambda x, y: LAND(x, y) + 2.2), 0.2, z1, m); Y.done()

def houses(cx, cy):
    yard(cx, cy, GRASS)
    for a, b, x, y, rz, ok in lots(cx, cy):
        if not ok:
            if LAND(x, y) < -1.5: palm(x, y, 0.8)
            continue
        if a == 1 and b == 1:
            if rnd.random() < 0.5:
                Y = Mesh('pool'); Y.box(4.2, 2.6, 0.24, x, y, 0.2, STONE, bevel=0.1); Y.box(3.6, 2.0, 0.06, x, y, 0.42, POOL); Y.done()
                tree(x + 2.2, y + 1.8, 0.7)
            else:
                tree(x, y, 1.0); tree(x + 1.6, y - 1.4, 0.7)
            continue
        name = 'building-type-' + 'abcdefghijklmnopqrstu'[rnd.randrange(21)]
        place(ken_variant('suburban', name, SUB_MATS[rnd.randrange(len(SUB_MATS))]), x, y, rz, 4.5, 0.2)
        # a bush in the front garden, beside the path
        Y = Mesh('bush'); Y.ico(0.5, x + math.cos(rz) * 2.3 + math.sin(rz) * 2.5, y + math.sin(rz) * 2.3 - math.cos(rz) * 2.5, 0.6, LEAF[rnd.randrange(4)], sub=1, jitter=0.15); Y.done()
    street_trees(cx, cy)

def shops(cx, cy, tall=False):
    yard(cx, cy, PAVER_D, 0.22)
    lot = 2 * SIDE / 3
    for a, b, x, y, rz, ok in lots(cx, cy):
        if not ok:
            if LAND(x, y) < -1.5: palm(x, y, 0.8)
            continue
        if a == 1 and b == 1:
            Y = Mesh('plaza'); Y.box(lot, lot, 0.04, x, y, 0.2, PAVER); Y.done(); tree(x, y, 1.1)
            continue
        name = 'building-' + 'abcdfghijkln'[rnd.randrange(12)]
        place(ken_variant('commercial', name, COM_MATS[rnd.randrange(len(COM_MATS))]), x, y, rz, 5.0 if not tall else 5.6, 0.2)
    street_trees(cx, cy)

def green_block(cx, cy):
    yard(cx, cy, GRASS_L, 0.26)
    for k in range(14):
        x, y = cx + rnd.uniform(-SIDE + 1.5, SIDE - 1.5), cy + rnd.uniform(-SIDE + 1.5, SIDE - 1.5)
        if LAND(x, y) < -3: tree(x, y, rnd.uniform(0.8, 1.2))
    street_trees(cx, cy)

# a round paw sign: a cream disc framed in brown, with a paw print, facing -y
def paw_sign(M, x, y, z, r=1.0, face=0.0, back=WOOD_D, disc=None):
    disc = disc or mat('#FFF2D6')
    rot = Matrix.Translation((x, y, z)) @ Matrix.Rotation(face, 4, 'Z')
    tmp = Mesh('paw')
    tmp.cyl(r * 1.15, r * 1.15, 0.2, 0, 0.1, 0, back, seg=32, rx=math.pi / 2)
    tmp.cyl(r, r, 0.12, 0, -0.02, 0, disc, seg=32, rx=math.pi / 2)
    tmp.sph(r * 0.36, 0, -0.14, -r * 0.18, PAW, s=(1.15, 0.35, 0.95))
    for k, (dx, dz) in enumerate(((-0.5, 0.22), (-0.2, 0.46), (0.2, 0.46), (0.5, 0.22))):
        tmp.sph(r * 0.15, dx * r, -0.14, dz * r, PAW, s=(0.9, 0.35, 1.15))
    me = bpy.data.meshes.new('pawtmp'); tmp.bm.transform(rot); tmp.bm.to_mesh(me); tmp.bm.free()
    idx = [M._mi(m) for m in tmp.mats]
    b2 = bmesh.new(); b2.from_mesh(me)
    for f in b2.faces: f.material_index = idx[f.material_index]
    b2.to_mesh(me); b2.free()
    for m in tmp.mats: me.materials.append(m)
    M.bm.from_mesh(me); bpy.data.meshes.remove(me)

def striped_awning(M, x, y, z, w, d, tilt, a, b, n=8, face=0.0):
    """a canvas awning on a wall at (x,y), top edge at height z, sloping out toward -y"""
    R = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(face, 4, 'Z')
    for k in range(n):
        sx = -w / 2 + (k + 0.5) * w / n
        c = a if k % 2 == 0 else b
        cy, cz = -math.cos(tilt) * d / 2, z - math.sin(tilt) * d / 2
        tmp = bmesh.ops.create_cube(M.bm, size=1.0, matrix=R @ Matrix.Translation((sx, cy, cz)) @ Matrix.Rotation(tilt, 4, 'X') @ Matrix.Diagonal((w / n + 0.01, d, 0.06, 1)))
        M._fin(tmp['verts'], c)
        # valance flap at the front edge
        fy, fz = -math.cos(tilt) * d, z - math.sin(tilt) * d
        tmp = bmesh.ops.create_cube(M.bm, size=1.0, matrix=R @ Matrix.Translation((sx, fy, fz - 0.2)) @ Matrix.Diagonal((w / n + 0.01, 0.05, 0.42, 1)))
        M._fin(tmp['verts'], c)

def cafe_table(M, x, y, chairs=2, top=WHITE, rz=0.0):
    M.cyl(0.05, 0.05, 0.85, x, y, 0.2, DARK, seg=6)
    M.cyl(0.55, 0.55, 0.07, x, y, 1.02, top, seg=18)
    for k in range(chairs):
        a = rz + k * 2 * math.pi / chairs
        cx, cy = x + math.cos(a) * 0.95, y + math.sin(a) * 0.95
        M.box(0.5, 0.5, 0.08, cx, cy, 0.62, WOOD, rz=a)
        M.box(0.08, 0.5, 0.62, cx + math.cos(a) * 0.24, cy + math.sin(a) * 0.24, 0.66, WOOD, rz=a)
        for lx, ly in ((0.2, 0.2), (-0.2, 0.2), (0.2, -0.2), (-0.2, -0.2)):
            M.box(0.06, 0.06, 0.42, cx + lx, cy + ly, 0.2, WOOD_D)

def parasol(M, x, y, a, b=None, h=2.6, r=1.5):
    M.cyl(0.05, 0.05, h, x, y, 0.2, WHITE, seg=6)
    fs = M.cyl(r, 0.08, 0.6, x, y, 0.2 + h - 0.45, a, seg=16, smooth=False)
    if b is not None:
        side = [f for f in fs if abs(f.normal.z) < 0.99]
        side.sort(key=lambda f: math.atan2(f.calc_center_median().y - y, f.calc_center_median().x - x))
        for k, f in enumerate(side): f.material_index = M._mi(a if k % 2 == 0 else b)

def planter(M, x, y, w=1.4, d=0.6, rz=0.0):
    M.box(w, d, 0.55, x, y, 0.2, POT, rz=rz, bevel=0.05)
    M.box(w - 0.12, d - 0.12, 0.04, x, y, 0.72, mat('#6B4A33'), rz=rz)
    for k in range(int(w / 0.28)):
        t = -w / 2 + 0.2 + k * 0.28
        M.ico(0.2, x + math.cos(rz) * t, y + math.sin(rz) * t, 0.9, LEAF[k % 4], sub=1)
        M.ico(0.1, x + math.cos(rz) * t + 0.05, y + math.sin(rz) * t, 1.08, FLOWERS[(k + int(x)) % 5], sub=1)

def window(M, x, y, z, w, h, glass, face=0.0, frame=WHITE, sill=True, shutters=None):
    R = Matrix.Translation((x, y, z)) @ Matrix.Rotation(face, 4, 'Z')
    for (sx, sy, sz, ox, oy, oz, m) in ((w + 0.24, 0.16, h + 0.24, 0, -0.02, -0.12, frame), (w, 0.1, h, 0, -0.08, 0, glass),
                                        (0.08, 0.12, h, 0, -0.1, 0, frame), (w, 0.12, 0.08, 0, -0.1, h * 0.55, frame)):
        r = bmesh.ops.create_cube(M.bm, size=1.0, matrix=R @ Matrix.Translation((ox, oy, oz + sz / 2)) @ Matrix.Diagonal((sx, sy, sz, 1)))
        M._fin(r['verts'], m)
    if sill:
        r = bmesh.ops.create_cube(M.bm, size=1.0, matrix=R @ Matrix.Translation((0, -0.14, -0.16)) @ Matrix.Diagonal((w + 0.4, 0.32, 0.1, 1)))
        M._fin(r['verts'], frame)
    if shutters:
        for sgn in (-1, 1):
            r = bmesh.ops.create_cube(M.bm, size=1.0, matrix=R @ Matrix.Translation((sgn * (w / 2 + 0.36), -0.05, h / 2)) @ Matrix.Diagonal((0.42, 0.08, h + 0.1, 1)))
            M._fin(r['verts'], shutters)

# ---- the Town Café: a two-storey corner café with striped awnings and a paw sign ----------------------
def town_cafe(cx, cy, sc=1.12):
    M = Mesh('towncafe')
    W, D = 11.0, 8.0
    x0, y0 = 0.0, 0.0                          # built round its front-centre (front faces -y), then placed
    M.box(W + 0.4, D + 0.4, 0.3, x0, y0 + D / 2, 0.2, mat('#B99A7B'))
    M.box(W, D, 3.4, x0, y0 + D / 2, 0.5, CREAM, bevel=0.05)
    M.box(W + 0.3, D + 0.3, 0.28, x0, y0 + D / 2, 3.9, WHITE, bevel=0.04)
    M.box(W - 0.4, D - 0.4, 2.7, x0, y0 + D / 2, 4.18, CREAM2, bevel=0.05)
    M.box(W + 0.1, D + 0.1, 0.3, x0, y0 + D / 2, 6.88, WHITE, bevel=0.04)
    M.hip_roof(x0 - W / 2 - 0.5, y0 - 0.5, x0 + W / 2 + 0.5, y0 + D + 0.5, 7.18, 2.5, TERRA)
    M.box(0.9, 0.9, 2.2, x0 + 3.2, y0 + 5.2, 7.6, BRICK, bevel=0.05); M.box(1.1, 1.1, 0.2, x0 + 3.2, y0 + 5.2, 9.8, WHITE)
    # ground floor front: two big lit windows and a glazed door
    for wx in (-3.3, 3.3):
        window(M, x0 + wx, y0, 0.95, 3.1, 2.2, GLASS_W, sill=False)
        striped_awning(M, x0 + wx, y0 - 0.05, 3.55, 3.7, 1.7, math.radians(24), GREEN_A, WHITE, n=8)
    M.box(1.7, 0.3, 2.9, x0, y0 - 0.05, 0.5, WOOD_D, bevel=0.03)
    M.box(1.2, 0.1, 1.5, x0, y0 - 0.22, 1.7, GLASS_W)
    M.box(2.4, 1.0, 0.12, x0, y0 - 0.5, 3.45, WOOD_D)
    for s in (-1, 1): M.box(0.25, 0.25, 0.5, x0 + s * 1.2, y0 - 0.2, 2.6, LAMPGLOW)
    # upper floor: four windows with green shutters and flower boxes
    for wx in (-4.0, -1.6, 1.6, 4.0):
        if abs(wx) < 2: continue
        window(M, x0 + wx, y0 + 0.2, 4.7, 1.3, 1.6, GLASS_B, shutters=GREEN_A)
        M.box(1.5, 0.4, 0.3, x0 + wx, y0 - 0.05, 4.35, POT)
        for k in range(5): M.ico(0.13, x0 + wx - 0.6 + k * 0.3, y0 - 0.05, 4.72, FLOWERS[k % 5], sub=1)
    paw_sign(M, x0, y0 + 0.1, 5.5, 1.05)
    # the west side: windows too, the side the camera sees
    for wy in (2.2, 5.8):
        window(M, x0 - W / 2, y0 + wy, 1.1, 2.2, 1.9, GLASS_W, face=-math.pi / 2, sill=False)
        window(M, x0 - W / 2 + 0.2, y0 + wy, 4.7, 1.3, 1.6, GLASS_B, face=-math.pi / 2, shutters=GREEN_A)
    striped_awning(M, x0 - W / 2 - 0.05, y0 + 4.0, 3.4, 6.0, 1.3, math.radians(24), GREEN_A, WHITE, n=12, face=-math.pi / 2)
    # the patio: pavers, tables, parasols, planters and a chalkboard
    M.box(W + 2.0, 4.2, 0.06, x0, y0 - 2.1, 0.2, PAVER)
    for k, tx in enumerate((-4.2, 0.0, 4.2)):
        if tx == 0: continue
        cafe_table(M, x0 + tx, y0 - 2.1, 2, rz=0.0)
        parasol(M, x0 + tx, y0 - 2.1, WHITE, mat('#E8E0D0'))
    cafe_table(M, x0 - 6.4, y0 + 1.2, 2, rz=math.pi / 2)
    parasol(M, x0 - 6.4, y0 + 1.2, WHITE)
    for px in (-6.2, 6.2): planter(M, x0 + px, y0 - 3.9, 1.6, 0.6)
    planter(M, x0 - 2.0, y0 - 3.9, 1.4, 0.5); planter(M, x0 + 2.0, y0 - 3.9, 1.4, 0.5)
    M.box(0.7, 0.35, 1.1, x0 + 1.3, y0 - 1.0, 0.2, DARK, rx=0.12)
    for s in (-1, 1):
        M.cyl(0.35, 0.28, 0.5, x0 + s * 1.3, y0 - 0.5, 0.2, POT, seg=10)
        M.cyl(0.04, 0.04, 0.8, x0 + s * 1.3, y0 - 0.5, 0.6, TRUNK, seg=5)
        M.ico(0.45, x0 + s * 1.3, y0 - 0.5, 1.6, LEAF[1], sub=2)
    ob = M.done(xf=Matrix.Translation((cx, cy, 0)) @ Matrix.Scale(sc, 4))
    occ_box(cx - W / 2 * sc, cy, cx + W / 2 * sc, cy + D * sc, 8.0 * sc)
    return ob

# ---- the Mall Café: a big shopping hall with a glass roof, the next chapter ---------------------------
def mall(cx, cy):
    M = Mesh('mall')
    W, D, H = 19.0, 13.0, 7.2
    x0, y0 = cx, cy
    WALL = mat('#EFD9B4'); WALL2 = mat('#F7E9D0'); TRIM = mat('#C98A5E')
    M.box(W + 0.6, D + 0.6, 0.3, x0, y0 + D / 2, 0.2, mat('#BFA586'))
    M.box(W, D, H, x0, y0 + D / 2, 0.5, WALL, bevel=0.06)
    M.box(W + 0.3, D + 0.3, 0.35, x0, y0 + D / 2, 3.9, WALL2, bevel=0.04)
    for k in range(9):       # pilasters
        px = x0 - W / 2 + 0.3 + k * (W - 0.6) / 8
        M.box(0.55, 0.3, H - 0.2, px, y0 - 0.1, 0.5, WALL2, bevel=0.04)
    # parapet ring
    for (sx, sy, x, y) in ((W + 0.4, 0.5, x0, y0), (W + 0.4, 0.5, x0, y0 + D), (0.5, D, x0 - W / 2, y0 + D / 2), (0.5, D, x0 + W / 2, y0 + D / 2)):
        M.box(sx, sy, 0.7, x, y, H + 0.5, WALL2, bevel=0.05)
    # glass atrium on the roof: a glazed drum and a hipped glass roof with ribs
    ax0, ax1, ay0, ay1 = x0 - 5.5, x0 + 5.5, y0 + 3.0, y0 + 10.0
    M.box(ax1 - ax0, ay1 - ay0, 1.3, x0, (ay0 + ay1) / 2, H + 0.5, GLASS_B)
    for k in range(9):
        M.box(0.12, ay1 - ay0 + 0.1, 1.3, ax0 + k * (ax1 - ax0) / 8, (ay0 + ay1) / 2, H + 0.5, DARK)
    M.box(ax1 - ax0 + 0.3, ay1 - ay0 + 0.3, 0.14, x0, (ay0 + ay1) / 2, H + 1.8, DARK)
    M.hip_roof(ax0, ay0, ax1, ay1, H + 1.94, 2.6, mat('#4E9CCF', 0.28, spec=0.22, name='mallglass'))
    for k in range(1, 8):    # roof ribs, front slope
        t = k / 8; x = ax0 + (ax1 - ax0) * t
        top_x = min(max(x, ax0 + 3.5), ax1 - 3.5)
        a = Vector((x, ay0, H + 1.94)); bpt = Vector((top_x, (ay0 + ay1) / 2, H + 4.54))
        d = bpt - a; mid = (a + bpt) / 2
        r = bmesh.ops.create_cube(M.bm, size=1.0, matrix=Matrix.Translation(mid) @ d.to_track_quat('Y', 'Z').to_matrix().to_4x4() @ Matrix.Diagonal((0.1, d.length, 0.1, 1)))
        M._fin(r['verts'], DARK)
    # the grand entrance: glass doors, a canopy, a big sign with the paw
    M.box(6.4, 0.3, 3.2, x0, y0 - 0.1, 0.5, DARK)
    M.box(6.0, 0.2, 2.9, x0, y0 - 0.2, 0.55, GLASS_W)
    for k in range(5): M.box(0.1, 0.25, 2.9, x0 - 3.0 + k * 1.5, y0 - 0.25, 0.55, DARK)
    M.box(8.0, 2.2, 0.25, x0, y0 - 1.0, 3.75, WALL2, bevel=0.06)
    M.box(7.0, 0.4, 2.1, x0, y0 - 0.2, 4.4, TRIM, bevel=0.08)
    paw_sign(M, x0, y0 - 0.5, 5.45, 0.9, back=mat('#FFF2D6'), disc=TRIM)
    # shop windows either side with little coloured awnings
    for k, sx in enumerate((-7.2, -4.6, 4.6, 7.2)):
        window(M, x0 + sx, y0, 0.9, 2.0, 2.3, GLASS_W, sill=False, frame=DARK)
        striped_awning(M, x0 + sx, y0 - 0.05, 3.55, 2.3, 1.1, math.radians(26), [CORAL, mat('#3FB3A5'), mat('#FFC43D'), CORAL][k], WHITE, n=4)
        window(M, x0 + sx, y0, 4.9, 1.8, 1.5, GLASS_B, sill=False, frame=WALL2)
    for k, sy in enumerate((2.5, 6.5, 10.5)):
        window(M, x0 - W / 2, y0 + sy, 1.0, 2.4, 2.2, GLASS_W, face=-math.pi / 2, sill=False, frame=DARK)
        window(M, x0 - W / 2, y0 + sy, 4.9, 2.0, 1.5, GLASS_B, face=-math.pi / 2, sill=False, frame=WALL2)
    # rooftop units and a few planters
    for (ux, uy) in ((6.5, 2.0), (7.2, 11.0), (-7.0, 11.2)):
        M.box(1.6, 1.2, 0.9, x0 + ux, y0 + uy, H + 0.5, METAL, bevel=0.06)
    # the plaza in front: pavers, trees in square planters, benches
    M.box(W + 2.0, 5.0, 0.06, x0, y0 - 2.5, 0.2, PAVER)
    for k, px in enumerate((-8.5, -5.0, 5.0, 8.5)):
        M.box(1.6, 1.6, 0.5, x0 + px, y0 - 3.0, 0.2, mat('#E3CFB0'), bevel=0.06)
        M.box(1.4, 1.4, 0.05, x0 + px, y0 - 3.0, 0.7, GRASS_D)
    ob = M.done()
    for px in (-8.5, -5.0, 5.0, 8.5): tree(x0 + px, y0 - 3.0, 0.75)
    occ_box(x0 - W / 2, y0, x0 + W / 2, y0 + D, H + 1.0)
    return ob

# ---- the Beach Café: a deck on the sand with a big red-and-white awning ---------------------------------
def beach_cafe(t, d):
    """built facing local -x, then turned to face down the beach, toward the camera; returns its matrix"""
    M = Mesh('beachcafe')
    cx = cy = 0.0
    DW, DD = 11.0, 13.0                         # deck: across (along the shore) x long (sand to sea)
    x0, y0 = cx - DW / 2, cy - DD / 2
    deck_z = 0.75
    for k in range(int(DW / 0.55)):             # planks run from the promenade toward the sea
        M.box(0.52, DD, 0.16, x0 + 0.28 + k * 0.55, cy, deck_z - 0.16, WOOD_L if k % 2 else mat('#BE8753'))
    for px in (x0 + 0.3, cx, x0 + DW - 0.3):
        for py in (y0 + 0.3, cy, y0 + DD - 0.3): M.box(0.3, 0.3, 1.2, px, py, -0.45, WOOD_D)
    # railings along the sea side, the promenade side and the back
    for (ax, ay, bx, by) in ((x0 + DW, y0, x0 + DW, y0 + DD), (x0, y0, x0 + DW, y0), (x0, y0 + DD, x0 + DW, y0 + DD)):
        L = math.hypot(bx - ax, by - ay); n = int(L / 1.1)
        for k in range(n + 1):
            q = k / n; M.box(0.12, 0.12, 0.9, ax + (bx - ax) * q, ay + (by - ay) * q, deck_z, WHITE)
        M.box(abs(bx - ax) + 0.14 if bx != ax else 0.14, abs(by - ay) + 0.14 if by != ay else 0.14, 0.1, (ax + bx) / 2, (ay + by) / 2, deck_z + 0.9, WHITE)
    # steps down to the sand at the front
    for k in range(3): M.box(0.5, 3.2, 0.25, x0 - 0.25 - k * 0.5, cy + 2.0, deck_z - 0.25 * (k + 1), WOOD)
    # the kiosk at the back of the deck
    kx = x0 + DW - 3.2
    TEAL = mat('#3DB5B0'); PLANK = mat('#FFF6E8')
    M.box(4.6, 8.4, 3.2, kx + 0.6, cy, deck_z, PLANK, bevel=0.05)
    for k in range(9): M.box(0.05, 8.42, 0.06, kx - 1.7, cy, deck_z + 0.3 + k * 0.33, mat('#EFE3CF'))
    M.box(5.0, 9.0, 0.3, kx + 0.6, cy, deck_z + 3.2, TEAL, bevel=0.05)
    M.box(0.3, 6.0, 1.4, kx - 1.72, cy, deck_z + 1.1, GLASS_W)
    M.box(1.0, 6.4, 0.18, kx - 2.0, cy, deck_z + 1.0, WOOD)            # serving counter
    M.box(0.9, 6.4, 1.0, kx - 2.0, cy, deck_z, mat('#E9DCC6'))
    striped_awning(M, kx - 1.75, cy, deck_z + 3.4, 9.4, 3.6, math.radians(16), CORAL, WHITE, n=12, face=-math.pi / 2)
    for k in (-1, 1): M.cyl(0.08, 0.08, 2.5, kx - 1.75 - 3.45, cy + k * 4.4, deck_z, WHITE, seg=6)
    M.box(0.25, 4.0, 1.1, kx - 1.8, cy, deck_z + 3.5, WHITE, bevel=0.06)
    paw_sign(M, kx - 1.95, cy, deck_z + 4.05, 1.15, face=-math.pi / 2, back=CORAL, disc=mat('#FFF2D6'))
    # tables with striped parasols on the open deck
    for (tx, ty) in ((x0 + 1.9, y0 + 2.4), (x0 + 1.9, y0 + DD - 2.4), (x0 + 4.6, y0 + 3.6), (x0 + 4.6, y0 + DD - 3.6)):
        M.cyl(0.05, 0.05, 0.85, tx, ty, deck_z, DARK, seg=6); M.cyl(0.5, 0.5, 0.07, tx, ty, deck_z + 0.82, WHITE, seg=16)
        for a in (0, math.pi):
            M.box(0.5, 0.5, 0.08, tx, ty + math.cos(a) * 0.9, deck_z + 0.42, CORAL)
            M.box(0.5, 0.08, 0.5, tx, ty + math.cos(a) * 1.13, deck_z + 0.5, CORAL)
        M.cyl(0.05, 0.05, 2.4, tx, ty, deck_z, WHITE, seg=6)
        fs = M.cyl(1.35, 0.06, 0.55, tx, ty, deck_z + 2.0, CORAL, seg=12, smooth=False)
        side = sorted([f for f in fs if abs(f.normal.z) < 0.99], key=lambda f: math.atan2(f.calc_center_median().y - ty, f.calc_center_median().x - tx))
        for k, f in enumerate(side): f.material_index = M._mi(CORAL if k % 2 == 0 else WHITE)
    # surfboards leaning on the kiosk, a lifebuoy, potted plants
    for k, c in enumerate(('#FFC43D', '#3FB3A5', '#F06A55')):
        M.sph(1.0, kx - 1.5, cy + 5.0 + k * 0.55, deck_z + 1.1, mat(c, 0.4), s=(0.12, 0.3, 1.1), seg=10, rings=8, rx=-0.25)
    M.cyl(0.5, 0.5, 0.14, kx - 1.85, cy - 3.4, deck_z + 1.9, CORAL, seg=16, ry=math.pi / 2)
    for (px, py) in ((x0 + 0.6, y0 + 0.6), (x0 + 0.6, y0 + DD - 0.6)):
        M.cyl(0.35, 0.3, 0.55, px, py, deck_z, POT, seg=10); M.ico(0.5, px, py, deck_z + 0.95, LEAF[2], sub=1, jitter=0.2)
    Rw = Matrix.Translation(Vector(at(t, d))) @ Matrix.Rotation(math.pi / 4, 4, 'Z') @ Matrix.Scale(1.2, 4)
    M.done(xf=Rw)
    k = Rw @ Vector((kx + 0.6, cy, 0)); OCC.box(4.6, 8.4, deck_z + 3.7, k.x, k.y, 0.0, WHITE, rz=math.pi / 4)
    for (px, py) in ((x0 - 1.8, y0 + DD - 1.2), (x0 + DW + 1.3, cy - 0.6), (x0 + DW + 1.3, cy + 4.4)):
        w = Rw @ Vector((px, py, 0)); palm(w.x, w.y, 1.0)
    return Rw

def beach_life():
    """umbrellas and towels on the sand, rocks at the waterline, a lifeguard tower"""
    M = Mesh('beachlife')
    cols = [('#F06A55', '#FFFFFF'), ('#3FB3A5', '#FFFFFF'), ('#FFC43D', '#F06A55'), ('#6C8FE0', '#FFFFFF')]
    for k, t in enumerate((-58, -46, -30, 18, 30, 44, 58)):
        d = dshore(t) - 8.0 + (k % 2) * 1.6
        x, y, _ = at(t, d)
        a, b = cols[k % 4]
        z = sand_z(t, d)
        M.cyl(0.05, 0.05, 2.4, x, y, z - 0.1, WHITE, seg=6)
        fs = M.cyl(1.4, 0.06, 0.5, x, y, z + 1.9, mat(a), seg=12, smooth=False)
        side = sorted([f for f in fs if abs(f.normal.z) < 0.99], key=lambda f: math.atan2(f.calc_center_median().y - y, f.calc_center_median().x - x))
        for i, f in enumerate(side): f.material_index = M._mi(mat(a) if i % 2 == 0 else mat(b))
        tx, ty, _ = at(t + 1.6, d + 0.4)
        M.box(1.0, 2.0, 0.04, tx, ty, sand_z(t + 1.6, d + 0.4) + 0.01, mat(cols[(k + 1) % 4][0]), rz=math.pi / 4 + 0.2)
    for k in range(18):
        t = -120 + k * 14 + rnd.uniform(-4, 4); d = dshore(t) + rnd.uniform(-0.4, 1.6)
        x, y, _ = at(t, d)
        M.ico(rnd.uniform(0.5, 1.1), x, y, SEA_Z + 0.05, mat('#A9A39A'), sub=1, jitter=0.25, s=(1.3, 1, 0.7))
    # lifeguard tower
    tt = -38.0; x, y, _ = at(tt, dshore(tt) - 5.0); z = sand_z(tt, dshore(tt) - 5.0)
    for sx in (-0.7, 0.7):
        for sy in (-0.7, 0.7): M.box(0.14, 0.14, 2.5, x + sx, y + sy, z - 0.1, WHITE)
    M.box(1.8, 1.8, 0.14, x, y, z + 2.4, WOOD_L); M.box(1.8, 1.8, 1.0, x, y, z + 2.54, mat('#F06A55'))
    M.hip_roof(x - 1.2, y - 1.2, x + 1.2, y + 1.2, z + 3.6, 0.8, WHITE)
    M.done()

# ---- the park: a fountain, a ring path, lawns, benches and a little dog run ------------------------------
def park(cx, cy):
    M = Mesh('park')
    M.prism(rrect(cx, cy, 2 * SIDE, 2 * SIDE, 1.4), 0.2, 0.26, GRASS_L)
    # ring path + four diagonal spokes
    n = 48
    for k in range(n):
        a0, a1 = k / n * 2 * math.pi, (k + 1) / n * 2 * math.pi
        pts = [(cx + 4.4 * math.cos(a0), cy + 4.4 * math.sin(a0)), (cx + 6.2 * math.cos(a0), cy + 6.2 * math.sin(a0)),
               (cx + 6.2 * math.cos(a1), cy + 6.2 * math.sin(a1)), (cx + 4.4 * math.cos(a1), cy + 4.4 * math.sin(a1))]
        M.prism(pts, 0.26, 0.29, PATH)
    for a in (45, 135, 225, 315):
        r = math.radians(a); L = SIDE * 1.41 - 6.0
        mx, my = cx + math.cos(r) * (6.0 + L / 2), cy + math.sin(r) * (6.0 + L / 2)
        M.box(L + 0.6, 1.9, 0.03, mx, my, 0.26, PATH, rz=r)
    # fountain
    M.cyl(2.5, 2.5, 0.55, cx, cy, 0.26, STONE, seg=28, bevel=0.06)
    M.cyl(2.15, 2.15, 0.05, cx, cy, 0.72, FOUNTAIN_W, seg=28)
    M.cyl(0.35, 0.3, 1.3, cx, cy, 0.7, STONE, seg=12)
    M.cyl(1.0, 0.5, 0.3, cx, cy, 1.9, STONE, seg=16)
    M.cyl(0.85, 0.85, 0.04, cx, cy, 2.18, FOUNTAIN_W, seg=16)
    M.cyl(0.12, 0.05, 0.9, cx, cy, 2.2, mat('#E8FAFF', 0.1, emit=0.3, name='spout'), seg=8)
    # benches facing the fountain
    for a in (0, 90, 180, 270):
        r = math.radians(a); bx, by = cx + math.cos(r) * 7.0, cy + math.sin(r) * 7.0
        M.box(0.6, 2.0, 0.1, bx, by, 0.72, WOOD, rz=r); M.box(0.1, 2.0, 0.6, bx + math.cos(r) * 0.3, by + math.sin(r) * 0.3, 0.8, WOOD, rz=r)
        for s in (-0.8, 0.8):
            M.box(0.5, 0.1, 0.46, bx - math.sin(r) * s, by + math.cos(r) * s, 0.26, DARK, rz=r)
    # hedges round the edge, open where the paths come in
    e = SIDE - 0.6
    for side in range(4):
        for k in range(-2, 3):
            if k == 0: continue
            o = k * 3.6
            x, y, rz = [(cx + o, cy - e, 0), (cx + o, cy + e, 0), (cx - e, cy + o, math.pi / 2), (cx + e, cy + o, math.pi / 2)][side]
            M.box(3.0, 0.9, 0.8, x, y, 0.26, HEDGE, rz=rz, bevel=0.2)
    # flower beds
    for (fx, fy) in ((-4.8, 0), (4.8, 0), (0, 4.8), (0, -4.8)):
        pass
    for k, a in enumerate((20, 70, 110, 160, 200, 250, 290, 340)):
        r = math.radians(a); fx, fy = cx + math.cos(r) * 3.4, cy + math.sin(r) * 3.4
        M.cyl(0.7, 0.7, 0.12, fx, fy, 0.26, mat('#7A5638'), seg=12)
        for q in range(5):
            M.ico(0.17, fx + math.cos(q * 1.3) * 0.4, fy + math.sin(q * 1.3) * 0.4, 0.48, FLOWERS[(k + q) % 5], sub=1)
    # the dog run in the south-west quadrant: a low fence, hurdles and a tunnel
    dx, dy = cx - 6.0, cy - 6.3
    M.box(0.5, 0.2, 0.5, dx - 1.5, dy + 1.5, 0.26, mat('#F06A55'))
    for k in range(3):
        hx, hy = dx - 1.2 + k * 1.3, dy - 0.8 + k * 0.9
        for s in (-0.5, 0.5): M.cyl(0.06, 0.06, 0.7, hx + s * 0.7, hy - s * 0.7, 0.26, WHITE, seg=6)
        M.box(1.0, 0.08, 0.08, hx, hy, 0.7, mat('#F06A55'), rz=-math.pi / 4)
    M.done()
    for (tx, ty) in ((-8.2, 3.5), (-8.2, -2.8), (8.2, 3.2), (8.0, -3.2), (3.0, 8.3), (-3.2, 8.2), (3.3, -8.3), (-8.6, 8.4), (8.6, 8.4), (8.6, -8.5)):
        tree(cx + tx, cy + ty, 1.05)
    for (lx, ly) in ((-4.4, -4.4), (4.4, 4.4), (-4.4, 4.4), (4.4, -4.4)): lamp(cx + lx * 1.12, cy + ly * 1.12)
    street_trees(cx, cy)

# ---- build the town ----------------------------------------------------------------------------
SITES, PATIOS = {}, {}
for (i, j), kind in BLOCKS.items():
    cx, cy = P * i, P * j
    if kind == 'houses': houses(cx, cy)
    elif kind == 'shops': shops(cx, cy, tall=(j >= 2))
    elif kind == 'green': green_block(cx, cy)
    elif kind == 'park': park(cx, cy)
    elif kind == 'town':
        # the Town Café takes the corner facing the park; small shops fill the rest of the block
        yard(cx, cy, PAVER_D, 0.22)
        fx, fy = cx - 3.4, cy - 5.6
        town_cafe(fx, fy)
        SITES['town'] = (fx, fy + 4.5, 12.8)
        PATIOS['town'] = [(fx - 2.2, fy - 1.3, 0.26), (fx + 2.1, fy - 1.1, 0.26), (fx - 0.3, fy - 3.4, 0.26)]
        for a, b, x, y, rz, ok in lots(cx, cy):
            if (a < 2 and b < 2) or not ok: continue
            place(ken_variant('suburban', 'building-type-' + 'cfhkm'[(a + b * 2) % 5], SUB_MATS[(a + b * 3) % 8]), x, y, rz, 4.5, 0.2)
        tree(cx + 6.6, cy - 6.6, 1.0)
        street_trees(cx, cy, skip=('s',))
    elif kind == 'mall':
        mall(cx, cy - 6.0)
        SITES['mall'] = (cx, cy + 0.5, 15.0)
        PATIOS['mall'] = [(cx - 3.0, cy - 8.6, 0.26), (cx + 3.2, cy - 9.2, 0.26), (cx - 6.5, cy - 10.0, 0.26)]
        street_trees(cx, cy, skip=('s',))
# the promenade: lamps and palms in turn, then the Beach Café on the sand
t, k = T0, 0
while t < T1:
    x, y, _ = at(t, 1.0)
    if visible(x - 3, y - 3, x + 3, y + 3, 6) and not (BEACH_T - 9 < t < BEACH_T - 2):
        (lamp if k % 2 == 0 else palm)(x, y)
    t += 7.0; k += 1
BW = beach_cafe(BEACH_T, BEACH_D)
SITES['beach'] = tuple(BW @ Vector((1.5, 0.0, 7.6)))
PATIOS['beach'] = [tuple(BW @ Vector(p)) for p in ((-3.6, -1.0, 0.76), (-1.2, 2.6, 0.76), (-7.0, 2.0, 0.2))]
beach_life()

# ---- parked cars (static) ---------------------------------------------------------------------------
CAR_KINDS = ['car_sedan', 'car_hatchback', 'car_stationwagon', 'car_taxi']
for k in range(30):
    i, j = rnd.choice(list(BLOCKS.keys()))
    if BLOCKS[(i, j)] in ('park',): continue
    cx, cy = P * i, P * j
    side = rnd.randrange(4); o = rnd.uniform(-8, 8)
    e = BLOCK / 2 + 0.9
    x, y, rz = [(cx + o, cy - e, math.pi / 2), (cx + o, cy + e, -math.pi / 2), (cx - e, cy + o, 0.0), (cx + e, cy + o, math.pi)][side]
    if abs(o) < 2 or LAND(x, y) > -1.0: continue
    place(kk(CAR_KINDS[k % 4]), x, y, rz, 3.3, 0.0, occ=False, name='parked')

# ---- light, sky, camera ----------------------------------------------------------------------------
world = bpy.data.worlds.new('sky'); SC.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (*lin('#CFE7F6'), 1); bg.inputs['Strength'].default_value = 0.9
sun_d = bpy.data.lights.new('sun', 'SUN'); sun_d.energy = 3.6; sun_d.angle = math.radians(4)
sun_d.color = lin('#FFF0DA')
sun = bpy.data.objects.new('sun', sun_d); SC.collection.objects.link(sun)
sun.rotation_euler = Vector((0.45, -0.5, -0.74)).to_track_quat('-Z', 'Y').to_euler()

cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = FRAME_W
cam_d.clip_start, cam_d.clip_end = 1.0, 400.0
cam = bpy.data.objects.new('cam', cam_d); SC.collection.objects.link(cam)
cam.location = TARGET - FWD * 180.0
cam.rotation_euler = (math.pi / 2 - ELEV, 0.0, YAW)
SC.camera = cam

# ---- exports: occluders and the layout the game needs -------------------------------------------------
def t3(p): return [round(p[0], 3), round(p[2], 3), round(-p[1], 3)]
occ_ob = OCC.done(collection=C_OCC)
bpy.ops.object.select_all(action='DESELECT')
C_OCC.hide_viewport = False; C_OCC.hide_render = False
occ_ob.select_set(True); bpy.context.view_layer.objects.active = occ_ob
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT_DIR, 'occluders.glb'), export_format='GLB', use_selection=True,
                          export_materials='NONE', export_normals=False, export_texcoords=False, export_yup=True)
C_OCC.hide_render = True
bpy.context.view_layer.update()
cm = cam.matrix_world
fwd, up = (cm.to_3x3() @ Vector((0, 0, -1))).normalized(), (cm.to_3x3() @ Vector((0, 1, 0))).normalized()
lanes = []
def lane_ok(pts): return all(LAND(x, y) < -3.0 for x, y, _ in pts)
for (i0, j0, i1, j1) in ((-1, -1, 0, 0), (-1, 0, 0, 1), (-2, -1, -1, 1), (-1, 1, 1, 2), (-2, -3, -1, -1), (0, 1, 1, 2)):
    x0, y0, x1, y1 = P * i0 - P / 2, P * j0 - P / 2, P * i1 + P / 2, P * j1 + P / 2
    o = 1.5      # right-hand traffic going round anticlockwise: the lane just outside the centre line
    loop = [(x0 - o, y0 - o, 0.0), (x1 + o, y0 - o, 0.0), (x1 + o, y1 + o, 0.0), (x0 - o, y1 + o, 0.0)]
    if lane_ok(loop): lanes.append([t3(p) for p in loop])
coast_lanes = [[t3(at(-110, -CROAD / 2 - 1.8)), t3(at(110, -CROAD / 2 - 1.8))], [t3(at(110, -CROAD / 2 + 1.2)), t3(at(-110, -CROAD / 2 + 1.2))]]
walks = []
for (i, j) in ((0, 0), (-1, 1), (1, 1), (-1, 0), (0, 1), (-1, -1), (-2, 0), (0, -1)):
    cx, cy = P * i, P * j; e = BLOCK / 2 - 1.1
    loop = [(cx - e, cy - e, 0.2), (cx + e, cy - e, 0.2), (cx + e, cy + e, 0.2), (cx - e, cy + e, 0.2)]
    if (i, j) in BLOCKS and all(LAND(x, y) < -0.5 for x, y, _ in loop): walks.append([t3(p) for p in loop])
layout = {
    'camera': {'pos': t3(cam.location), 'fwd': [round(fwd.x, 5), round(fwd.z, 5), round(-fwd.y, 5)], 'up': [round(up.x, 5), round(up.z, 5), round(-up.y, 5)],
               'halfW': FRAME_W / 2, 'halfH': FRAME_H / 2, 'near': cam_d.clip_start, 'far': cam_d.clip_end},
    'image': [IMG_W, IMG_H],
    'sites': {k: t3(v) for k, v in SITES.items()},
    'patios': {k: [t3(p) for p in v] for k, v in PATIOS.items()},
    'lanes': lanes, 'coast': coast_lanes, 'walks': walks,
    'promenade': [t3(at(-90, 2.0, 0.22)), t3(at(90, 2.0, 0.22))],
    'beach': [t3(at(-60, dshore(-60) - 9, 0.2)), t3(at(60, dshore(60) - 9, 0.2))],
    'park': {'centre': t3((0, 0, 0.26)), 'ring': 5.3, 'dogrun': t3((-6.0, -6.3, 0.26))},
    'sea': {'boat': [t3(at(-50, 48, SEA_Z)), t3(at(70, 44, SEA_Z))], 'z': SEA_Z, 'shore': 19.0,
            'along': [round(U.x, 4), 0, round(-U.y, 4)], 'out': [round(N.x, 4), 0, round(-N.y, 4)], 'origin': t3(at(0, 0))},
    'sun': [-0.45, 0.74, -0.5],
}
with open(os.path.join(OUT_DIR, 'city.json'), 'w') as f: json.dump(layout, f, indent=1)
print('LAYOUT written; blocks', len(BLOCKS), 'objects', len(C_CITY.objects))

# ---- render -------------------------------------------------------------------------------------
if MODE in ('preview', 'final'):
    SC.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
        for d in prefs.devices: d.use = d.type == 'OPTIX'
        SC.cycles.device = 'GPU'
    except Exception as e:
        print('GPU unavailable', e)
    SC.cycles.samples = 48 if MODE == 'preview' else 160
    SC.cycles.use_denoising = True
    SC.cycles.max_bounces = 6; SC.cycles.diffuse_bounces = 3; SC.cycles.glossy_bounces = 2; SC.cycles.transmission_bounces = 6
    SC.render.resolution_x, SC.render.resolution_y = IMG_W, IMG_H
    SC.render.resolution_percentage = 38 if MODE == 'preview' else 100
    try:
        SC.view_settings.view_transform = VIEW; SC.view_settings.look = LOOK
    except Exception as e:
        print('look', e)
    SC.view_settings.exposure = EXPO
    SC.render.image_settings.file_format = 'PNG'
    SC.render.filepath = os.path.join(OUT_DIR, 'city_preview.png' if MODE == 'preview' else 'city.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', SC.render.filepath)
