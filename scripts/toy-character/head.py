"""Head construction in metres, facing -Y. Character L is world +X."""
import math
import bpy
from geometry import material, mesh, patch, sphere, tube, join, gauss

PI = math.pi
EYE_U = 13 / 30
EYE_V = -9 / 30
HOLE_U = 11 / 30
HOLE_V = 6 / 30
ORBIT_X, ORBIT_Z = .031, .027


def orbit_angles():
    perimeter = [(i / 11, j / 6) for j in range(-6, 7) for i in range(-11, 12)
                 if abs(i) == 11 or abs(j) == 6]
    return sorted(math.atan2(v, u) % (2 * PI) for u, v in perimeter)


def skin_color(x, y, z):
    blush = gauss(abs(x) - .079, .033) * gauss(z - .765, .024) * gauss(y + .09, .05)
    nose = .25 * gauss(x, .019) * gauss(z - .774, .02) * gauss(y + .13, .03)
    weight = min(.46, .46 * blush + nose)
    base, pink = (.72, .325, .16), (.79, .19, .115)
    return tuple(a * (1 - weight) + b * weight for a, b in zip(base, pink)) + (1,)


def face_y(x, z, depth):
    # Continuous displacement keeps nose, cheeks and muzzle in the quad skin.
    nose = .019 * gauss(x, .018) * gauss(z - .775, .010)
    nose += .004 * gauss(abs(x) - .013, .007) * gauss(z - .769, .006)
    nose -= .003 * gauss(abs(x) - .008, .0035) * gauss(z - .767, .003)
    bridge = .004 * gauss(x, .012) * gauss(z - .795, .024)
    cheeks = .009 * gauss(abs(x) - .072, .036) * gauss(z - .761, .032)
    muzzle = .006 * gauss(x, .035) * gauss(z - .743, .021)
    sockets = .004 * gauss(abs(x) - .0475, .025) * gauss(z - .811, .023)
    return depth - nose - bridge - cheeks - muzzle + sockets


def skin_y(x, z):
    taper = 1 + .10 * gauss(z - .752, .038) - .16 * gauss(z - .709, .022)
    exponent = .38 + .12 * max(0, min(1, (z - .90) / .035))
    return face_y(x, z, -.108 * max(.00001, 1 - (x / (.123 * taper)) ** 2 - ((z - .847) / .148) ** 2) ** exponent)


def make_skin(mats):
    bpy.ops.mesh.primitive_cube_add(size=2)
    obj = bpy.context.object
    obj.name = 'head_skin'
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.subdivide(number_cuts=59)
    bpy.ops.object.mode_set(mode='OBJECT')
    original = [v.co.copy() for v in obj.data.vertices]
    for v in obj.data.vertices:
        raw = original[v.index]
        d = v.co.normalized()
        z = .847 + .148 * d.z
        # A fuller lower face and a small round chin, without a UV-sphere pole fan.
        taper = 1 + .10 * gauss(z - .752, .038) - .16 * gauss(z - .709, .022)
        x = .123 * d.x * taper
        if raw.y < -.45:
            sign = 1 if raw.x >= 0 else -1
            u, vproj = raw.x / -raw.y, raw.z / -raw.y
            du, dv = (u - sign * EYE_U) / HOLE_U, (vproj - EYE_V) / HOLE_V
            r = max(abs(du), abs(dv))
            if .95 < r < 1.85:
                a = math.atan2(dv, du)
                blend = max(0, min(1, (1.85 - r) / .85))
                blend = blend * blend * (3 - 2 * blend)
                x = x * (1 - blend) + (sign * .0475 + ORBIT_X * r * math.cos(a)) * blend
                z = z * (1 - blend) + (.811 + ORBIT_Z * r * math.sin(a)) * blend
        y = .108 * d.y
        if d.y < 0:
            y = skin_y(x, z)
        v.co = (x, y, z)
    # The lid annuli bridge these openings; removing the underlying skin prevents
    # it covering the lower iris as the eyes turn or blink.
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    remove = []
    for f in bm.faces:
        coords = [original[v.index] for v in f.verts]
        u = sum(c.x for c in coords) / 4
        v = sum(c.z for c in coords) / 4
        if all(c.y < -.999 for c in coords) and any(abs(u - sign * EYE_U) < HOLE_U - .00001 and abs(v - EYE_V) < HOLE_V - .00001 for sign in [-1, 1]):
            remove.append(f)
    bmesh.ops.delete(bm, geom=remove, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.materials.append(mats['skin'])
    colors = obj.data.color_attributes.new(name='SkinTint', type='FLOAT_COLOR', domain='POINT')
    for v in obj.data.vertices:
        colors.data[v.index].color = skin_color(*v.co)
    node = mats['skin'].node_tree.nodes.new('ShaderNodeVertexColor')
    node.layer_name = 'SkinTint'
    mats['skin'].node_tree.links.new(node.outputs['Color'], mats['skin'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    for p in obj.data.polygons:
        p.use_smooth = True
    mod = obj.modifiers.new('Quad surface', 'SUBSURF')
    mod.levels = 2
    mod.render_levels = 2
    obj['topology'] = 'Quad cube-sphere with paired orbital boundary loops; continuous nose and cheeks'
    for side, sign in [('L', 1), ('R', -1)]:
        sphere('ear_' + side, (sign * .119, -.029, .779), (.016, .012, .027), mats['skin_plain'])
        sphere('ear_concha_' + side, (sign * .126, -.039, .782), (.006, .002, .013), mats['ear'])
    def neck(u, v):
        a = u * 2 * PI
        radius = .031 + .004 * (1 - v) ** 2
        return (radius * math.sin(a), .014 + radius * math.cos(a), .667 + .063 * v)
    patch('neck', 64, 16, neck, mats['skin_plain'], 1, True)
    # Closed lip seam and gently raised lip volumes sit on the integrated muzzle.
    points = []
    for i in range(17):
        x = -.030 + .060 * i / 16
        z = .740 + .0050 * (abs(x) / .03) ** 1.7
        y = skin_y(x, z)
        points.append((x, y - .001, z))
    tube('mouth_seam', points, .00065, mats['mouth'])
    for upper in [True, False]:
        def lip(u, v):
            x = (u * 2 - 1) * .0295
            seam = .740 + .0050 * (abs(x) / .03) ** 1.7
            width = (1 - (abs(x) / .030) ** 2) ** .5
            z = seam + (1 if upper else -1) * .004 * math.sin(v * PI / 2) * width
            y = skin_y(x, z)
            return (x, y - .0015 * math.sin(PI * v) * width, z)
        patch('lip_upper' if upper else 'lip_lower', 40, 8, lip, mats['lip'], 1)
    return obj


def make_eyes(mats):
    radius = .024
    for side, sign in [('L', 1), ('R', -1)]:
        center = (sign * .0475, -.078, .811)
        eye = sphere('eye_' + side, center, (radius,) * 3, mats['white'])
        eye['gaze_axis'] = 'Local -Y; iris and pupil are children'
        # Spherical iris follows the globe so the edge never floats off the eye.
        for name, rad, mat, offset in [('iris', .0152, mats['iris'], .00010), ('pupil', .0083, mats['pupil'], .00023)]:
            def disk(u, v):
                a, r = 2 * PI * u, max(.00002, v * rad)
                return (r * math.cos(a), -math.sqrt((radius + offset) ** 2 - r * r), r * math.sin(a))
            disc = patch(name + '_' + side, 96, 16, disk, mat, wrap=True)
            for polygon in disc.data.polygons:
                polygon.flip()
            disc.parent = eye
            if name == 'iris':
                attr = disc.data.color_attributes.new(name='IrisTint', type='FLOAT_COLOR', domain='POINT')
                for vertex in disc.data.vertices:
                    x, _, z = vertex.co
                    r, a = math.hypot(x, z) / rad, math.atan2(z, x)
                    variation = .70 + .18 * math.sin(75 * a + 8 * r) + .07 * math.sin(133 * a - 14 * r)
                    variation *= .45 + .55 * max(0, math.sin(PI * r)) ** .5
                    attr.data[vertex.index].color = (.115 * variation, .061 * variation, .031 * variation, 1)
        for suffix, x, z, r in [('key', -.005, .007, .0027), ('fill', .0045, -.005, .00085)]:
            y = -math.sqrt(radius * radius - x * x - z * z) - .00005
            highlight = sphere('catchlight_' + suffix + '_' + side, (0, 0, 0), (r, .00010, r), mats['highlight'], 0)
            highlight.parent = eye
            highlight.location = (x, y, z)
        # An annulus joins the almond opening to the cheek/forehead. Both key
        # endpoints use a common safe depth for the whole linear blink path.
        verts, closed, faces = [], [], []
        angles = orbit_angles()
        nu, nv = len(angles), 20
        clearance = .0010
        for j in range(nv + 1):
            t = j / nv
            smooth = t * t * (3 - 2 * t)
            for i in range(nu):
                a = angles[i]
                width = .023 * (1 - t) + ORBIT_X * t
                x = width * math.cos(a)
                h = .016 if math.sin(a) >= 0 else .012
                inner_z = h * math.sin(a) + .001 * math.cos(a) * sign
                outer_z = ORBIT_Z * math.sin(a)
                z_open = inner_z * (1 - t) + outer_z * t
                z_shut = (-.001 + .001 * math.cos(a) * sign) * (1 - t) + outer_z * t
                endpoints = []
                for z, shell in [(z_open, radius + .0012), (z_shut, radius + .003)]:
                    outside_y = skin_y(center[0] + x, center[2] + z) - center[1]
                    d = shell * shell - x * x - z * z
                    y = -math.sqrt(d) * (1 - smooth) + outside_y * smooth if d > 0 else outside_y
                    endpoints.append(y)
                # Correct the complete straight morph path, not just its endpoints.
                forward = 0
                for step in range(41):
                    b = step / 40
                    z = z_open * (1 - b) + z_shut * b
                    y = endpoints[0] * (1 - b) + endpoints[1] * b
                    d = (radius + .0008) ** 2 - x * x - z * z
                    if d > 0:
                        forward = max(forward, y + math.sqrt(d))
                verts.append((x, endpoints[0] - forward, z_open))
                closed.append((x, endpoints[1] - forward, z_shut))
        for j in range(nv):
            for i in range(nu):
                k, nxt = j * nu + i, j * nu + (i + 1) % nu
                faces.append((k + nu, nxt + nu, nxt, k))
        lid = mesh('eyelid_' + side, verts, faces, mats['skin'], 1)
        lid.location = center
        attr = lid.data.color_attributes.new(name='SkinTint', type='FLOAT_COLOR', domain='POINT')
        for v in lid.data.vertices:
            attr.data[v.index].color = skin_color(center[0] + v.co.x, center[1] + v.co.y, center[2] + v.co.z)
        lid.data.materials.append(mats['lash'])
        for i, a in enumerate(angles):
            if .08 < a < PI - .08:
                lid.data.polygons[i].material_index = 1
        lid.shape_key_add(name='Basis')
        key = lid.shape_key_add(name='blink_' + side)
        for p, co in zip(key.data, closed):
            p.co = co
        key.value = 0
        lid.data.update()
        lid['blink_clearance_m'] = clearance
        brow = []
        for i in range(13):
            u = i / 12
            x = center[0] + (u - .5) * .048
            z = .844 + .009 * math.sin(PI * u)
            y = face_y(x, z, -.108 * max(.01, 1 - (x / .123) ** 2 - ((z - .847) / .148) ** 2) ** .38) - .001
            brow.append((x, y, z))
        tube('brow_' + side, brow, .0022, mats['hair'])


def make_hair(mats):
    rx, ry, rz, cz = .159, .158, .152, .849
    locks = 26
    fringe_centers = [-.91, -.67, -.42, -.17, .13, .39, .65, .88]
    fringe_tips = [1.60, 1.56, 1.59, 1.55, 1.58, 1.56, 1.60, 1.61]
    def end(theta):
        a = abs((theta + PI) % (2 * PI) - PI)
        mix = max(0, min(1, (a - .76) / .53))
        mix = mix * mix * (3 - 2 * mix)
        signed = (theta + PI) % (2 * PI) - PI
        front = 1.46 - .07 * gauss(signed - .05, .065)
        for center, tip in zip(fringe_centers, fringe_tips):
            across = abs((signed - center) / .15)
            if across <= 1:
                front = max(front, tip - .08 * across ** 3)
        return front * (1 - mix) + (2.77 + .045 * math.cos(26 * theta)) * mix
    def surface(theta, phi, bulge=0):
        wave = .0022 * math.cos(locks * theta + 1.2 * math.sin(phi)) * math.sin(phi)
        fine = .00007 * math.sin(theta * 115 + 7 * phi) * math.sin(phi)
        swell = bulge + wave + fine
        return (.014 * max(0, math.cos(phi)) ** 3 + (rx + swell) * math.sin(phi) * math.sin(theta),
                .025 - (ry + swell) * math.sin(phi) * math.cos(theta),
                cz + (rz + swell) * math.cos(phi))
    def cap(u, v):
        theta = 2 * PI * u
        theta += .22 * math.sin(PI * v) * math.sin(theta + .5)
        return surface(theta, .001 + (end(theta) - .001) * v)
    base = patch('hair', 312, 96, cap, mats['hair'], 1, True)
    for polygon in base.data.polygons:
        polygon.flip()
    hair = base
    solid = hair.modifiers.new('Hair shell', 'SOLIDIFY')
    solid.thickness = .0015
    return hair


def make_glasses(mats):
    parts = []
    for side, sign in [('L', 1), ('R', -1)]:
        pts = []
        for i in range(48):
            a = 2 * PI * i / 48
            x = sign * .054 + .035 * math.cos(a)
            z = .805 + .034 * math.sin(a)
            pts.append((x, -.129 + .035 * abs(x), z))
        parts.append(tube('frame_' + side, pts, .00085, mats['metal'], True))
        parts.append(tube('temple_' + side, [(sign * .089, -.125, .812), (sign * .111, -.096, .813), (sign * .129, -.015, .805), (sign * .126, .008, .787)], .00105, mats['metal']))
    parts.append(tube('bridge', [(-.019, -.131, .807), (-.012, -.135, .814), (0, -.136, .816), (.012, -.135, .814), (.019, -.131, .807)], .00085, mats['metal']))
    for sign in [-1, 1]:
        parts.append(tube('nose_pad_arm', [(sign * .020, -.130, .800), (sign * .018, -.123, .791)], .00065, mats['metal']))
    return join(parts, 'glasses')


def build_head():
    mats = {
        'skin': material('Skin warm vertex tint', (.69, .365, .205), .43, coat=.08),
        'skin_plain': material('Skin warm', (.72, .325, .16), .47, coat=.05),
        'ear': material('Ear warm shadow', (.52, .235, .125), .5),
        'mouth': material('Closed lip seam', (.245, .065, .036), .56),
        'lip': material('Soft coral lips', (.66, .245, .143), .42),
        'white': material('Ivory eye white', (.89, .87, .82), .21, coat=.22),
        'iris': material('Brown radial iris', (.08, .04, .02), .24, coat=.3),
        'pupil': material('Deep pupil', (.006, .004, .003), .13, coat=.35),
        'lash': material('Soft espresso lash rim', (.035, .015, .009), .5),
        'highlight': material('Eye reflected softbox glint', (.95, .95, .95), .2),
        'hair': material('Espresso hair', (.010, .0065, .005), .48, coat=.06),
        'metal': material('Satin pewter frame', (.29, .275, .235), .28, .8),
    }
    mats['hair'].node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value = .25
    for name in ['white', 'iris', 'pupil']:
        mats[name].node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value = .12
        mats[name].node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value = 0
    n = mats['iris'].node_tree.nodes.new('ShaderNodeVertexColor')
    n.layer_name = 'IrisTint'
    mats['iris'].node_tree.links.new(n.outputs['Color'], mats['iris'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    make_skin(mats)
    make_eyes(mats)
    make_hair(mats)
    make_glasses(mats)
