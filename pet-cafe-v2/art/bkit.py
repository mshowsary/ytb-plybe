# art/bkit.py — shared Blender helpers for the Pet Café art scripts (build_beach.py, build_town.py).
# Every model is coloured by pointing its UVs at swatches of one shared palette texture.
import bpy, math, os
from mathutils import Vector
OUT = '.'
MAT = None
def setup(out):
    # the caller clears the scene first (read_factory_settings resets Python module state)
    global OUT, MAT
    OUT = out; os.makedirs(OUT, exist_ok=True)
    MAT = make_palette()
    return MAT

# ---- the palette: a Mediterranean beach café -------------------------------------------------
PAL = [
    'FAF7F0', '2E4A78', '22385E', 'EE7F5F', 'C9644A', 'EAD7B0', 'C8A57E', '9C7A55',   # 0-7
    '8C6A48', '6E5238', '4F9E5A', '3A7D46', '6FB7B0', 'F2C76B', 'B8C2C8', '2B2B2B',   # 8-15
    'E6D2A6', '6A4A2E', 'CFE9F0', 'D85C4A', 'F4EFE6', 'A9C9E8', 'F6B8A6', '7FB069',   # 16-23
    'FFFFFF', 'DDE3E6', 'E9B872', '5B8FB9', '4A6B40', 'BFA070', 'F0DDB8', '333A40',   # 24-31
]
WHITE, NAVY, NAVY_D, CORAL, CORAL_D, SAND, WOOD, WOOD_D = range(8)
TRUNK, TRUNK_D, LEAF, LEAF_D, TEAL, YELLOW, METAL, BLACK = range(8, 16)
ROPE, COCONUT, GLASS, RED, CREAM, SKY, PEACH, LIME = range(16, 24)
PURE, LIGHTGREY, HONEY, BLUE, OLIVE, THATCH, THATCH_L, CHARCOAL = range(24, 32)
PW, PH, CELL = 8, 4, 8

def hexrgb(h):
    # a byte PNG in the sRGB colour space stores the hex values as they are: no linear conversion
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]

def make_palette():
    img = bpy.data.images.new('palette', PW * CELL, PH * CELL, alpha=False)
    px = [0.0] * (PW * CELL * PH * CELL * 4)
    for i, h in enumerate(PAL):
        col, row = i % PW, i // PW
        r, g, b = hexrgb(h)
        for y in range(row * CELL, row * CELL + CELL):
            for x in range(col * CELL, col * CELL + CELL):
                k = (y * PW * CELL + x) * 4
                px[k:k + 4] = [r, g, b, 1.0]
    img.pixels = px
    img.filepath_raw = os.path.join(OUT, 'palette.png'); img.file_format = 'PNG'; img.save()
    mat = bpy.data.materials.new('beach_palette'); mat.use_nodes = True
    nt = mat.node_tree; bsdf = nt.nodes.get('Principled BSDF')
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.interpolation = 'Closest'
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 1.0
    return mat

def uv_of(i):
    col, row = i % PW, i // PW
    return ((col + 0.5) / PW, (row + 0.5) / PH)

def paint(obj, color, fn=None):
    """Colour every face (or per face with fn(face_centre_local) -> palette index)."""
    me = obj.data
    if not me.uv_layers: me.uv_layers.new()
    uv = me.uv_layers.active.data
    for p in me.polygons:
        c = fn(p.center) if fn else color
        u = uv_of(c)
        for li in p.loop_indices: uv[li].uv = u
    return obj

def active(): return bpy.context.view_layer.objects.active

def finish(obj, color, bevel=0.0, smooth=False, fn=None, seg=2):
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if bevel > 0:
        m = obj.modifiers.new('bev', 'BEVEL'); m.width = bevel; m.segments = seg; m.limit_method = 'ANGLE'
        bpy.ops.object.modifier_apply(modifier=m.name)
    if smooth:
        try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
        except Exception: bpy.ops.object.shade_smooth()
    else:
        bpy.ops.object.shade_flat()
    return paint(obj, color, fn)

def box(sx, sy, sz, x=0, y=0, z=0, color=WHITE, bevel=0.0, rot=(0, 0, 0), fn=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z), rotation=rot)
    o = active(); o.scale = (sx, sy, sz)
    return finish(o, color, bevel, False, fn)

def cyl(r1, r2, h, x=0, y=0, z=0, color=WHITE, verts=16, rot=(0, 0, 0), smooth=True, bevel=0.0, fn=None):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=h, location=(x, y, z), rotation=rot)
    return finish(active(), color, bevel, smooth, fn)

def sph(r, x=0, y=0, z=0, color=WHITE, sx=1, sy=1, sz=1, seg=16, rings=10, fn=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=(x, y, z))
    o = active(); o.scale = (sx, sy, sz)
    return finish(o, color, 0, True, fn)

def torus(R, r, x=0, y=0, z=0, color=WHITE, rot=(0, 0, 0), fn=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=24, minor_segments=8, location=(x, y, z), rotation=rot)
    return finish(active(), color, 0, True, fn)

def mesh_obj(name, verts, faces, color, smooth=True):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    return finish(o, color, 0, smooth)

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = active(); o.name = name
    o.data.materials.clear(); o.data.materials.append(MAT)
    return o

def export(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, o.name + '.gltf'), export_format='GLTF_SEPARATE',
                              use_selection=True, export_apply=True, export_yup=True, export_texcoords=True,
                              export_normals=True, export_materials='EXPORT', export_animations=False)

