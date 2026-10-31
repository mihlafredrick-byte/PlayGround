import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  clamp, damp, dampAngle, lerp, rand, TAU, UP, DOWN, makeShadowTexture,
} from './utils.js'
import { terrainHeight } from './world.js'

const templateCache = new Map()
const skinMat = new THREE.MeshStandardMaterial({ color: 0xb9825f, roughness: 0.82 })
const hairMat = new THREE.MeshStandardMaterial({ color: 0x2b1c12, roughness: 0.95 })
const blackMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.72 })
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xd6d0bd, roughness: 0.9 })
const leatherMat = new THREE.MeshStandardMaterial({ color: 0x4a3422, roughness: 0.82 })
const brassMat = new THREE.MeshStandardMaterial({ color: 0xb08c46, metalness: 0.55, roughness: 0.38 })
const ironMat = new THREE.MeshStandardMaterial({ color: 0x2d3033, metalness: 0.7, roughness: 0.42 })
const steelMat = new THREE.MeshStandardMaterial({ color: 0xb9bec2, metalness: 0.9, roughness: 0.3 })
const canvasMat = new THREE.MeshStandardMaterial({ color: 0x9b845f, roughness: 0.95 })
const woodMat = new THREE.MeshStandardMaterial({ color: 0x4f3019, roughness: 0.62 })
const shadowTexture = makeShadowTexture()
const shadowMaterial = new THREE.MeshBasicMaterial({
  map: shadowTexture, transparent: true, opacity: 0.5, depthWrite: false,
  color: 0x000000, blending: THREE.NormalBlending,
})

const STYLES = {
  british: {
    coat: 0xa83127, facing: 0x2b3d68, trousers: 0x99978b, gaiter: 0x17191b,
    belt: 0xdcd5c1, plume: 0xeee8d8, skin: 0xb9825f, pack: 0x6b5034,
  },
  french: {
    coat: 0x2c4a90, facing: 0xb02f2a, trousers: 0xdad4bf, gaiter: 0x181a1d,
    belt: 0xdcd5c1, plume: 0xc9322f, skin: 0xb9825f, pack: 0x725536,
  },
  rifle: {
    coat: 0x36543a, facing: 0x1b201d, trousers: 0x475540, gaiter: 0x151715,
    belt: 0x232722, plume: 0x38563a, skin: 0xb9825f, pack: 0x57432c,
  },
}

const styleMaterials = new Map()

function getMaterials(faction) {
  if (styleMaterials.has(faction)) return styleMaterials.get(faction)
  const s = STYLES[faction] || STYLES.british
  const mats = {
    coat: new THREE.MeshStandardMaterial({ color: s.coat, roughness: 0.88 }),
    facing: new THREE.MeshStandardMaterial({ color: s.facing, roughness: 0.86 }),
    trousers: new THREE.MeshStandardMaterial({ color: s.trousers, roughness: 0.94 }),
    gaiter: new THREE.MeshStandardMaterial({ color: s.gaiter, roughness: 0.85 }),
    belt: new THREE.MeshStandardMaterial({ color: s.belt, roughness: 0.92 }),
    plume: new THREE.MeshStandardMaterial({ color: s.plume, roughness: 0.95 }),
    skin: new THREE.MeshStandardMaterial({ color: s.skin, roughness: 0.8 }),
    pack: new THREE.MeshStandardMaterial({ color: s.pack, roughness: 0.96 }),
    hair: hairMat,
    black: blackMat,
    leather: leatherMat,
    brass: brassMat,
    iron: ironMat,
    steel: steelMat,
    canvas: canvasMat,
    wood: woodMat,
  }
  styleMaterials.set(faction, mats)
  return mats
}

class PartBuilder {
  constructor() {
    this.groups = new Map()
  }

  add(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    const g = geo.clone()
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]))
    g.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(pos[0], pos[1], pos[2]), q, new THREE.Vector3(scale[0], scale[1], scale[2])
    ))
    if (!this.groups.has(mat)) this.groups.set(mat, [])
    this.groups.get(mat).push(g)
    return this
  }

  build(parent, castShadow = true) {
    for (const [mat, geos] of this.groups) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos)
      const mesh = new THREE.Mesh(merged, mat)
      mesh.castShadow = castShadow
      mesh.receiveShadow = true
      parent.add(mesh)
      if (geos.length > 1) for (const g of geos) g.dispose()
    }
    this.groups.clear()
  }
}

function box(w, h, d) { return new THREE.BoxGeometry(w, h, d) }
function cyl(rt, rb, h, seg = 8) { return new THREE.CylinderGeometry(rt, rb, h, seg) }
function sph(r, ws = 8, hs = 6) { return new THREE.SphereGeometry(r, ws, hs) }
function cap(r, len, seg = 6) { return new THREE.CapsuleGeometry(r, len, 3, seg) }

function buildMusket(faction) {
  const m = getMaterials(faction)
  const group = new THREE.Group()
  group.name = 'musket'
  const b = new PartBuilder()
  const barrelLen = faction === 'rifle' ? 0.72 : 0.9
  const barrelZ = faction === 'rifle' ? 0.32 : 0.36
  b.add(cyl(0.017, 0.019, barrelLen, 8), m.iron, [0, 0.02, barrelZ], [Math.PI / 2, 0, 0])
  b.add(box(0.058, 0.1, faction === 'rifle' ? 0.66 : 0.78), m.wood, [0, -0.012, 0.02])
  b.add(box(0.075, 0.16, 0.18), m.wood, [0, -0.015, -0.36], [0.08, 0, 0])
  b.add(box(0.035, 0.045, 0.12), m.iron, [0.045, 0.03, -0.02])
  b.add(cyl(0.026, 0.026, 0.05, 8), m.brass, [0, 0.02, barrelZ - barrelLen * 0.33], [Math.PI / 2, 0, 0])
  b.add(cyl(0.024, 0.024, 0.05, 8), m.brass, [0, 0.02, barrelZ + barrelLen * 0.3], [Math.PI / 2, 0, 0])
  b.add(box(0.018, 0.018, 0.2), m.iron, [0, -0.07, 0.08])
  const bayonetLen = faction === 'rifle' ? 0.48 : 0.43
  b.add(box(0.013, 0.028, bayonetLen), m.steel, [0, 0.035, barrelZ + barrelLen * 0.5 + bayonetLen * 0.5], [0.02, 0, 0])
  b.add(cyl(0.028, 0.022, 0.07, 6), m.steel, [0, 0.035, barrelZ + barrelLen * 0.5 + 0.02], [Math.PI / 2, 0, 0])
  b.build(group, true)
  const muzzle = new THREE.Object3D()
  muzzle.name = 'muzzle'
  muzzle.position.set(0, 0.02, barrelZ + barrelLen * 0.5 + 0.04)
  group.add(muzzle)
  return group
}

function buildTemplate(faction) {
  const m = getMaterials(faction)
  const root = new THREE.Group()
  root.name = 'soldierRoot'

  // Soft contact shadow so soldiers sit on the ground even where the sun
  // shadow map is too coarse to resolve a figure.
  const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.55), shadowMaterial)
  contactShadow.name = 'contactShadow'
  contactShadow.rotation.x = -Math.PI / 2
  contactShadow.position.y = 0.016
  contactShadow.renderOrder = 2
  contactShadow.castShadow = false
  contactShadow.receiveShadow = false
  root.add(contactShadow)

  const hips = new THREE.Group()
  hips.name = 'hips'
  hips.position.y = 0.92
  root.add(hips)

  const pelvis = new PartBuilder()
  pelvis.add(cyl(0.29, 0.34, 0.36, 9), m.coat, [0, -0.08, 0], [0, 0, 0], [1.08, 1, 0.82])
  pelvis.add(cyl(0.305, 0.305, 0.065, 9), m.belt, [0, 0.055, 0], [0, 0, 0], [1.05, 1, 0.8])
  pelvis.add(box(0.18, 0.2, 0.08), m.pack, [0.25, -0.03, -0.19], [0.1, -0.1, 0.05])
  pelvis.add(box(0.18, 0.44, 0.04), m.coat, [-0.11, -0.28, -0.19], [0.22, 0.02, 0.03])
  pelvis.add(box(0.18, 0.44, 0.04), m.coat, [0.11, -0.28, -0.19], [0.22, -0.02, -0.03])
  pelvis.build(hips)

  const torso = new THREE.Group()
  torso.name = 'torso'
  torso.position.y = 0.055
  hips.add(torso)
  const t = new PartBuilder()
  t.add(cyl(0.235, 0.295, 0.56, 10), m.coat, [0, 0.28, 0], [0, 0, 0], [1.12, 1, 0.84])
  t.add(cyl(0.16, 0.17, 0.09, 8), m.facing, [0, 0.57, 0])
  t.add(box(0.085, 0.42, 0.02), m.facing, [-0.075, 0.32, 0.215], [0, 0, 0.12])
  t.add(box(0.085, 0.42, 0.02), m.facing, [0.075, 0.32, 0.215], [0, 0, -0.12])
  t.add(box(0.045, 0.57, 0.018), m.belt, [0, 0.29, 0.235], [0, 0, 0.55])
  t.add(box(0.045, 0.57, 0.018), m.belt, [0, 0.29, 0.238], [0, 0, -0.55])
  t.add(sph(0.021, 5, 4), m.brass, [0, 0.19, 0.256])
  t.add(sph(0.021, 5, 4), m.brass, [0, 0.31, 0.256])
  t.add(sph(0.021, 5, 4), m.brass, [0, 0.43, 0.256])
  t.add(box(0.22, 0.1, 0.055), m.belt, [0, 0.48, 0.15], [0.18, 0, 0])
  t.add(box(0.4, 0.42, 0.17), m.pack, [0, 0.32, -0.26])
  t.add(cyl(0.075, 0.075, 0.42, 7), m.canvas, [0, 0.54, -0.25], [0, 0, Math.PI / 2])
  t.add(cyl(0.075, 0.075, 0.05, 7), m.leather, [0, 0.54, -0.25], [0, 0, Math.PI / 2])
  t.add(box(0.055, 0.22, 0.04), m.leather, [-0.19, 0.37, 0.19], [0, 0, -0.3])
  t.add(sph(0.05, 6, 5), m.brass, [-0.19, 0.26, 0.2])
  t.build(torso)

  const head = new THREE.Group()
  head.name = 'head'
  head.position.y = 0.6
  torso.add(head)
  const h = new PartBuilder()
  h.add(cyl(0.07, 0.08, 0.1, 7), m.skin, [0, -0.015, 0])
  h.add(sph(0.115, 10, 8), m.skin, [0, 0.12, 0], [0, 0, 0], [0.92, 1.12, 0.92])
  h.add(box(0.035, 0.045, 0.06), m.skin, [0, 0.105, 0.108])
  h.add(sph(0.016, 5, 4), m.hair, [-0.041, 0.148, 0.101])
  h.add(sph(0.016, 5, 4), m.hair, [0.041, 0.148, 0.101])
  h.add(box(0.2, 0.08, 0.18), m.hair, [0, 0.16, -0.015])
  h.add(cyl(0.142, 0.154, 0.275, 12), m.black, [0, 0.335, -0.002])
  h.add(cyl(0.148, 0.148, 0.018, 12), m.black, [0, 0.475, -0.002])
  h.add(box(0.31, 0.022, 0.17), m.black, [0, 0.214, 0.095], [-0.08, 0, 0])
  h.add(box(0.105, 0.115, 0.016), m.brass, [0, 0.34, 0.145])
  h.add(cyl(0.032, 0.043, 0.17, 6), m.plume, [0, 0.56, 0.015], [0.06, 0, 0])
  h.add(box(0.022, 0.18, 0.022), m.brass, [-0.13, 0.16, 0.06], [0, 0, 0.05])
  h.add(box(0.022, 0.18, 0.022), m.brass, [0.13, 0.16, 0.06], [0, 0, -0.05])
  h.build(head)

  function buildArm(side) {
    const x = side * 0.295
    const arm = new THREE.Group()
    arm.name = side < 0 ? 'armL' : 'armR'
    arm.position.set(x, 0.475, 0)
    torso.add(arm)
    const a = new PartBuilder()
    a.add(cap(0.065, 0.22, 6), m.coat, [0, -0.15, 0], [0, 0, 0], [1, 1, 1])
    a.add(cyl(0.072, 0.077, 0.065, 7), m.facing, [0, -0.285, 0])
    a.add(sph(0.045, 6, 5), m.facing, [side * 0.035, 0.015, 0], [0, 0, 0], [1.4, 0.7, 1])
    a.build(arm)

    const fore = new THREE.Group()
    fore.name = side < 0 ? 'foreL' : 'foreR'
    fore.position.y = -0.31
    arm.add(fore)
    const f = new PartBuilder()
    f.add(cap(0.054, 0.2, 6), m.coat, [0, -0.12, 0])
    f.add(cyl(0.06, 0.064, 0.05, 7), m.facing, [0, -0.235, 0])
    f.add(sph(0.055, 7, 6), m.skin, [0, -0.285, 0.008], [0, 0, 0], [0.85, 1.15, 0.85])
    f.build(fore)
    return { arm, fore }
  }
  const leftArm = buildArm(-1)
  const rightArm = buildArm(1)

  function buildLeg(side) {
    const leg = new THREE.Group()
    leg.name = side < 0 ? 'legL' : 'legR'
    leg.position.set(side * 0.13, -0.015, 0)
    hips.add(leg)
    const l = new PartBuilder()
    l.add(cap(0.086, 0.26, 6), m.trousers, [0, -0.22, 0])
    l.add(cyl(0.074, 0.083, 0.07, 7), m.trousers, [0, -0.42, 0])
    l.build(leg)

    const shin = new THREE.Group()
    shin.name = side < 0 ? 'shinL' : 'shinR'
    shin.position.y = -0.44
    leg.add(shin)
    const s = new PartBuilder()
    s.add(cap(0.071, 0.23, 6), m.trousers, [0, -0.19, 0])
    s.add(cyl(0.076, 0.083, 0.2, 7), m.gaiter, [0, -0.31, 0])
    s.build(shin)

    const foot = new THREE.Group()
    foot.name = side < 0 ? 'footL' : 'footR'
    foot.position.y = -0.44
    shin.add(foot)
    const ft = new PartBuilder()
    ft.add(box(0.115, 0.1, 0.26), m.black, [0, -0.045, 0.07], [0, 0, 0])
    ft.add(box(0.12, 0.05, 0.08), m.black, [0, -0.005, -0.02])
    ft.build(foot)
    return { leg, shin, foot }
  }
  const leftLeg = buildLeg(-1)
  const rightLeg = buildLeg(1)

  const musket = buildMusket(faction)
  musket.position.set(-0.23, 0.46, -0.02)
  musket.rotation.set(-1.35, 0.04, 0.13)
  torso.add(musket)

  root.userData = {
    hips, torso, head,
    armL: leftArm.arm, foreL: leftArm.fore,
    armR: rightArm.arm, foreR: rightArm.fore,
    legL: leftLeg.leg, shinL: leftLeg.shin, footL: leftLeg.foot,
    legR: rightLeg.leg, shinR: rightLeg.shin, footR: rightLeg.foot,
    musket,
  }
  return root
}

function getTemplate(faction) {
  if (!templateCache.has(faction)) templateCache.set(faction, buildTemplate(faction))
  return templateCache.get(faction)
}

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _q1 = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _down = new THREE.Vector3(0, -1, 0)
const _up = new THREE.Vector3(0, 1, 0)

function dirQuat(from, to, useDown = true) {
  _v1.subVectors(to, from)
  if (_v1.lengthSq() < 0.000001) _v1.set(0, useDown ? -1 : 1, 0)
  _v1.normalize()
  return new THREE.Quaternion().setFromUnitVectors(useDown ? _down : _up, _v1)
}

class Ragdoll {
  constructor(soldier, dir, force, hitPart) {
    this.soldier = soldier
    const root = soldier.root
    const r = soldier.refs
    root.updateMatrixWorld(true)
    const toLocal = (v) => root.worldToLocal(v.clone())
    const point = (obj, local) => toLocal(obj.localToWorld(new THREE.Vector3(local[0], local[1], local[2])))
    const p = {
      hips: toLocal(r.hips.getWorldPosition(new THREE.Vector3())),
      chest: point(r.torso, [0, 0.34, 0]),
      head: point(r.head, [0, 0.12, 0]),
      shoulderL: toLocal(r.armL.getWorldPosition(new THREE.Vector3())),
      elbowL: toLocal(r.foreL.getWorldPosition(new THREE.Vector3())),
      handL: point(r.foreL, [0, -0.285, 0]),
      shoulderR: toLocal(r.armR.getWorldPosition(new THREE.Vector3())),
      elbowR: toLocal(r.foreR.getWorldPosition(new THREE.Vector3())),
      handR: point(r.foreR, [0, -0.285, 0]),
      hipL: toLocal(r.legL.getWorldPosition(new THREE.Vector3())),
      kneeL: toLocal(r.shinL.getWorldPosition(new THREE.Vector3())),
      footL: toLocal(r.footL.getWorldPosition(new THREE.Vector3())),
      hipR: toLocal(r.legR.getWorldPosition(new THREE.Vector3())),
      kneeR: toLocal(r.shinR.getWorldPosition(new THREE.Vector3())),
      footR: toLocal(r.footR.getWorldPosition(new THREE.Vector3())),
    }
    this.defs = [
      ['hips', 3, 0.13], ['chest', 3, 0.16], ['head', 1, 0.13],
      ['shoulderL', 1, 0.08], ['elbowL', 1, 0.07], ['handL', 0.5, 0.06],
      ['shoulderR', 1, 0.08], ['elbowR', 1, 0.07], ['handR', 0.5, 0.06],
      ['hipL', 1.2, 0.09], ['kneeL', 1, 0.08], ['footL', 0.8, 0.08],
      ['hipR', 1.2, 0.09], ['kneeR', 1, 0.08], ['footR', 0.8, 0.08],
    ]
    this.parts = {}
    for (const [name, mass, radius] of this.defs) {
      const pos = p[name].clone()
      this.parts[name] = { name, x: pos.x, y: pos.y, z: pos.z, px: pos.x, py: pos.y, pz: pos.z, mass, radius }
    }
    const pairs = [
      ['hips', 'chest', 0.85], ['chest', 'head', 0.75], ['chest', 'shoulderL', 0.7],
      ['chest', 'shoulderR', 0.7], ['shoulderL', 'elbowL', 0.92], ['elbowL', 'handL', 0.92],
      ['shoulderR', 'elbowR', 0.92], ['elbowR', 'handR', 0.92],
      ['hips', 'hipL', 0.9], ['hips', 'hipR', 0.9], ['hipL', 'kneeL', 0.95],
      ['kneeL', 'footL', 0.95], ['hipR', 'kneeR', 0.95], ['kneeR', 'footR', 0.95],
      ['shoulderL', 'shoulderR', 0.55], ['hipL', 'hipR', 0.55], ['head', 'hips', 0.35],
      ['chest', 'hipL', 0.35], ['chest', 'hipR', 0.35], ['head', 'shoulderL', 0.28],
      ['head', 'shoulderR', 0.28], ['elbowL', 'hipL', 0.18], ['elbowR', 'hipR', 0.18],
    ]
    this.constraints = []
    for (const [a, b, stiffness] of pairs) {
      const pa = this.parts[a]
      const pb = this.parts[b]
      const len = Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z)
      this.constraints.push({ a: pa, b: pb, len, stiffness })
    }
    const impulse = dir.clone().normalize().multiplyScalar(force * 0.016)
    const weights = {
      head: 1.5, chest: 1.2, hips: 0.9, shoulderL: 0.8, shoulderR: 0.8,
      handL: 0.5, handR: 0.5, hipL: 0.7, hipR: 0.7, kneeL: 0.5, kneeR: 0.5,
    }
    for (const part of Object.values(this.parts)) {
      const w = weights[part.name] || 0.4
      part.px -= impulse.x * w
      part.py -= impulse.y * w - rand(0.0025, 0.011) * (part.name === 'head' ? 1 : 0.55)
      part.pz -= impulse.z * w
      if (part.name === 'head' || part.name === 'chest') {
        part.px -= rand(-0.02, 0.02)
        part.pz -= rand(-0.02, 0.02)
      }
      if (hitPart === 'head' && part.name === 'head') {
        part.px -= impulse.x * 1.8
        part.pz -= impulse.z * 1.8
      }
    }
    this.accum = 0
    this.sleep = 0
    this.settled = false
    this.time = 0
  }

  simulate(dt) {
    if (this.settled) return
    this.accum = Math.min(this.accum + dt, 0.1)
    const step = 1 / 60
    let maxV = 0
    while (this.accum >= step) {
      this.accum -= step
      this.time += step
      for (const p of Object.values(this.parts)) {
        const vx = (p.x - p.px) * 0.994
        const vy = (p.y - p.py) * 0.994
        const vz = (p.z - p.pz) * 0.994
        p.px = p.x
        p.py = p.y
        p.pz = p.z
        p.x += vx
        p.y += vy - 9.2 * step * step
        p.z += vz
        if (p.y < p.radius) {
          p.y = p.radius
          p.px = p.x - vx * 0.62
          p.pz = p.z - vz * 0.62
          p.py = p.y
        }
        maxV = Math.max(maxV, Math.abs(vx) + Math.abs(vy) + Math.abs(vz))
      }
      for (let iter = 0; iter < 5; iter++) {
        for (const c of this.constraints) {
          const a = c.a
          const b = c.b
          let dx = b.x - a.x
          let dy = b.y - a.y
          let dz = b.z - a.z
          const d = Math.hypot(dx, dy, dz) || 0.0001
          const diff = (d - c.len) / d
          const total = a.mass + b.mass
          const k = c.stiffness * diff
          a.x += dx * k * (b.mass / total)
          a.y += dy * k * (b.mass / total)
          a.z += dz * k * (b.mass / total)
          b.x -= dx * k * (a.mass / total)
          b.y -= dy * k * (a.mass / total)
          b.z -= dz * k * (a.mass / total)
        }
      }
    }
    if (maxV < 0.008) this.sleep += dt
    else this.sleep = 0
    if (this.sleep > 2.5 || this.time > 18) this.settled = true
  }

  apply(soldier) {
    const r = soldier.refs
    const p = this.parts
    const hips = p.hips
    const chest = p.chest
    const head = p.head
    const qHips = dirQuat(_v2.set(hips.x, hips.y, hips.z), _v1.set(chest.x, chest.y, chest.z), false)
    const qChest = dirQuat(_v2.set(chest.x, chest.y, chest.z), _v1.set(head.x, head.y, head.z), false)
    const qHead = dirQuat(_v2.set(chest.x, chest.y, chest.z), _v1.set(head.x, head.y, head.z), false)

    r.hips.position.set(hips.x, hips.y, hips.z)
    r.hips.quaternion.copy(qHips)

    _v1.set(chest.x - hips.x, chest.y - hips.y, chest.z - hips.z).applyQuaternion(_q1.copy(qHips).invert())
    r.torso.position.copy(_v1)
    r.torso.quaternion.copy(_q1.multiply(qChest))

    _v1.set(head.x - chest.x, head.y - chest.y, head.z - chest.z).applyQuaternion(_q2.copy(qChest).invert())
    r.head.position.copy(_v1)
    r.head.quaternion.copy(_q2.multiply(qHead))

    const arms = [
      ['armL', 'foreL', 'shoulderL', 'elbowL', 'handL'],
      ['armR', 'foreR', 'shoulderR', 'elbowR', 'handR'],
    ]
    for (const [armName, foreName, shoulderName, elbowName, handName] of arms) {
      const sh = p[shoulderName]
      const el = p[elbowName]
      const ha = p[handName]
      const qArm = dirQuat(_v2.set(sh.x, sh.y, sh.z), _v1.set(el.x, el.y, el.z), true)
      _v1.set(sh.x - chest.x, sh.y - chest.y, sh.z - chest.z).applyQuaternion(_q1.copy(qChest).invert())
      r[armName].position.copy(_v1)
      r[armName].quaternion.copy(_q1.multiply(qArm))
      const qFore = dirQuat(_v2.set(el.x, el.y, el.z), _v1.set(ha.x, ha.y, ha.z), true)
      _v1.set(el.x - sh.x, el.y - sh.y, el.z - sh.z).applyQuaternion(_q2.copy(qArm).invert())
      r[foreName].position.copy(_v1)
      r[foreName].quaternion.copy(_q2.multiply(qFore))
    }

    const legs = [
      ['legL', 'shinL', 'footL', 'hipL', 'kneeL', 'footL'],
      ['legR', 'shinR', 'footR', 'hipR', 'kneeR', 'footR'],
    ]
    for (const [legName, shinName, footName, hipName, kneeName, footPt] of legs) {
      const hip = p[hipName]
      const knee = p[kneeName]
      const foot = p[footPt]
      const qThigh = dirQuat(_v2.set(hip.x, hip.y, hip.z), _v1.set(knee.x, knee.y, knee.z), true)
      _v1.set(hip.x - hips.x, hip.y - hips.y, hip.z - hips.z).applyQuaternion(_q1.copy(qHips).invert())
      r[legName].position.copy(_v1)
      r[legName].quaternion.copy(_q1.multiply(qThigh))
      const qShin = dirQuat(_v2.set(knee.x, knee.y, knee.z), _v1.set(foot.x, foot.y, foot.z), true)
      _v1.set(knee.x - hip.x, knee.y - hip.y, knee.z - hip.z).applyQuaternion(_q2.copy(qThigh).invert())
      r[shinName].position.copy(_v1)
      r[shinName].quaternion.copy(_q2.multiply(qShin))
      _v1.set(foot.x - knee.x, foot.y - knee.y, foot.z - knee.z).applyQuaternion(_q1.copy(qShin).invert())
      r[footName].position.copy(_v1)
      r[footName].quaternion.copy(_q1.copy(qShin).invert())
    }
  }
}

export class Soldier {
  constructor({ scene, faction = 'british', team = 'allied', x = 0, z = 0, y = null, isPlayer = false, effects }) {
    this.scene = scene
    this.faction = faction
    this.team = team
    this.isPlayer = isPlayer
    this.effects = effects
    this.root = getTemplate(faction).clone(true)
    this.refs = {
      hips: this.root.getObjectByName('hips'),
      torso: this.root.getObjectByName('torso'),
      head: this.root.getObjectByName('head'),
      armL: this.root.getObjectByName('armL'),
      foreL: this.root.getObjectByName('foreL'),
      armR: this.root.getObjectByName('armR'),
      foreR: this.root.getObjectByName('foreR'),
      legL: this.root.getObjectByName('legL'),
      shinL: this.root.getObjectByName('shinL'),
      footL: this.root.getObjectByName('footL'),
      legR: this.root.getObjectByName('legR'),
      shinR: this.root.getObjectByName('shinR'),
      footR: this.root.getObjectByName('footR'),
      musket: this.root.getObjectByName('musket'),
    }
    this.root.position.set(x, y ?? terrainHeight(x, z), z)
    this.root.rotation.y = Math.PI
    this.facing = Math.PI
    this.scene.add(this.root)
    this.health = 100
    this.maxHealth = 100
    this.dead = false
    this.deathTime = 0
    this.ragdoll = null
    this.droppedMusket = null
    this.speed = 0
    this.walkPhase = rand(0, TAU)
    this.animTime = rand(0, 10)
    this.mode = 'idle'
    this.aiming = false
    this.crouched = false
    this.crouch = 0
    this.aimPitch = 0
    this.recoil = 0
    this.flinch = 0
    this.reloadProgress = 0
    this.meleeProgress = 0
    this.musket = this.refs.musket
    this.muzzle = this.musket.getObjectByName('muzzle')
    this.name = ''
    this.target = null
    this.lastDamageTime = -10
    this.volleyIndex = 0
  }

  setPosition(x, z) {
    this.root.position.x = x
    this.root.position.z = z
    this.root.position.y = terrainHeight(x, z)
  }

  setFacing(facing, instant = false) {
    this.facing = facing
    if (instant) this.root.rotation.y = facing
  }

  setAimAt(target, pitch = null) {
    const dx = target.x - this.root.position.x
    const dz = target.z - this.root.position.z
    this.facing = Math.atan2(dx, dz)
    if (pitch !== null) this.aimPitch = pitch
    else {
      const dy = target.y - (this.root.position.y + 1.35)
      this.aimPitch = Math.atan2(dy, Math.hypot(dx, dz))
    }
  }

  muzzleWorld() {
    return this.muzzle.getWorldPosition(new THREE.Vector3())
  }

  hitSpheres() {
    if (this.dead) return []
    const base = this.root.position
    const out = []
    const head = this.refs.head.localToWorld(new THREE.Vector3(0, 0.14, 0))
    out.push({ point: head, radius: 0.155, part: 'head' })
    const chest = this.refs.torso.localToWorld(new THREE.Vector3(0, 0.31, 0))
    out.push({ point: chest, radius: 0.27, part: 'torso' })
    const hips = this.refs.hips.localToWorld(new THREE.Vector3(0, 0.02, 0))
    out.push({ point: hips, radius: 0.25, part: 'legs' })
    return out
  }

  damage(amount, dir, hitPoint, part = 'torso', force = 4) {
    if (this.dead) return false
    this.health -= amount
    this.flinch = 1
    this.lastDamageTime = performance.now() / 1000
    if (this.effects) this.effects.blood(hitPoint.x, hitPoint.y, hitPoint.z, dir, part === 'head' ? 1.4 : 1)
    if (this.health <= 0) {
      this.die(dir, force, part)
      return true
    }
    return false
  }

  die(dir, force = 5, hitPart = 'torso') {
    if (this.dead) return
    this.dead = true
    this.deathTime = 0
    this.ragdoll = new Ragdoll(this, dir, force, hitPart)
    this.root.updateMatrixWorld(true)
    const m = this.musket
    if (m) {
      const worldPos = m.getWorldPosition(new THREE.Vector3())
      const worldQuat = m.getWorldQuaternion(new THREE.Quaternion())
      this.scene.attach(m)
      m.position.copy(worldPos)
      m.quaternion.copy(worldQuat)
      this.droppedMusket = {
        group: m,
        vx: dir.x * rand(0.5, 2.4) + rand(-0.8, 0.8),
        vy: rand(1.5, 3.6),
        vz: dir.z * rand(0.5, 2.4) + rand(-0.8, 0.8),
        sx: rand(-5, 5), sy: rand(-4, 4), sz: rand(-6, 6),
      }
      this.refs.musket = null
    }
  }

  updateDroppedMusket(dt) {
    if (!this.droppedMusket) return
    const d = this.droppedMusket
    d.vy -= 17 * dt
    d.group.position.x += d.vx * dt
    d.group.position.y += d.vy * dt
    d.group.position.z += d.vz * dt
    d.group.rotation.x += d.sx * dt
    d.group.rotation.y += d.sy * dt
    d.group.rotation.z += d.sz * dt
    const ground = terrainHeight(d.group.position.x, d.group.position.z) + 0.055
    if (d.group.position.y < ground) {
      d.group.position.y = ground
      if (d.vy < -0.6) {
        d.vy *= -0.26
        d.vx *= 0.62
        d.vz *= 0.62
        d.sx *= 0.45
        d.sy *= 0.45
        d.sz *= 0.45
      } else {
        d.vy = 0
        d.vx *= 0.85
        d.vz *= 0.85
        d.sx *= 0.7
        d.sy *= 0.7
        d.sz *= 0.7
      }
    }
    if (Math.abs(d.vx) + Math.abs(d.vy) + Math.abs(d.vz) < 0.02) d.vx = d.vy = d.vz = 0
  }

  update(dt) {
    this.updateDroppedMusket(dt)
    if (this.dead) {
      this.deathTime += dt
      if (this.ragdoll) {
        this.ragdoll.simulate(dt)
        this.ragdoll.apply(this)
      }
      return
    }

    this.animTime += dt
    this.recoil = damp(this.recoil, 0, 18, dt)
    this.flinch = damp(this.flinch, 0, 5, dt)
    this.crouch = damp(this.crouch, this.crouched ? 1 : 0, 9, dt)
    this.root.rotation.y = dampAngle(this.root.rotation.y, this.facing, this.isPlayer ? 18 : 9, dt)

    const moving = this.speed > 0.15
    if (moving) this.walkPhase += dt * (this.speed * 2.05 + 1.5)
    else this.walkPhase += dt * 0.6

    const aim = this.aiming ? 1 : 0
    const crouch = this.crouch
    const walkAmp = moving ? clamp(this.speed / 3.2, 0.35, 1.25) : 0
    const swing = Math.sin(this.walkPhase) * walkAmp * (1 - aim * 0.78) * (1 - crouch * 0.5)
    const runLean = moving ? clamp(this.speed / 6.5, 0, 0.15) : 0

    const baseHipY = lerp(0.92, 0.59, crouch)
    let hipY = baseHipY + (moving ? Math.abs(Math.sin(this.walkPhase * 2)) * 0.025 * (1 - crouch) : Math.sin(this.animTime * 1.4) * 0.006)
    let torsoRX = runLean + crouch * 0.16 + Math.sin(this.animTime * 1.25) * 0.008
    let torsoRY = 0
    let torsoRZ = moving ? Math.sin(this.walkPhase) * 0.035 : 0
    let headRX = -torsoRX * 0.5 + Math.sin(this.animTime * 1.1) * 0.01
    let headRY = moving ? Math.sin(this.walkPhase * 0.5) * 0.05 : 0

    let legLX = swing
    let legRX = -swing
    let kneeLX = Math.max(0, Math.sin(this.walkPhase + 1.2)) * 0.7 * walkAmp
    let kneeRX = Math.max(0, Math.sin(this.walkPhase + 1.2 + Math.PI)) * 0.7 * walkAmp
    let footLX = -(legLX + kneeLX) * 0.8
    let footRX = -(legRX + kneeRX) * 0.8
    let armLX = -0.44
    let armLZ = 0.47
    let foreLX = -1.3
    let armRX = 0.08
    let armRZ = -0.08
    let foreRX = -0.16
    let musketPos = [-0.23, 0.46, -0.02]
    let musketRot = [-1.36, 0.05, 0.13]

    if (moving) {
      armRX = -swing * 0.72
      armRZ = -0.08
      foreRX = -0.18 - Math.abs(swing) * 0.2
      armLX = -0.47 + swing * 0.05
      foreLX = -1.27
      headRX += Math.sin(this.walkPhase * 2) * 0.018
    }

    if (crouch > 0.02) {
      legLX = lerp(legLX, -0.92, crouch)
      legRX = lerp(legRX, -0.78, crouch)
      kneeLX = lerp(kneeLX, 1.72, crouch)
      kneeRX = lerp(kneeRX, 1.55, crouch)
      footLX = lerp(footLX, -0.72, crouch)
      footRX = lerp(footRX, -0.68, crouch)
    }

    if (aim > 0.01) {
      torsoRX = lerp(torsoRX, 0.045, aim)
      torsoRY = lerp(torsoRY, 0, aim)
      headRX = lerp(headRX, -this.aimPitch * 0.35, aim)
      headRY = lerp(headRY, 0, aim)
      armLX = lerp(armLX, -1.18, aim)
      armLZ = lerp(armLZ, 0.36, aim)
      foreLX = lerp(foreLX, -0.62, aim)
      armRX = lerp(armRX, -1.25, aim)
      armRZ = lerp(armRZ, -0.48, aim)
      foreRX = lerp(foreRX, -0.55, aim)
      musketPos = [
        lerp(musketPos[0], 0.035, aim),
        lerp(musketPos[1], 0.37, aim),
        lerp(musketPos[2], 0.12, aim),
      ]
      musketRot = [
        lerp(musketRot[0], -this.aimPitch, aim),
        lerp(musketRot[1], 0, aim),
        lerp(musketRot[2], 0, aim),
      ]
      legLX *= 1 - aim * 0.55
      legRX *= 1 - aim * 0.55
      kneeLX *= 1 - aim * 0.5
      kneeRX *= 1 - aim * 0.5
    }

    if (this.mode === 'reload') {
      const p = this.reloadProgress
      const pump = Math.sin(p * Math.PI * 5)
      musketPos = [0.1, 0.16, 0.18 + pump * 0.02]
      musketRot = [0.14, -0.18, -0.62]
      armLX = -0.9 + pump * 0.12
      armLZ = 0.55
      foreLX = -0.85
      armRX = -0.72
      armRZ = -0.36
      foreRX = -0.78
      torsoRX = 0.12
      headRX = 0.22
    }

    if (this.mode === 'melee') {
      const p = clamp(this.meleeProgress, 0, 1)
      const thrust = Math.sin(p * Math.PI)
      musketPos = [0.03, 0.34, 0.13 + thrust * 0.36]
      musketRot = [-0.06, 0, 0]
      torsoRX = 0.1 + thrust * 0.16
      armLX = -1.25 - thrust * 0.2
      armLZ = 0.28
      foreLX = -0.42
      armRX = -1.3 - thrust * 0.15
      armRZ = -0.4
      foreRX = -0.48
    }

    if (this.recoil > 0.01) {
      const r = this.recoil
      musketPos[2] -= r * 0.13
      musketRot[0] += r * 0.2
      torsoRX -= r * 0.05
      armRX -= r * 0.08
    }
    if (this.flinch > 0.01) {
      torsoRX -= Math.sin(this.flinch * Math.PI) * 0.2
      headRX -= Math.sin(this.flinch * Math.PI) * 0.22
      torsoRZ += Math.sin(this.flinch * Math.PI * 2) * 0.06
    }

    const r = this.refs
    r.hips.position.y = damp(r.hips.position.y, hipY, 13, dt)
    r.torso.rotation.x = damp(r.torso.rotation.x, torsoRX, 11, dt)
    r.torso.rotation.y = damp(r.torso.rotation.y, torsoRY, 11, dt)
    r.torso.rotation.z = damp(r.torso.rotation.z, torsoRZ, 11, dt)
    r.head.rotation.x = damp(r.head.rotation.x, headRX, 10, dt)
    r.head.rotation.y = damp(r.head.rotation.y, headRY, 10, dt)
    r.legL.rotation.x = damp(r.legL.rotation.x, legLX, 13, dt)
    r.legR.rotation.x = damp(r.legR.rotation.x, legRX, 13, dt)
    r.shinL.rotation.x = damp(r.shinL.rotation.x, kneeLX, 13, dt)
    r.shinR.rotation.x = damp(r.shinR.rotation.x, kneeRX, 13, dt)
    r.footL.rotation.x = damp(r.footL.rotation.x, footLX, 13, dt)
    r.footR.rotation.x = damp(r.footR.rotation.x, footRX, 13, dt)
    r.armL.rotation.x = damp(r.armL.rotation.x, armLX, 12, dt)
    r.armL.rotation.z = damp(r.armL.rotation.z, armLZ, 12, dt)
    r.foreL.rotation.x = damp(r.foreL.rotation.x, foreLX, 12, dt)
    r.armR.rotation.x = damp(r.armR.rotation.x, armRX, 12, dt)
    r.armR.rotation.z = damp(r.armR.rotation.z, armRZ, 12, dt)
    r.foreR.rotation.x = damp(r.foreR.rotation.x, foreRX, 12, dt)

    if (r.musket) {
      r.musket.position.x = damp(r.musket.position.x, musketPos[0], 13, dt)
      r.musket.position.y = damp(r.musket.position.y, musketPos[1], 13, dt)
      r.musket.position.z = damp(r.musket.position.z, musketPos[2], 13, dt)
      r.musket.rotation.x = damp(r.musket.rotation.x, musketRot[0], 13, dt)
      r.musket.rotation.y = damp(r.musket.rotation.y, musketRot[1], 13, dt)
      r.musket.rotation.z = damp(r.musket.rotation.z, musketRot[2], 13, dt)
    }

    if (this.mode === 'melee') this.meleeProgress = Math.min(1, this.meleeProgress + dt * 2.2)
  }

  fireAnimation() {
    this.recoil = 1
  }
}
