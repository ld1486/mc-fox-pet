/* Minecraft 1.20.1 fox box model, rebuilt from the decompiled FoxModel.
 *
 * All numbers below are in Minecraft model pixels: x right, y DOWN, z back
 * (the fox faces -z).  Everything is converted to three.js space (y up) at
 * build time so the rest of the app can keep using the vanilla numbers.
 */
import * as THREE from '../vendor/three.module.min.js';

export const ATLASES = {
  adult: { w: 48, h: 32 },
  pup: { w: 64, h: 32 },
};

/* name, parent, pivot, box [x,y,z,w,h,d], texOffs, rest rotation (mc space) */
export const PARTS = [
  { name: 'head', parent: null, pivot: [-1, 16.5, -3], box: [-3, -2, -5, 8, 6, 6], uv: [1, 5] },
  { name: 'right_ear', parent: 'head', pivot: [0, 0, 0], box: [-3, -4, -4, 2, 2, 1], uv: [8, 1] },
  { name: 'left_ear', parent: 'head', pivot: [0, 0, 0], box: [3, -4, -4, 2, 2, 1], uv: [15, 1] },
  { name: 'nose', parent: 'head', pivot: [0, 0, 0], box: [-1, 2.01, -8, 4, 2, 3], uv: [6, 18] },
  {
    name: 'body', parent: null, pivot: [0, 16, -6], box: [-3, 3.999, -3.5, 6, 11, 6], uv: [24, 15],
    rot: [Math.PI / 2, 0, 0],
  },
  {
    name: 'tail', parent: 'body', pivot: [-4, 15, -1], box: [2, 0, -1, 4, 9, 5], uv: [30, 0],
    rot: [-0.05235988, 0, 0],
  },
  { name: 'legRH', parent: null, pivot: [-5, 17.5, 7], box: [2, 0.5, -1, 2, 6, 2], uv: [13, 24] },
  { name: 'legLH', parent: null, pivot: [-1, 17.5, 7], box: [2, 0.5, -1, 2, 6, 2], uv: [4, 24] },
  { name: 'legRF', parent: null, pivot: [-5, 17.5, 0], box: [2, 0.5, -1, 2, 6, 2], uv: [13, 24] },
  { name: 'legLF', parent: null, pivot: [-1, 17.5, 0], box: [2, 0.5, -1, 2, 6, 2], uv: [4, 24] },
];

const LEGS = ['legRH', 'legLH', 'legRF', 'legLF'];

/* Chibi cub: same pivots (every pose keeps working) but a much bigger head,
 * shorter body, shorter legs and a chunkier tail.  The cub atlas is 64x32 and
 * is produced by scripts/gen_cub_atlas.py from the adult texture. */
export const PUP_PARTS = [
  { name: 'head', parent: null, pivot: [-1, 16.5, -3], box: [-4, -5, -6, 10, 8, 8], uv: [0, 0] },
  { name: 'right_ear', parent: 'head', pivot: [0, 0, 0], box: [-4, -7.5, -5, 3, 3, 1], uv: [46, 22] },
  { name: 'left_ear', parent: 'head', pivot: [0, 0, 0], box: [3.5, -7.5, -5, 3, 3, 1], uv: [54, 22] },
  { name: 'nose', parent: 'head', pivot: [0, 0, 0], box: [-1.5, 0.5, -9, 5, 2, 3], uv: [46, 16] },
  {
    name: 'body', parent: null, pivot: [0, 16, -6], box: [-3.5, 4, -3.5, 7, 8, 7], uv: [36, 0],
    rot: [Math.PI / 2, 0, 0],
  },
  {
    name: 'tail', parent: 'body', pivot: [-4, 15, -1], box: [2, 0, -1, 5, 8, 6], uv: [0, 16],
    rot: [-0.05235988, 0, 0],
  },
  { name: 'legRH', parent: null, pivot: [-5, 17.5, 7], box: [1.6, 1.5, -1.5, 3, 5, 3], uv: [22, 16] },
  { name: 'legLH', parent: null, pivot: [-1, 17.5, 7], box: [1.6, 1.5, -1.5, 3, 5, 3], uv: [34, 16] },
  { name: 'legRF', parent: null, pivot: [-5, 17.5, 0], box: [1.6, 1.5, -1.5, 3, 5, 3], uv: [22, 16] },
  { name: 'legLF', parent: null, pivot: [-1, 17.5, 0], box: [1.6, 1.5, -1.5, 3, 5, 3], uv: [34, 16] },
];

/* Minecraft's own face brightness, baked into vertex colours. */
const FACE_SHADE = { up: 1.0, down: 0.5, north: 0.9, south: 0.84, west: 0.72, east: 0.78 };

/* Corner order + uv order matches the vanilla Cube unwrap (verified against a
 * numpy rasteriser before porting: front faces read upright, no mirroring). */
function faceCorners(box) {
  const [x, y, z, w, h, d] = box;
  const x0 = x, x1 = x + w, y0 = y, y1 = y + h, z0 = z, z1 = z + d;
  return {
    north: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]],
    south: [[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]],
    west: [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]],
    east: [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]],
    up: [[x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y0, z0]],
    down: [[x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [x0, y1, z0]],
  };
}

function faceUVs(u, v, w, h, d) {
  const u1 = u + d, u2 = u + d + w, u3 = u + d + w + d;
  return {
    north: [[u1, v + d], [u2, v + d], [u2, v + d + h], [u1, v + d + h]],
    south: [[u3, v + d], [u3 + w, v + d], [u3 + w, v + d + h], [u3, v + d + h]],
    west: [[u, v + d], [u + d, v + d], [u + d, v + d + h], [u, v + d + h]],
    east: [[u2, v + d], [u2 + d, v + d], [u2 + d, v + d + h], [u2, v + d + h]],
    up: [[u + d, v], [u + d + w, v], [u + d + w, v + d], [u + d, v + d]],
    down: [[u + d + w, v], [u + 2 * w + d, v], [u + 2 * w + d, v + d], [u + d + w, v + d]],
  };
}

const OUTWARD = {
  north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0], up: [0, 1, 0], down: [0, -1, 0],
};

const FACE_ORDER = ['north', 'south', 'east', 'west', 'up', 'down'];

function boxGeometry(box, uv, pivot, atlas) {
  const [px, py, pz] = pivot;
  const corners = faceCorners(box);
  const uvs = faceUVs(uv[0], uv[1], box[3], box[4], box[5]);

  const pos = [];
  const nor = [];
  const col = [];
  const uvsOut = [];
  const idx = [];

  for (const face of FACE_ORDER) {
    const pts = corners[face].map((p) => [p[0], -(p[1]), p[2]]); // pivot-relative, y flipped
    let uvList = uvs[face].map((t) => [t[0] / atlas.w, 1 - t[1] / atlas.h]);
    let ptsList = pts.slice();

    // winding: keep the quad facing outward after the y flip
    const e1 = [ptsList[1][0] - ptsList[0][0], ptsList[1][1] - ptsList[0][1], ptsList[1][2] - ptsList[0][2]];
    const e2 = [ptsList[2][0] - ptsList[0][0], ptsList[2][1] - ptsList[0][1], ptsList[2][2] - ptsList[0][2]];
    const n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const out = OUTWARD[face];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) {
      ptsList = [ptsList[0], ptsList[3], ptsList[2], ptsList[1]];
      uvList = [uvList[0], uvList[3], uvList[2], uvList[1]];
    }

    const base = pos.length / 3;
    const shade = FACE_SHADE[face];
    for (let i = 0; i < 4; i += 1) {
      pos.push(ptsList[i][0], ptsList[i][1], ptsList[i][2]);
      nor.push(out[0], out[1], out[2]);
      col.push(shade, shade, shade);
      uvsOut.push(uvList[i][0], uvList[i][1]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvsOut, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

/* ------------------------------------------------------- mouth items */
/* Vanilla foxes carry things around in their mouth. These sprites are the real
 * Minecraft item icons, fetched from blockrender.dev and trimmed by
 * scripts/make_items.py, so the plane shows the actual item art. */
const ITEM_IDS = ['emerald', 'chicken', 'cooked_chicken', 'rabbit', 'rabbit_foot', 'egg', 'wheat'];
const itemTextures = new Map();

function itemTexture(id) {
  let tex = itemTextures.get(id);
  if (tex) return tex;
  tex = new THREE.TextureLoader().load('/assets/items/' + id + '.png');
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  itemTextures.set(id, tex);
  return tex;
}

export function buildFox() {
  const root = new THREE.Group();   // world placement (roaming / jump)
  const rig = new THREE.Group();    // model space, feet at y = 0 after +24
  rig.position.y = 24;
  root.add(rig);
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    alphaTest: 0.4,
    side: THREE.FrontSide,
    toneMapped: false,
  });

  const parts = {};
  const qx = new THREE.Quaternion();
  const qy = new THREE.Quaternion();
  const qz = new THREE.Quaternion();
  const AXIS_X = new THREE.Vector3(1, 0, 0);
  const AXIS_Y = new THREE.Vector3(0, 1, 0);
  const AXIS_Z = new THREE.Vector3(0, 0, 1);
  /* Minecraft composes a part's pose as Rz * Ry * Rx (x applied first); the
   * angles are mirrored for y-up space, so negate x and z. */
  function setPoseRotation(target, r) {
    qx.setFromAxisAngle(AXIS_X, -r[0]);
    qy.setFromAxisAngle(AXIS_Y, r[1]);
    qz.setFromAxisAngle(AXIS_Z, -r[2]);
    target.copy(qz).multiply(qy).multiply(qx);
  }
  const itemGroup = new THREE.Group();
  itemGroup.position.set(1.0, -4.3, -8.5); itemGroup.rotation.set(-Math.PI / 2, 0, 0);
  itemGroup.visible = false;
  const itemMat = new THREE.MeshBasicMaterial({
    transparent: true,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const itemMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), itemMat);
  itemMesh.frustumCulled = false;
  itemGroup.add(itemMesh);

  const geos = {
    adult: Object.fromEntries(PARTS.map((d) => [d.name, boxGeometry(d.box, d.uv, d.pivot, ATLASES.adult)])),
    pup: Object.fromEntries(PUP_PARTS.map((d) => [d.name, boxGeometry(d.box, d.uv, d.pivot, ATLASES.pup)])),
  };

  for (const def of PARTS) {
    const group = new THREE.Group();
    group.position.set(def.pivot[0], -def.pivot[1], def.pivot[2]);
    const mesh = new THREE.Mesh(geos.adult[def.name], material);
    mesh.frustumCulled = false;
    group.add(mesh);
    if (def.rot) setPoseRotation(group.quaternion, def.rot);
    const parent = def.parent ? parts[def.parent].group : rig;
    parent.add(group);
    parts[def.name] = { group, mesh, def, basePos: group.position.clone(), baseRot: group.quaternion.clone() };
  }
  parts.head.group.add(itemGroup);
  let model = 'adult';

  return {
    root,
    rig,
    parts,
    material,
    legs: LEGS,
    setTexture(tex) {
      material.map = tex;
      material.needsUpdate = true;
    },
    /** 'adult' | 'pup' — swaps every part's geometry (UVs are baked per model). */
    setModel(kind) {
      if (kind !== 'adult' && kind !== 'pup') kind = 'adult';
      if (kind === model) return model;
      model = kind;
      for (const def of PARTS) {
        const mesh = parts[def.name].mesh;
        mesh.geometry = geos[kind][def.name];
      }
      /* The pup's muzzle sits lower and pokes out further, so the mouth item
       * gets its own offset for each model. */
      if (kind === 'pup') {
        itemGroup.position.set(1.0, -2.95, -9.4); itemGroup.rotation.set(-Math.PI / 2, 0, 0);
      }
      return model;
    },
    get model() {
      return model;
    },
    /** id: 'none' hides the item; anything else shows that 16x16 sprite. */
    setItem(id) {
      if (!id || id === 'none' || !ITEM_IDS.includes(id)) {
        itemGroup.visible = false;
        return;
      }
      itemMat.map = itemTexture(id);
      itemMat.needsUpdate = true;
      itemGroup.visible = true;
    },
    /** pose: { part: { p:[x,y,z] (mc), r:[rx,ry,rz] (mc), visible } } */
    applyPose(pose) {
      for (const def of PARTS) {
        const entry = pose[def.name];
        const part = parts[def.name];
        if (!entry) continue;
        const p = entry.p || def.pivot;
        part.group.position.set(p[0], -p[1], p[2]);
        const r = entry.r || (def.rot ? def.rot : [0, 0, 0]);
        setPoseRotation(part.group.quaternion, r);
        part.group.visible = entry.v !== false;
      }
    },
  };
}
