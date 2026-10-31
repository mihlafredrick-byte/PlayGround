import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  clamp, fbm, smoothstep, rand, randInt, TAU, makeGrassTexture, makeStoneTexture,
  makeWoodTexture, makeRoofTexture, makeFlagTexture, makeGroundTexture,
} from './utils.js'

export function terrainHeight(x, z) {
  const rolling =
    Math.sin(x * 0.055 + 1.2) * 0.38 +
    Math.cos(z * 0.047 - 0.4) * 0.3 +
    Math.sin((x + z) * 0.031) * 0.24 +
    Math.cos(x * 0.12 - z * 0.085) * 0.09
  const dist = Math.hypot(x * 0.9, (z + 6) * 0.72)
  const flat = smoothstep(7, 42, dist)
  return rolling * flat + 0.02
}

const _m4 = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _v = new THREE.Vector3()
const _s = new THREE.Vector3()
const _e = new THREE.Euler()

function addBox(parent, size, pos, mat, rot = null, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat)
  mesh.position.set(pos[0], pos[1], pos[2])
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2])
  mesh.castShadow = cast
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function addCylinder(parent, rt, rb, h, seg, pos, mat, rot = null, cast = true) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat)
  mesh.position.set(pos[0], pos[1], pos[2])
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2])
  mesh.castShadow = cast
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function makeSky(scene) {
  const uniforms = {
    uSun: { value: new THREE.Vector3(-0.55, 0.22, -0.8).normalize() },
    uTime: { value: 0 },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uSun;
      uniform float uTime;
      varying vec3 vWorld;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = p * 2.03 + 7.1;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorld - cameraPosition);
        float h = clamp(dir.y, -0.08, 1.0);
        vec3 horizon = vec3(0.61, 0.45, 0.3);
        vec3 mid = vec3(0.33, 0.42, 0.51);
        vec3 zenith = vec3(0.1, 0.2, 0.37);
        vec3 sky = mix(horizon, mid, smoothstep(-0.02, 0.32, h));
        sky = mix(sky, zenith, smoothstep(0.2, 0.95, h));

        float sunAmt = max(dot(dir, uSun), 0.0);
        sky += vec3(1.0, 0.48, 0.18) * pow(sunAmt, 5.0) * 0.12;
        sky += vec3(1.0, 0.82, 0.56) * pow(sunAmt, 90.0) * 0.55;
        sky += vec3(1.0, 0.94, 0.78) * smoothstep(0.9992, 0.9998, sunAmt) * 1.8;

        vec2 cloudUV = dir.xz / max(0.12, dir.y + 0.22);
        cloudUV *= 1.1;
        cloudUV.x += uTime * 0.0025;
        float c = fbm(cloudUV * 1.25 + vec2(2.3, 0.4));
        c = smoothstep(0.48, 0.76, c);
        float cloudFade = smoothstep(0.03, 0.24, h) * (1.0 - smoothstep(0.72, 1.0, h));
        vec3 cloudCol = mix(vec3(0.48, 0.42, 0.38), vec3(0.9, 0.68, 0.5), pow(sunAmt, 0.6));
        sky = mix(sky, cloudCol, c * 0.62 * cloudFade);

        float haze = 1.0 - smoothstep(-0.02, 0.2, h);
        sky = mix(sky, vec3(0.52, 0.41, 0.3), haze * 0.5);

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(380, 48, 24), mat)
  sky.frustumCulled = false
  sky.renderOrder = -100
  scene.add(sky)
  return { mesh: sky, uniforms }
}

function makeTerrain(scene) {
  const size = 280
  const seg = 190
  const geo = new THREE.PlaneGeometry(size, size, seg, seg)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const cGrassA = new THREE.Color('#596f36')
  const cGrassB = new THREE.Color('#7e8a45')
  const cGrassC = new THREE.Color('#3f522b')
  const cDirt = new THREE.Color('#77603f')
  const cDirt2 = new THREE.Color('#5d4a32')
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const y = terrainHeight(x, z)
    pos.setY(i, y)
    const n = fbm(x * 0.13 + 3.1, z * 0.13 - 1.4, 4)
    c.copy(cGrassA).lerp(cGrassB, smoothstep(0.25, 0.8, n))
    if (n < 0.35) c.lerp(cGrassC, 0.45)
    const roadCenter = Math.sin(z * 0.055) * 2.4 + 1.2
    const road = 1 - smoothstep(1.3, 3.4, Math.abs(x - roadCenter))
    if (road > 0) {
      c.lerp(cDirt, road * (0.55 + n * 0.3))
      if (n < 0.4) c.lerp(cDirt2, road * 0.35)
    }
    const worn = smoothstep(4.5, 9, Math.abs(z + 8)) * (1 - smoothstep(13, 26, Math.abs(x)))
    if (worn > 0) c.lerp(cDirt2, worn * 0.16)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const groundTex = makeGroundTexture()
  const mat = new THREE.MeshStandardMaterial({ map: groundTex, vertexColors: true, roughness: 1, metalness: 0 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  scene.add(mesh)
  return mesh
}

function makeGrass(scene) {
  const tex = makeGrassTexture('#657f3a')
  const plane = new THREE.PlaneGeometry(0.48, 0.52)
  plane.translate(0, 0.26, 0)
  const plane2 = plane.clone()
  plane2.rotateY(Math.PI / 2)
  const geo = mergeGeometries([plane, plane2])
  const mat = new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.38, side: THREE.DoubleSide, roughness: 1,
    color: 0xffffff, depthWrite: true,
  })
  const shaderRef = { value: null }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      'uniform float uTime;\nvoid main() {'
    ).replace(
      '#include <begin_vertex>',
      /* glsl */`
        #include <begin_vertex>
        float wx = instanceMatrix[3].x;
        float wz = instanceMatrix[3].z;
        float bend = uv.y * uv.y;
        transformed.x += sin(uTime * 1.55 + wx * 0.65 + wz * 0.35) * 0.09 * bend;
        transformed.z += cos(uTime * 1.28 + wz * 0.55 + wx * 0.2) * 0.05 * bend;
      `
    )
    shaderRef.value = shader
  }
  mat.customProgramCacheKey = () => 'grass-wind-v1'

  const count = 16000
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.receiveShadow = true
  const color = new THREE.Color()
  for (let i = 0; i < count; i++) {
    let x = rand(-55, 55)
    let z = rand(-60, 30)
    const d = Math.hypot(x, z + 8)
    if (d < 4) {
      x += rand(-8, 8)
      z += rand(-8, 8)
    }
    const roadCenter = Math.sin(z * 0.055) * 2.4 + 1.2
    if (Math.abs(x - roadCenter) < 2.4) x += rand(5, 10) * (x < roadCenter ? -1 : 1)
    const y = terrainHeight(x, z)
    const s = rand(0.42, 0.95)
    _e.set(rand(-0.08, 0.08), rand(0, TAU), rand(-0.08, 0.08))
    _q.setFromEuler(_e)
    _m4.compose(_v.set(x, y, z), _q, _s.set(s * rand(0.8, 1.25), s, s * rand(0.8, 1.25)))
    mesh.setMatrixAt(i, _m4)
    color.setHSL(0.175 + rand(-0.02, 0.035), rand(0.28, 0.52), rand(0.27, 0.44))
    mesh.setColorAt(i, color)
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  scene.add(mesh)

  // Wheat drifts along the edges of the field.
  const wheatTex = makeGrassTexture('#b59a55')
  const wheatMat = new THREE.MeshStandardMaterial({
    map: wheatTex, alphaTest: 0.34, side: THREE.DoubleSide, roughness: 1, color: 0xffffff,
  })
  const wheatShaderRef = { value: null }
  wheatMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      'uniform float uTime;\nvoid main() {'
    ).replace(
      '#include <begin_vertex>',
      /* glsl */`
        #include <begin_vertex>
        float wx = instanceMatrix[3].x;
        float wz = instanceMatrix[3].z;
        float bend = uv.y * uv.y;
        transformed.x += sin(uTime * 1.2 + wx * 0.35 + wz * 0.24) * 0.12 * bend;
        transformed.z += cos(uTime * 0.95 + wz * 0.4) * 0.06 * bend;
      `
    )
    wheatShaderRef.value = shader
  }
  wheatMat.customProgramCacheKey = () => 'wheat-wind-v1'
  const wheatGeo = new THREE.PlaneGeometry(0.5, 0.82)
  wheatGeo.translate(0, 0.41, 0)
  const wheatGeo2 = wheatGeo.clone()
  wheatGeo2.rotateY(Math.PI / 2)
  const wheatMerged = mergeGeometries([wheatGeo, wheatGeo2])
  const wheatCount = 5200
  const wheat = new THREE.InstancedMesh(wheatMerged, wheatMat, wheatCount)
  for (let i = 0; i < wheatCount; i++) {
    let x, z
    if (i % 3 === 0) { x = rand(16, 48); z = rand(-35, 18) }
    else if (i % 3 === 1) { x = rand(-52, -16); z = rand(-40, 18) }
    else { x = rand(-45, 45); z = rand(-62, -35) }
    const y = terrainHeight(x, z)
    const s = rand(0.8, 1.35)
    _e.set(rand(-0.04, 0.04), rand(0, TAU), rand(-0.04, 0.04))
    _q.setFromEuler(_e)
    _m4.compose(_v.set(x, y, z), _q, _s.set(s, s, s))
    wheat.setMatrixAt(i, _m4)
    color.setHSL(0.13 + rand(-0.02, 0.025), rand(0.25, 0.5), rand(0.33, 0.5))
    wheat.setColorAt(i, color)
  }
  wheat.instanceMatrix.needsUpdate = true
  if (wheat.instanceColor) wheat.instanceColor.needsUpdate = true
  scene.add(wheat)
  return { shaderRef, wheatShaderRef }
}

function createTree(scene, x, z, scale = 1, type = 'oak', lowDetail = false) {
  const group = new THREE.Group()
  const y = terrainHeight(x, z)
  group.position.set(x, y, z)
  group.rotation.y = rand(0, TAU)
  const bark = new THREE.MeshStandardMaterial({ color: 0x3e2f22, roughness: 1 })
  const trunkH = 3.2 * scale
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale, 0.34 * scale, trunkH, 7), bark)
  trunk.position.y = trunkH / 2
  trunk.castShadow = true
  trunk.receiveShadow = true
  group.add(trunk)

  if (!lowDetail) {
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.14 * scale, 2.1 * scale, 5), bark)
      b.position.set(rand(-0.5, 0.5) * scale, trunkH * rand(0.55, 0.85), rand(-0.5, 0.5) * scale)
      b.rotation.z = rand(-0.8, 0.8)
      b.rotation.x = rand(-0.8, 0.8)
      b.castShadow = true
      group.add(b)
    }
  }

  const palette = type === 'autumn'
    ? [0x655a22, 0x746327, 0x4c5d29, 0x806a2d]
    : [0x293f26, 0x344d2a, 0x243a21, 0x40552b, 0x304728]
  const clumps = lowDetail ? 3 : 7
  for (let i = 0; i < clumps; i++) {
    const r = rand(0.9, 1.65) * scale * (lowDetail ? 0.82 : 1)
    const mat = new THREE.MeshStandardMaterial({
      color: palette[randInt(0, palette.length - 1)], roughness: 0.98, flatShading: true,
    })
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat)
    mesh.position.set(rand(-1.0, 1.0) * scale, trunkH + rand(-0.35, 1.45) * scale, rand(-0.95, 0.95) * scale)
    mesh.scale.set(rand(0.9, 1.3), rand(0.65, 1.0), rand(0.9, 1.3))
    mesh.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU))
    mesh.castShadow = !lowDetail
    mesh.receiveShadow = true
    group.add(mesh)
  }
  scene.add(group)
  return group
}

function createFarmhouse(scene) {
  const group = new THREE.Group()
  group.position.set(-20, terrainHeight(-20, -18), -18)
  group.rotation.y = 0.24
  scene.add(group)

  const stone = new THREE.MeshStandardMaterial({ map: makeStoneTexture(), roughness: 0.98, color: 0xcfc9ba })
  const plaster = new THREE.MeshStandardMaterial({ color: 0xb9ab8d, roughness: 1 })
  const timber = new THREE.MeshStandardMaterial({ color: 0x3c2b1d, roughness: 1 })
  const roofMat = new THREE.MeshStandardMaterial({ map: makeRoofTexture(), roughness: 0.9, color: 0xb28c72 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a211e, roughness: 0.2, metalness: 0.2, emissive: 0x1a1308, emissiveIntensity: 0.5 })

  addBox(group, [11, 3.0, 7], [0, 1.5, 0], stone)
  addBox(group, [11.2, 3.2, 7.2], [0, 4.5, 0], plaster)
  addBox(group, [11.6, 0.28, 7.6], [0, 6.1, 0], timber)
  addBox(group, [0.3, 3.1, 7.25], [-4.1, 4.5, 0], timber)
  addBox(group, [0.3, 3.1, 7.25], [4.1, 4.5, 0], timber)
  addBox(group, [0.25, 3.1, 7.3], [0, 4.5, 0], timber)
  addBox(group, [11.25, 0.3, 7.3], [0, 4.5, 0], timber)

  const roofL = addBox(group, [7.8, 0.26, 4.8], [-2.4, 7.15, 0], roofMat, [0, 0, -0.55])
  const roofR = addBox(group, [7.8, 0.26, 4.8], [2.4, 7.15, 0], roofMat, [0, 0, 0.55])
  roofL.castShadow = roofR.castShadow = true

  // Gable ends.
  const gableShape = new THREE.Shape()
  gableShape.moveTo(-3.6, 0)
  gableShape.lineTo(0, 3.4)
  gableShape.lineTo(3.6, 0)
  gableShape.closePath()
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.22, bevelEnabled: false })
  const gableMat = new THREE.MeshStandardMaterial({ color: 0xa8997d, roughness: 1 })
  const g1 = new THREE.Mesh(gableGeo, gableMat)
  g1.position.set(-5.55, 6.1, 0)
  g1.rotation.y = Math.PI / 2
  g1.castShadow = true
  group.add(g1)
  const g2 = g1.clone()
  g2.position.x = 5.55
  group.add(g2)

  addBox(group, [1.2, 2.0, 1.2], [3.1, 7.9, -1.4], stone)
  addBox(group, [1.45, 0.25, 1.45], [3.1, 8.98, -1.4], timber)

  // Door and windows.
  addBox(group, [1.4, 2.35, 0.16], [0, 1.2, 3.53], timber)
  addBox(group, [1.1, 2.05, 0.1], [0, 1.13, 3.63], new THREE.MeshStandardMaterial({ color: 0x26180e, roughness: 0.9 }))
  addBox(group, [1.3, 0.14, 0.3], [0, 2.5, 3.7], timber)
  for (const wx of [-3.6, 3.6]) {
    for (const wy of [1.55, 4.6]) {
      addBox(group, [1.3, 1.45, 0.1], [wx, wy, 3.58], glass, null, false)
      addBox(group, [1.48, 0.12, 0.16], [wx, wy + 0.78, 3.63], timber, null, false)
      addBox(group, [1.48, 0.12, 0.16], [wx, wy - 0.78, 3.63], timber, null, false)
      addBox(group, [0.12, 1.55, 0.16], [wx - 0.72, wy, 3.63], timber, null, false)
      addBox(group, [0.12, 1.55, 0.16], [wx + 0.72, wy, 3.63], timber, null, false)
    }
  }

  // Low stone garden wall with a gap.
  const wallMat = new THREE.MeshStandardMaterial({ map: makeStoneTexture(), roughness: 1, color: 0xb8b0a1 })
  addBox(group, [8, 1.0, 0.55], [-3.2, 0.5, 5.2], wallMat)
  addBox(group, [5, 1.0, 0.55], [6.5, 0.5, 5.2], wallMat)
  addBox(group, [0.8, 1.4, 0.8], [-7.1, 0.7, 5.2], wallMat)
  addBox(group, [0.8, 1.4, 0.8], [8.9, 0.7, 5.2], wallMat)

  return group
}

function createBarn(scene) {
  const group = new THREE.Group()
  group.position.set(33, terrainHeight(33, -20), -20)
  group.rotation.y = -0.2
  scene.add(group)
  const wood = new THREE.MeshStandardMaterial({ map: makeWoodTexture(), roughness: 1, color: 0x8f7251 })
  const roofMat = new THREE.MeshStandardMaterial({ map: makeRoofTexture(), roughness: 0.95, color: 0x9c7963 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x24160c, roughness: 1 })
  addBox(group, [9, 4.2, 6], [0, 2.1, 0], wood)
  addBox(group, [9.1, 0.24, 6.1], [0, 4.35, 0], dark)
  addBox(group, [5.4, 0.22, 3.6], [-2.0, 5.5, 0], roofMat, [0, 0, -0.62])
  addBox(group, [5.4, 0.22, 3.6], [2.0, 5.5, 0], roofMat, [0, 0, 0.62])
  addBox(group, [2.3, 3.3, 0.18], [0, 1.65, 3.04], dark)
  addBox(group, [2.5, 0.15, 0.3], [0, 3.4, 3.1], wood)
  for (let i = 0; i < 4; i++) addBox(group, [0.2, 4.1, 0.2], [-3.4 + i * 2.25, 2.1, 3.02], dark, null, false)
  return group
}

function createFences(scene) {
  const wood = new THREE.MeshStandardMaterial({ map: makeWoodTexture(), roughness: 1, color: 0x7d6345 })
  const parts = []
  function segment(x1, z1, x2, z2, yOff = 0) {
    const dx = x2 - x1
    const dz = z2 - z1
    const len = Math.hypot(dx, dz)
    const angle = Math.atan2(dx, dz)
    const count = Math.max(2, Math.round(len / 2.5))
    for (let i = 0; i <= count; i++) {
      const t = i / count
      const x = x1 + dx * t
      const z = z1 + dz * t
      const y = terrainHeight(x, z) + 0.55
      const g = new THREE.BoxGeometry(0.14, 1.2, 0.14)
      g.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(x, y + yOff, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(-0.04, 0.04), angle, rand(-0.04, 0.04))),
        new THREE.Vector3(1, 1, 1)
      ))
      parts.push(g)
    }
    for (let r = 0; r < 3; r++) {
      const g = new THREE.BoxGeometry(0.1, 0.13, len)
      const midX = (x1 + x2) / 2
      const midZ = (z1 + z2) / 2
      const y = terrainHeight(midX, midZ) + 0.35 + r * 0.34 + yOff
      g.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(midX, y, midZ),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)),
        new THREE.Vector3(1, 1, 1)
      ))
      parts.push(g)
    }
  }
  segment(-18, -3.5, -9.5, -3.1)
  segment(9.5, -3.1, 18, -3.8)
  segment(-19, 4.5, -12, 4.5)
  segment(12, 4.2, 20, 4.4)
  segment(18, 2, 18, -14)
  segment(-21, 2, -21, -15)
  const merged = mergeGeometries(parts)
  const mesh = new THREE.Mesh(merged, wood)
  mesh.castShadow = true
  mesh.receiveShadow = true
  scene.add(mesh)
}

function createFlags(scene) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x5b4a33, roughness: 0.9 })
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xb89547, metalness: 0.5, roughness: 0.45 })
  const flags = []
  const defs = [
    { x: -4.8, z: -0.2, kind: 'king', scale: 1.1 },
    { x: 4.8, z: -0.2, kind: 'regimental', scale: 1.0 },
  ]
  for (const d of defs) {
    const y = terrainHeight(d.x, d.z)
    const group = new THREE.Group()
    group.position.set(d.x, y, d.z)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 3.7, 6), poleMat)
    pole.position.y = 1.85
    pole.castShadow = true
    group.add(pole)
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), goldMat)
    finial.position.y = 3.75
    group.add(finial)
    const geo = new THREE.PlaneGeometry(1.7 * d.scale, 1.1 * d.scale, 22, 12)
    geo.translate(0.85 * d.scale, 0, 0)
    const mat = new THREE.MeshStandardMaterial({
      map: makeFlagTexture(d.kind), side: THREE.DoubleSide, roughness: 0.92,
      transparent: true, alphaTest: 0.02,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(0.04, 3.12, 0)
    mesh.castShadow = true
    group.add(mesh)
    const basePositions = geo.attributes.position.array.slice()
    flags.push({ mesh, basePositions, phase: rand(0, TAU), scale: d.scale })
    scene.add(group)
  }
  return flags
}

function createCannon(scene, x, z, facing = 0) {
  const group = new THREE.Group()
  group.position.set(x, terrainHeight(x, z), z)
  group.rotation.y = facing
  scene.add(group)
  const iron = new THREE.MeshStandardMaterial({ color: 0x242626, roughness: 0.5, metalness: 0.7 })
  const wood = new THREE.MeshStandardMaterial({ map: makeWoodTexture(), color: 0x8a6841, roughness: 0.9 })
  const brass = new THREE.MeshStandardMaterial({ color: 0xa7833e, roughness: 0.4, metalness: 0.7 })

  const barrel = new THREE.Group()
  barrel.position.set(0, 0.95, 0.2)
  group.add(barrel)
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.23, 2.5, 14), iron)
  tube.rotation.x = Math.PI / 2
  tube.position.z = 0.55
  tube.castShadow = true
  barrel.add(tube)
  for (const zz of [0.15, 1.25, 1.7]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(zz > 1 ? 0.16 : 0.2, 0.025, 6, 14), brass)
    ring.position.z = zz
    ring.castShadow = true
    barrel.add(ring)
  }
  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0, 1.82)
  barrel.add(muzzle)
  const touch = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), brass)
  touch.position.set(0, 0.19, -0.4)
  barrel.add(touch)

  const carriage = new THREE.Group()
  group.add(carriage)
  addBox(carriage, [0.55, 0.34, 2.1], [0, 0.62, 0.05], wood)
  addBox(carriage, [1.35, 0.28, 1.1], [0, 0.62, -0.2], wood)
  addBox(carriage, [0.16, 0.8, 0.16], [-0.42, 0.48, 0.55], wood)
  addBox(carriage, [0.16, 0.8, 0.16], [0.42, 0.48, 0.55], wood)

  const wheelGeoParts = []
  const torus = new THREE.TorusGeometry(0.57, 0.055, 6, 18)
  wheelGeoParts.push(torus)
  for (let i = 0; i < 8; i++) {
    const spoke = new THREE.BoxGeometry(0.045, 1.05, 0.05)
    spoke.applyMatrix4(new THREE.Matrix4().makeRotationZ((i / 8) * Math.PI))
    wheelGeoParts.push(spoke)
  }
  const hub = new THREE.CylinderGeometry(0.12, 0.12, 0.16, 8)
  hub.rotateX(Math.PI / 2)
  wheelGeoParts.push(hub)
  const wheelGeo = mergeGeometries(wheelGeoParts)
  for (const wx of [-0.8, 0.8]) {
    const wheel = new THREE.Mesh(wheelGeo, wood)
    wheel.position.set(wx, 0.57, -0.05)
    wheel.rotation.y = Math.PI / 2
    wheel.castShadow = true
    group.add(wheel)
  }
  return { group, barrel, muzzle, baseZ: 0.2, recoil: 0 }
}

function createDistantHills(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x53604a, roughness: 1, flatShading: true })
  const mat2 = new THREE.MeshStandardMaterial({ color: 0x6b6d50, roughness: 1, flatShading: true })
  for (let i = 0; i < 11; i++) {
    const x = -130 + i * 28 + rand(-9, 9)
    const z = -135 - rand(0, 40)
    const r = rand(28, 46)
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), i % 2 ? mat : mat2)
    mesh.position.set(x, -r * 0.55 + rand(-1, 3), z)
    mesh.scale.y = rand(0.22, 0.4)
    mesh.rotation.y = rand(0, TAU)
    scene.add(mesh)
  }
}

function createTreeLine(scene) {
  for (let i = 0; i < 42; i++) {
    const x = -80 + i * 4 + rand(-2, 2)
    const z = -72 - rand(0, 16)
    createTree(scene, x, z, rand(0.7, 1.15), 'oak', true)
  }
  for (let i = 0; i < 16; i++) {
    createTree(scene, -65 + rand(-5, 5), -35 + i * 4, rand(0.9, 1.35), 'oak', true)
    createTree(scene, 65 + rand(-5, 5), -35 + i * 4, rand(0.9, 1.35), 'oak', true)
  }
  // Mid-ground clumps give the horizon depth behind the French line.
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1
    createTree(scene, side * rand(13, 42), -31 - rand(0, 13), rand(0.85, 1.45), i % 3 ? 'oak' : 'autumn', true)
  }
}

function createHedgerow(scene) {
  const geo = new THREE.IcosahedronGeometry(1, 0)
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a4d2c, roughness: 1, flatShading: true })
  const count = 170
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.receiveShadow = true
  const color = new THREE.Color()
  for (let i = 0; i < count; i++) {
    let x, z
    if (i < count * 0.46) { x = rand(-46, -11); z = -25.5 - rand(0, 3.2) }
    else if (i < count * 0.92) { x = rand(11, 46); z = -25.5 - rand(0, 3.2) }
    else { x = rand(-9, 9); z = -29 - rand(0, 4) }
    const y = terrainHeight(x, z)
    const s = rand(0.7, 1.55)
    _e.set(rand(-0.1, 0.1), rand(0, TAU), rand(-0.1, 0.1))
    _q.setFromEuler(_e)
    _m4.compose(
      _v.set(x, y + s * 0.42, z), _q,
      _s.set(s * rand(1.3, 2.3), s * rand(0.6, 1.05), s * rand(0.9, 1.7))
    )
    mesh.setMatrixAt(i, _m4)
    color.setHSL(0.21 + rand(-0.025, 0.025), rand(0.22, 0.42), rand(0.15, 0.27))
    mesh.setColorAt(i, color)
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  scene.add(mesh)
}

function createOrchard(scene) {
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = 22 + row * 4.7 + rand(-0.7, 0.7)
      const z = 4 - col * 4.9 + rand(-0.6, 0.6)
      createTree(scene, x, z, rand(0.65, 0.95), col % 2 ? 'autumn' : 'oak', false)
    }
  }
  createTree(scene, -33, 12, 1.5, 'oak')
  createTree(scene, -30, -25, 1.25, 'autumn')
  createTree(scene, 27, -9, 1.25, 'oak')
}

function makeDistantCrowd(scene) {
  // A hazy second line of troops in the distance, built cheaply from boxes and pikes.
  const coat = new THREE.MeshStandardMaterial({ color: 0x303c63, roughness: 1 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x15191f, roughness: 1 })
  const group = new THREE.Group()
  for (let i = 0; i < 70; i++) {
    const x = -30 + rand(0, 60)
    const z = -62 - rand(0, 10)
    const h = rand(1.55, 1.85)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, h * 0.55, 0.25), coat)
    body.position.set(x, terrainHeight(x, z) + h * 0.58, z)
    group.add(body)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 5, 4), dark)
    head.position.set(x, terrainHeight(x, z) + h * 0.94, z)
    group.add(head)
    const bayonet = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.2, 0.012), dark)
    bayonet.position.set(x + rand(-0.2, 0.2), terrainHeight(x, z) + h * 0.95, z - 0.3)
    group.add(bayonet)
  }
  scene.add(group)
}

export class World {
  constructor(scene) {
    this.scene = scene
    this.colliders = []
    this.cannons = []
    this.time = 0
    this.sky = makeSky(scene)
    makeTerrain(scene)
    const wind = makeGrass(scene)
    this.grassShader = wind.shaderRef
    this.wheatShader = wind.wheatShaderRef
    createDistantHills(scene)
    createTreeLine(scene)
    createHedgerow(scene)
    createOrchard(scene)
    createFarmhouse(scene)
    createBarn(scene)
    createFences(scene)
    makeDistantCrowd(scene)
    this.flags = createFlags(scene)
    this.cannons.push(createCannon(scene, -14.5, 1.8, Math.PI + 0.08))
    this.cannons.push(createCannon(scene, 18, -47, 0.12))

    // Collision volumes for the large structures and trunks.
    this.colliders.push({ type: 'box', x: -20, z: -18, hx: 5.9, hz: 3.9, rot: 0.24 })
    this.colliders.push({ type: 'box', x: 33, z: -20, hx: 4.8, hz: 3.3, rot: -0.2 })
    this.colliders.push({ type: 'circle', x: -33, z: 12, r: 0.6 })
    this.colliders.push({ type: 'circle', x: -30, z: -25, r: 0.5 })
    this.colliders.push({ type: 'circle', x: 27, z: -9, r: 0.5 })
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        this.colliders.push({ type: 'circle', x: 22 + row * 4.7, z: 4 - col * 4.9, r: 0.38 })
      }
    }

    // Stone wall in front of the allied line, broken by a gate.
    this.colliders.push({ type: 'box', x: -13, z: -3.4, hx: 4.6, hz: 0.55, rot: 0 })
    this.colliders.push({ type: 'box', x: 13, z: -3.4, hx: 4.6, hz: 0.55, rot: 0 })
  }

  update(dt, time) {
    this.time = time
    if (this.grassShader.value) this.grassShader.value.uniforms.uTime.value = time
    if (this.wheatShader.value) this.wheatShader.value.uniforms.uTime.value = time
    this.sky.uniforms.uTime.value = time

    for (const f of this.flags) {
      const pos = f.mesh.geometry.attributes.position
      const arr = pos.array
      for (let i = 0; i < pos.count; i++) {
        const x = f.basePositions[i * 3]
        const y = f.basePositions[i * 3 + 1]
        const u = x / (1.7 * f.scale)
        const wave = Math.sin(x * 4.2 - time * 5.2 + f.phase) * 0.13 + Math.sin(x * 8.1 - time * 8.4 + f.phase) * 0.045
        arr[i * 3 + 2] = wave * u * f.scale
        arr[i * 3 + 1] = y + Math.sin(x * 3.1 - time * 4.1 + f.phase) * 0.045 * u * f.scale
      }
      pos.needsUpdate = true
      f.mesh.geometry.computeVertexNormals()
    }

    for (const c of this.cannons) {
      if (c.recoil > 0) {
        c.recoil = Math.max(0, c.recoil - dt * 1.9)
        const kick = Math.sin(Math.min(1, c.recoil) * Math.PI) * 0.42
        c.barrel.position.z = c.baseZ - kick
        c.barrel.rotation.x = -kick * 0.14
      } else {
        c.barrel.position.z = c.baseZ
        c.barrel.rotation.x = 0
      }
    }
  }

  cannonMuzzle(cannon) {
    return cannon.muzzle.getWorldPosition(new THREE.Vector3())
  }

  fireCannon(cannon) {
    cannon.recoil = 1
  }

  resolveCollisions(pos, radius = 0.32) {
    for (const c of this.colliders) {
      if (c.type === 'circle') {
        const dx = pos.x - c.x
        const dz = pos.z - c.z
        const d = Math.hypot(dx, dz)
        const min = c.r + radius
        if (d < min && d > 0.0001) {
          pos.x = c.x + (dx / d) * min
          pos.z = c.z + (dz / d) * min
        }
      } else {
        const cos = Math.cos(-c.rot)
        const sin = Math.sin(-c.rot)
        let dx = pos.x - c.x
        let dz = pos.z - c.z
        let lx = dx * cos - dz * sin
        let lz = dx * sin + dz * cos
        const px = c.hx + radius - Math.abs(lx)
        const pz = c.hz + radius - Math.abs(lz)
        if (px > 0 && pz > 0) {
          if (px < pz) lx += Math.sign(lx || 1) * px
          else lz += Math.sign(lz || 1) * pz
          const cos2 = Math.cos(c.rot)
          const sin2 = Math.sin(c.rot)
          pos.x = c.x + lx * cos2 - lz * sin2
          pos.z = c.z + lx * sin2 + lz * cos2
        }
      }
    }
    return pos
  }
}
