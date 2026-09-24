# art/build_town.py — the town café's pet playground and street greenery, modelled in Blender.
#
# Run:  blender -b --factory-startup --python art/build_town.py -- <out_dir>
#
# Uses the same palette helpers as build_beach.py (art/bkit.py): one shared palette texture, faces
# coloured by UV swatch, so the whole set is one material and one draw call in the game.
import bpy, math, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_DIR = argv[0] if argv else os.path.join(os.path.dirname(__file__), '..', 'public', 'models', 'town')

bpy.ops.wm.read_factory_settings(use_empty=True)
import bkit
from bkit import *
bkit.setup(OUT_DIR)

def cat_tree(name):
    """A cat tree: a carpeted base, sisal posts, three platforms, a hideaway box and a dangling toy."""
    P = [box(1.0, 0.8, 0.1, 0, 0, 0.05, SKY, 0.03)]
    for (x, y, h) in [(-0.3, 0.1, 1.0), (0.28, -0.12, 1.55), (0.0, 0.2, 0.55)]:
        P.append(cyl(0.07, 0.07, h, x, y, 0.1 + h / 2, ROPE, 12))
        for k in range(int(h / 0.2)): P.append(cyl(0.075, 0.075, 0.02, x, y, 0.2 + k * 0.2, THATCH, 8, smooth=False))   # the sisal wraps
    P.append(box(0.5, 0.45, 0.07, -0.3, 0.05, 1.12, SKY, 0.025))
    P.append(cyl(0.3, 0.3, 0.07, 0.28, -0.12, 1.68, PEACH, 20, bevel=0.02))
    P.append(torus(0.26, 0.05, 0.28, -0.12, 1.73, PEACH))
    # the hideaway: a box with a round door
    P.append(box(0.5, 0.45, 0.4, 0.0, 0.2, 0.75, SKY, 0.03))
    P.append(cyl(0.12, 0.12, 0.02, 0.0, -0.035, 0.73, NAVY_D, 16, rot=(math.pi / 2, 0, 0)))
    # a toy mouse on a string
    P.append(cyl(0.004, 0.004, 0.4, -0.52, 0.05, 0.93, WHITE, 4))
    P.append(sph(0.05, -0.52, 0.05, 0.72, LIGHTGREY, sx=1.4, seg=10, rings=6))
    P.append(sph(0.02, -0.57, 0.05, 0.76, PEACH, seg=6, rings=4)); P.append(sph(0.02, -0.47, 0.05, 0.76, PEACH, seg=6, rings=4))
    return join(P, name)

def pet_bed(name, rim, cushion):
    """A round pet bed: a plump rim and a soft cushion. 0.8 across."""
    return join([cyl(0.38, 0.4, 0.08, 0, 0, 0.04, rim, 24, bevel=0.02), torus(0.33, 0.09, 0, 0, 0.13, rim),
                 cyl(0.3, 0.3, 0.08, 0, 0, 0.1, cushion, 24, bevel=0.03)], name)

def dog_house(name):
    """A kennel: wooden walls, a pitched red roof, a round door and a bone-shaped name plate."""
    P = [box(1.0, 1.1, 0.75, 0, 0, 0.375, WOOD, 0.02)]
    for k in range(5): P.append(box(1.02, 1.12, 0.012, 0, 0, 0.1 + k * 0.14, WOOD_D))
    P.append(cyl(0.6, 0.6, 0.02, 0, 0, 0.75, WOOD, 3, rot=(0, math.pi / 2, 0), smooth=False))
    P.append(box(0.62, 1.25, 0.05, -0.27, 0, 1.0, CORAL, 0.015, rot=(0, math.radians(-40), 0)))
    P.append(box(0.62, 1.25, 0.05, 0.27, 0, 1.0, CORAL, 0.015, rot=(0, math.radians(40), 0)))
    P.append(box(0.06, 1.28, 0.06, 0, 0, 1.2, CORAL_D))
    P.append(cyl(0.23, 0.23, 0.02, 0, -0.555, 0.32, CHARCOAL, 20, rot=(math.pi / 2, 0, 0)))
    P.append(box(0.46, 0.02, 0.23, 0, -0.556, 0.15, CHARCOAL))
    P.append(box(0.24, 0.02, 0.07, 0, -0.56, 0.62, WHITE, 0.01))
    for sx in (-0.12, 0.12): P.append(sph(0.045, sx, -0.56, 0.62, WHITE, seg=8, rings=5))
    return join(P, name)

def bowls(name):
    """Two pet bowls on a paw-print mat: water and kibble."""
    P = [box(0.8, 0.45, 0.02, 0, 0, 0.01, CORAL, 0.01)]
    for x, fill in ((-0.18, SKY), (0.18, HONEY)):
        P.append(cyl(0.15, 0.11, 0.09, x, 0, 0.065, WHITE, 18, bevel=0.01))
        P.append(cyl(0.12, 0.12, 0.01, x, 0, 0.1, fill, 18))
        if fill == HONEY:
            for k in range(6): P.append(sph(0.025, x + math.cos(k) * 0.06, math.sin(k) * 0.06, 0.11, WOOD_D, seg=6, rings=4))
    return join(P, name)

def toys(name):
    """A ball and a bone on the grass."""
    return join([sph(0.12, 0, 0, 0.12, YELLOW, seg=14, rings=8, fn=lambda c: WHITE if abs(c.z - 0.12) < 0.025 else YELLOW),
                 box(0.2, 0.05, 0.05, 0.4, 0.1, 0.03, CREAM, 0.02),
                 sph(0.04, 0.3, 0.07, 0.03, CREAM, seg=8, rings=5), sph(0.04, 0.3, 0.13, 0.03, CREAM, seg=8, rings=5),
                 sph(0.04, 0.5, 0.07, 0.03, CREAM, seg=8, rings=5), sph(0.04, 0.5, 0.13, 0.03, CREAM, seg=8, rings=5)], name)

def picket(name, length=2.0):
    """A white picket fence segment along X, `length` long."""
    P = [box(length, 0.05, 0.07, 0, 0, 0.55, WHITE), box(length, 0.05, 0.07, 0, 0, 0.25, WHITE)]
    n = int(length / 0.18)
    for k in range(n + 1):
        x = -length / 2 + k * length / n
        P.append(box(0.09, 0.04, 0.7, x, 0.03, 0.35, WHITE))
        P.append(cyl(0.064, 0.0, 0.09, x, 0.03, 0.74, WHITE, 4, rot=(0, 0, math.pi / 4), smooth=False))
    return join(P, name)

def tree(name, s=1.0, seed=0):
    """A round, full tree: a trunk and a cluster of faceted canopy balls in three greens."""
    P = [cyl(0.12 * s, 0.18 * s, 1.5 * s, 0, 0, 0.75 * s, TRUNK, 8)]
    for k in range(3):
        a = k * 2.1 + seed
        P.append(cyl(0.05 * s, 0.07 * s, 0.5 * s, math.cos(a) * 0.15 * s, math.sin(a) * 0.15 * s, 1.35 * s, TRUNK_D, 6, rot=(math.sin(a) * 0.6, math.cos(a) * 0.6, 0)))
    balls = [(0, 0, 2.05, 0.95), (0.55, 0.2, 1.8, 0.7), (-0.5, -0.15, 1.85, 0.72), (0.1, -0.35, 2.5, 0.62), (-0.2, 0.45, 1.65, 0.6), (0.3, 0.4, 2.35, 0.5)]
    for i, (x, y, z, r) in enumerate(balls):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r * s, location=(x * s, y * s, z * s))
        P.append(finish(active(), [LEAF, LEAF_D, LIME][(i + seed) % 3], 0, False))
    return join(P, name)

def flower_box(name):
    """A wooden planter box full of flowers."""
    P = [box(1.2, 0.45, 0.4, 0, 0, 0.2, WOOD, 0.02), box(1.26, 0.5, 0.05, 0, 0, 0.42, WOOD_D, 0.01), box(1.1, 0.36, 0.04, 0, 0, 0.4, COCONUT)]
    cols = [CORAL, YELLOW, WHITE, PEACH, SKY]
    for k in range(9):
        x, y = -0.45 + (k % 5) * 0.22, -0.08 + (k // 5) * 0.16
        P.append(sph(0.1, x, y, 0.5, LEAF_D if k % 2 else LEAF, seg=8, rings=6))
        P.append(sph(0.05, x + 0.03, y - 0.03, 0.6, cols[k % 5], seg=8, rings=5))
    return join(P, name)

def paw_sign(name):
    """A hanging café sign: a white disc with a coral paw, on a wooden post and bracket."""
    P = [cyl(0.05, 0.06, 2.4, 0, 0, 1.2, WOOD_D, 8), box(0.6, 0.05, 0.05, 0.28, 0, 2.3, WOOD_D),
         cyl(0.34, 0.34, 0.06, 0.45, 0, 1.9, WHITE, 24, rot=(math.pi / 2, 0, 0), bevel=0.015),
         torus(0.34, 0.03, 0.45, 0, 1.9, CORAL, rot=(math.pi / 2, 0, 0)),
         sph(0.1, 0.45, -0.04, 1.84, CORAL, sy=0.3, seg=12, rings=6)]
    for dx, dz in ((-0.11, 0.1), (-0.04, 0.16), (0.04, 0.16), (0.11, 0.1)): P.append(sph(0.04, 0.45 + dx, -0.04, 1.84 + dz, CORAL, sy=0.3, seg=8, rings=5))
    for sx in (0.3, 0.6): P.append(cyl(0.006, 0.006, 0.26, sx, 0, 2.15, METAL, 4))
    return join(P, name)

models = [
    cat_tree('t_cattree'), pet_bed('t_bed_coral', CORAL, CREAM), pet_bed('t_bed_navy', NAVY, SKY), pet_bed('t_bed_teal', TEAL, CREAM),
    dog_house('t_doghouse'), bowls('t_bowls'), toys('t_toys'), picket('t_fence_2'), picket('t_fence_4', 4.0),
    tree('t_tree_a', 1.0, 0), tree('t_tree_b', 1.2, 1), tree('t_tree_c', 0.85, 2), flower_box('t_flowerbox'), paw_sign('t_pawsign'),
]
for m in models: export(m)
print('EXPORTED', len(models), 'models to', OUT_DIR)
