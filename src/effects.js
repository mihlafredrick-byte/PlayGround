import * as THREE from 'three'
import { makeSmokeTexture, makeFlashTexture, makeBloodTexture, makeMuzzleLightTexture, rand, clamp, TAU } from './utils.js'

const softVertex = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (uScale / max(0.1, -mv.z));
    gl_Position = projectionMatrix * mv;
    vAlpha = aAlpha;
    vColor = aColor;
  }
`

const softFragment = /* glsl */`
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float a = tex.a * vAlpha;
    if (a < 0.008) discard;
    gl_FragColor = vec4(vColor * tex.rgb, a);
  }
`

class SoftParticles {
  constructor(scene, count, texture, blending = THREE.NormalBlending) {
    this.count = count
    this.cursor = 0
    this.parts = []
    const geo = new THREE.BufferGeometry()
    this.positions = new Float32Array(count * 3)
    this.sizes = new Float32Array(count)
    this.alphas = new Float32Array(count)
    this.colors = new Float32Array(count * 3)
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage))
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uScale: { value: 540 },
      },
      vertexShader: softVertex,
      fragmentShader: softFragment,
      transparent: true,
      depthWrite: false,
      blending,
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
    scene.add(this.points)
    for (let i = 0; i < count; i++) {
      this.parts.push({
        active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1, size0: 1, size1: 2, alpha: 0,
        r: 1, g: 1, b: 1, drag: 0.8, gravity: 0, rise: 0, phase: 0,
      })
    }
  }

  spawn(o) {
    const p = this.parts[this.cursor]
    this.cursor = (this.cursor + 1) % this.count
    p.active = true
    p.x = o.x; p.y = o.y; p.z = o.z
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.vz = o.vz ?? 0
    p.life = 0
    p.maxLife = o.life ?? 2
    p.size0 = o.size0 ?? 1
    p.size1 = o.size1 ?? 2
    p.alpha = o.alpha ?? 0.5
    p.r = o.r ?? 0.8; p.g = o.g ?? 0.8; p.b = o.b ?? 0.8
    p.drag = o.drag ?? 0.8
    p.gravity = o.gravity ?? 0
    p.rise = o.rise ?? 0
    p.phase = Math.random() * TAU
    p.wind = o.wind ?? 0.15
    return p
  }

  update(dt, time) {
    const pos = this.positions, sizes = this.sizes, alphas = this.alphas, colors = this.colors
    for (let i = 0; i < this.count; i++) {
      const p = this.parts[i]
      const i3 = i * 3
      if (!p.active) {
        alphas[i] = 0
        continue
      }
      p.life += dt
      const t = p.life / p.maxLife
      if (t >= 1) {
        p.active = false
        alphas[i] = 0
        continue
      }
      const drag = Math.exp(-p.drag * dt)
      p.vx *= drag
      p.vz *= drag
      p.vy = p.vy * drag + (p.rise - p.gravity) * dt
      p.vx += Math.sin(time * 0.7 + p.phase) * p.wind * dt
      p.vz += Math.cos(time * 0.55 + p.phase) * p.wind * 0.6 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      pos[i3] = p.x; pos[i3 + 1] = p.y; pos[i3 + 2] = p.z
      sizes[i] = p.size0 + (p.size1 - p.size0) * Math.pow(t, 0.55)
      const fadeIn = clamp(t / 0.09, 0, 1)
      const fadeOut = 1 - clamp((t - 0.5) / 0.5, 0, 1)
      alphas[i] = p.alpha * fadeIn * fadeOut * (0.7 + 0.3 * Math.sin(p.phase + time * 2.1))
      colors[i3] = p.r; colors[i3 + 1] = p.g; colors[i3 + 2] = p.b
    }
    this.points.geometry.attributes.position.needsUpdate = true
    this.points.geometry.attributes.aSize.needsUpdate = true
    this.points.geometry.attributes.aAlpha.needsUpdate = true
    this.points.geometry.attributes.aColor.needsUpdate = true
  }
}

export class Effects {
  constructor(scene, renderer) {
    this.scene = scene
    this.renderer = renderer
    this.smokeTex = makeSmokeTexture()
    this.flashTex = makeFlashTexture()
    this.bloodTex = makeBloodTexture()
    this.lightTex = makeMuzzleLightTexture()
    this.soft = new SoftParticles(scene, 760, this.smokeTex)
    this.glow = new SoftParticles(scene, 340, this.flashTex, THREE.AdditiveBlending)
    this.time = 0
    this.shake = 0
    this.flashes = []
    this.lights = []
    this.tracers = []
    this.smokeClock = 0
    this.ambientClock = 0
    this._initFlashes()
    this._initTracers()
    this._initDust()
  }

  _initFlashes() {
    const mat = new THREE.SpriteMaterial({
      map: this.flashTex, color: 0xffd08a, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    })
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(mat.clone())
      s.visible = false
      s.renderOrder = 6
      this.scene.add(s)
      this.flashes.push({ sprite: s, life: 0, maxLife: 0.08, base: 1 })
    }
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffb35c, 0, 18, 2)
      this.scene.add(l)
      this.lights.push({ light: l, life: 0, maxLife: 0.1, base: 0 })
    }
  }

  _initTracers() {
    for (let i = 0; i < 22; i++) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
      const mat = new THREE.LineBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      const line = new THREE.Line(geo, mat)
      line.frustumCulled = false
      line.visible = false
      this.scene.add(line)
      this.tracers.push({ line, life: 0, maxLife: 0.08 })
    }
  }

  _initDust() {
    const count = 180
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(count * 3)
    this.dustSeeds = []
    for (let i = 0; i < count; i++) {
      const s = {
        x: rand(-22, 22), y: rand(0.3, 6), z: rand(-28, 16),
        speed: rand(0.15, 0.7), phase: rand(0, TAU), scale: rand(0.4, 1.5),
      }
      this.dustSeeds.push(s)
      pos[i * 3] = s.x; pos[i * 3 + 1] = s.y; pos[i * 3 + 2] = s.z
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({
      color: 0xffe2b0, size: 0.035, transparent: true, opacity: 0.4,
      map: this.lightTex, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    })
    this.dust = new THREE.Points(geo, mat)
    this.dust.frustumCulled = false
    this.scene.add(this.dust)
  }

  flash(x, y, z, scale = 1, color = 0xffc06a) {
    const f = this.flashes.find(v => !v.sprite.visible) || this.flashes[0]
    f.sprite.visible = true
    f.sprite.position.set(x, y, z)
    f.sprite.material.color.setHex(color)
    f.sprite.material.opacity = 0.95
    f.sprite.scale.setScalar(scale * 0.9)
    f.life = 0
    f.maxLife = 0.075
    f.base = scale
    const l = this.lights.find(v => v.life <= 0) || this.lights[0]
    l.light.position.set(x, y, z)
    l.light.color.setHex(color)
    l.light.intensity = 16 * scale
    l.life = 0
    l.maxLife = 0.1
    l.base = 16 * scale
    this.shake = Math.min(1.2, this.shake + 0.055 * scale)
  }

  muzzle(x, y, z, dir, scale = 1, quiet = false) {
    this.flash(x, y, z, 0.75 * scale)
    const p = dir.clone().normalize()
    for (let i = 0; i < 7; i++) {
      this.soft.spawn({
        x: x + p.x * rand(0.05, 0.5) + rand(-0.08, 0.08),
        y: y + p.y * rand(0.05, 0.5) + rand(-0.04, 0.12),
        z: z + p.z * rand(0.05, 0.5) + rand(-0.08, 0.08),
        vx: p.x * rand(0.3, 2.6) + rand(-0.4, 0.4),
        vy: p.y * rand(0.3, 2.6) + rand(0.05, 0.5),
        vz: p.z * rand(0.3, 2.6) + rand(-0.4, 0.4),
        life: rand(1.6, 3.4), size0: rand(0.18, 0.34) * scale, size1: rand(1.3, 2.6) * scale,
        alpha: quiet ? 0.18 : 0.5, r: 0.57, g: 0.55, b: 0.51, drag: 0.9, rise: 0.16, wind: 0.22,
      })
    }
    // A slower, larger puff lingers where the volley was fired.
    this.soft.spawn({
      x: x + p.x * 0.35, y: y + 0.12, z: z + p.z * 0.35,
      vx: p.x * rand(0.2, 0.7) + rand(-0.15, 0.15),
      vy: rand(0.12, 0.3),
      vz: p.z * rand(0.2, 0.7) + rand(-0.15, 0.15),
      life: rand(4, 7), size0: rand(0.5, 0.8) * scale, size1: rand(2.6, 4.2) * scale,
      alpha: quiet ? 0.09 : 0.17, r: 0.56, g: 0.54, b: 0.5, drag: 0.55, rise: 0.09, wind: 0.18,
    })
    for (let i = 0; i < 8; i++) {
      this.glow.spawn({
        x, y, z,
        vx: p.x * rand(2, 8) + rand(-1.6, 1.6),
        vy: p.y * rand(2, 8) + rand(-0.6, 1.8),
        vz: p.z * rand(2, 8) + rand(-1.6, 1.6),
        life: rand(0.08, 0.28), size0: rand(0.03, 0.08), size1: 0.01,
        alpha: 0.9, r: 1, g: 0.6, b: 0.16, drag: 1.6, gravity: 2.2, wind: 0,
      })
    }
    if (!quiet) this.shake = Math.min(1, this.shake + 0.035 * scale)
  }

  tracer(from, to, strength = 0.35) {
    const t = this.tracers.find(v => !v.line.visible) || this.tracers[0]
    const attr = t.line.geometry.attributes.position
    attr.array[0] = from.x; attr.array[1] = from.y; attr.array[2] = from.z
    attr.array[3] = to.x; attr.array[4] = to.y; attr.array[5] = to.z
    attr.needsUpdate = true
    t.line.material.opacity = strength
    t.line.visible = true
    t.life = 0
    t.maxLife = 0.075
  }

  blood(x, y, z, dir, amount = 1) {
    const d = dir.clone().normalize()
    for (let i = 0; i < 8 * amount; i++) {
      this.soft.spawn({
        x, y, z,
        vx: d.x * rand(0.5, 3.2) + rand(-1, 1),
        vy: rand(0.1, 2.5),
        vz: d.z * rand(0.5, 3.2) + rand(-1, 1),
        life: rand(0.35, 1.1), size0: rand(0.07, 0.18), size1: rand(0.25, 0.55),
        alpha: 0.42, r: 0.28, g: 0.015, b: 0.012, drag: 2.2, gravity: 1.6, wind: 0.05,
      })
    }
    for (let i = 0; i < 10 * amount; i++) {
      this.glow.spawn({
        x, y, z,
        vx: d.x * rand(1, 5) + rand(-2, 2),
        vy: rand(-0.5, 3), vz: d.z * rand(1, 5) + rand(-2, 2),
        life: rand(0.1, 0.35), size0: rand(0.02, 0.055), size1: 0.01,
        alpha: 0.65, r: 0.55, g: 0.02, b: 0.01, drag: 1.2, gravity: 5, wind: 0,
      })
    }
  }

  impact(x, y, z, normal, type = 'dirt', scale = 1) {
    const n = normal.clone().normalize()
    for (let i = 0; i < 5 * scale; i++) {
      this.soft.spawn({
        x, y, z,
        vx: n.x * rand(0.5, 2.5) + rand(-0.8, 0.8),
        vy: Math.abs(n.y) * rand(0.5, 2.5) + rand(0.3, 1.3),
        vz: n.z * rand(0.5, 2.5) + rand(-0.8, 0.8),
        life: rand(0.5, 1.5), size0: rand(0.08, 0.2), size1: rand(0.35, 0.9),
        alpha: type === 'stone' ? 0.32 : 0.42,
        r: type === 'stone' ? 0.42 : 0.36, g: type === 'stone' ? 0.4 : 0.27, b: type === 'stone' ? 0.36 : 0.16,
        drag: 1.2, gravity: 0.9, wind: 0.1,
      })
    }
    for (let i = 0; i < 8 * scale; i++) {
      this.glow.spawn({
        x, y, z,
        vx: n.x * rand(1, 6) + rand(-2, 2),
        vy: rand(0.5, 4),
        vz: n.z * rand(1, 6) + rand(-2, 2),
        life: rand(0.08, 0.3), size0: rand(0.015, 0.045), size1: 0.005,
        alpha: 0.8, r: 1, g: 0.55, b: 0.18, drag: 0.9, gravity: 6, wind: 0,
      })
    }
  }

  explosion(x, y, z, scale = 1, onShake = null) {
    this.flash(x, y + 0.3, z, 4.2 * scale, 0xff9a44)
    for (let i = 0; i < 24; i++) {
      this.glow.spawn({
        x: x + rand(-0.4, 0.4), y: y + rand(0, 0.8), z: z + rand(-0.4, 0.4),
        vx: rand(-5, 5) * scale, vy: rand(1, 9) * scale, vz: rand(-5, 5) * scale,
        life: rand(0.15, 0.7), size0: rand(0.08, 0.28), size1: 0.01,
        alpha: 1, r: 1, g: rand(0.4, 0.8), b: 0.12, drag: 0.8, gravity: 7, wind: 0,
      })
    }
    for (let i = 0; i < 26; i++) {
      this.soft.spawn({
        x: x + rand(-0.6, 0.6), y: y + rand(0, 1), z: z + rand(-0.6, 0.6),
        vx: rand(-3.5, 3.5), vy: rand(0.5, 4.2), vz: rand(-3.5, 3.5),
        life: rand(2.5, 5.5), size0: rand(0.5, 1), size1: rand(3, 6),
        alpha: 0.5, r: 0.3, g: 0.29, b: 0.27, drag: 0.65, rise: 0.35, wind: 0.25,
      })
    }
    for (let i = 0; i < 28; i++) {
      this.soft.spawn({
        x: x + rand(-0.8, 0.8), y: y + rand(0, 0.4), z: z + rand(-0.8, 0.8),
        vx: rand(-4, 4), vy: rand(2, 7), vz: rand(-4, 4),
        life: rand(0.7, 2), size0: rand(0.1, 0.25), size1: rand(0.6, 1.3),
        alpha: 0.55, r: 0.32, g: 0.24, b: 0.14, drag: 0.9, gravity: 2, wind: 0.15,
      })
    }
    this.shake = Math.min(1.4, this.shake + 0.7 * scale)
    onShake?.(scale)
  }

  battleSmoke(x, y, z) {
    this.soft.spawn({
      x, y, z,
      vx: rand(-0.18, 0.35), vy: rand(0.04, 0.18), vz: rand(-0.25, 0.15),
      life: rand(7, 15), size0: rand(1.4, 2.8), size1: rand(4.5, 9),
      alpha: rand(0.1, 0.2), r: 0.58, g: 0.57, b: 0.55, drag: 0.35, rise: 0.035, wind: 0.12,
    })
  }

  update(dt) {
    this.time += dt
    this.soft.update(dt, this.time)
    this.glow.update(dt, this.time)

    for (const f of this.flashes) {
      if (!f.sprite.visible) continue
      f.life += dt
      const t = f.life / f.maxLife
      if (t >= 1) { f.sprite.visible = false; continue }
      f.sprite.material.opacity = (1 - t) * 0.95
      f.sprite.scale.setScalar(f.base * (0.8 + t * 1.3))
    }
    for (const l of this.lights) {
      if (l.life <= 0) continue
      l.life += dt
      const t = l.life / l.maxLife
      l.light.intensity = t >= 1 ? 0 : l.base * Math.pow(1 - t, 2)
    }
    for (const t of this.tracers) {
      if (!t.line.visible) continue
      t.life += dt
      const k = 1 - t.life / t.maxLife
      if (k <= 0) { t.line.visible = false; continue }
      t.line.material.opacity = k * 0.35
    }

    this.dust.rotation.y += dt * 0.004
    const positions = this.dust.geometry.attributes.position
    for (let i = 0; i < this.dustSeeds.length; i++) {
      const s = this.dustSeeds[i]
      s.y += s.speed * dt * 0.3
      if (s.y > 7) s.y = 0.3
      positions.array[i * 3] = s.x + Math.sin(this.time * 0.25 + s.phase) * 1.4
      positions.array[i * 3 + 1] = s.y
      positions.array[i * 3 + 2] = s.z + Math.cos(this.time * 0.2 + s.phase) * 1.1
    }
    positions.needsUpdate = true

    this.smokeClock += dt
    if (this.smokeClock > 0.5) {
      this.smokeClock = 0
      if (Math.random() < 0.7) this.battleSmoke(rand(-24, 24), rand(0.4, 2.5), rand(-34, 8))
    }
    this.shake = Math.max(0, this.shake - dt * 1.7)
  }

  seedBattlefield() {
    for (let i = 0; i < 44; i++) {
      this.battleSmoke(rand(-34, 34), rand(0.4, 4.5), rand(-42, 12))
    }
    // Slow columns of powder smoke rising behind the French position.
    for (let i = 0; i < 9; i++) {
      const x = rand(-38, 38)
      const z = -32 - rand(0, 16)
      this.soft.spawn({
        x, y: rand(1.5, 4.5), z,
        vx: rand(-0.08, 0.16), vy: rand(0.05, 0.14), vz: rand(-0.08, 0.08),
        life: rand(16, 26), size0: rand(2.4, 4.2), size1: rand(8, 14),
        alpha: rand(0.05, 0.11), r: 0.5, g: 0.49, b: 0.47, drag: 0.25, rise: 0.04, wind: 0.1,
      })
    }
    for (let i = 0; i < 7; i++) {
      this.soft.spawn({
        x: rand(-25, 25), y: rand(0.1, 0.6), z: rand(-32, 5),
        vx: rand(-0.1, 0.2), vy: 0.03, vz: rand(-0.2, 0.1),
        life: rand(9, 16), size0: rand(2, 4), size1: rand(7, 12),
        alpha: rand(0.04, 0.09), r: 0.52, g: 0.51, b: 0.49, drag: 0.3, rise: 0.02, wind: 0.08,
      })
    }
  }
}
