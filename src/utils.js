import * as THREE from 'three'

export const TAU = Math.PI * 2
export const UP = new THREE.Vector3(0, 1, 0)
export const DOWN = new THREE.Vector3(0, -1, 0)
export const TEMP_V1 = new THREE.Vector3()
export const TEMP_V2 = new THREE.Vector3()
export const TEMP_Q1 = new THREE.Quaternion()
export const TEMP_Q2 = new THREE.Quaternion()

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
export const lerp = (a, b, t) => a + (b - a) * t
export const invLerp = (a, b, v) => (v - a) / (b - a)
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
export const rand = (min = 0, max = 1) => min + Math.random() * (max - min)
export const randInt = (min, max) => Math.floor(rand(min, max + 1))
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
export const damp = (current, target, lambda, dt) => THREE.MathUtils.damp(current, target, lambda, dt)
export const dampVec = (current, target, lambda, dt) => {
  current.x = damp(current.x, target.x, lambda, dt)
  current.y = damp(current.y, target.y, lambda, dt)
  current.z = damp(current.z, target.z, lambda, dt)
  return current
}
export const dampQuat = (current, target, lambda, dt) => {
  current.slerp(target, 1 - Math.exp(-lambda * dt))
  return current
}
export const angleDelta = (a, b) => {
  let d = (b - a) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}
export const dampAngle = (current, target, lambda, dt) => current + angleDelta(current, target) * (1 - Math.exp(-lambda * dt))

export function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return s - Math.floor(s)
}

export function valueNoise(x, y) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy)
  const b = hash2(ix + 1, iy)
  const c = hash2(ix, iy + 1)
  const d = hash2(ix + 1, iy + 1)
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy)
}

export function fbm(x, y, octaves = 4) {
  let value = 0
  let amp = 0.5
  let freq = 1
  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x * freq, y * freq) * amp
    amp *= 0.5
    freq *= 2.03
  }
  return value
}

export function canvasTexture(size, draw, { srgb = true, repeat = null } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  draw(ctx, size)
  const texture = new THREE.CanvasTexture(canvas)
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(repeat[0], repeat[1])
  }
  return texture
}

export function radialTexture(size, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return canvasTexture(size, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, inner)
    g.addColorStop(0.45, inner.replace(/[\d.]+\)$/, '0.55)'))
    g.addColorStop(1, outer)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
}

export function makeSmokeTexture() {
  return canvasTexture(128, (ctx, s) => {
    ctx.clearRect(0, 0, s, s)
    const g = ctx.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(255,255,255,0.85)')
    g.addColorStop(0.45, 'rgba(255,255,255,0.34)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * TAU
      const r = Math.random() * s * 0.38
      const x = s / 2 + Math.cos(a) * r
      const y = s / 2 + Math.sin(a) * r
      const rr = 3 + Math.random() * 14
      const g2 = ctx.createRadialGradient(x, y, 0, x, y, rr)
      g2.addColorStop(0, `rgba(255,255,255,${0.05 + Math.random() * 0.08})`)
      g2.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g2
      ctx.beginPath()
      ctx.arc(x, y, rr, 0, TAU)
      ctx.fill()
    }
  })
}

export function makeFlashTexture() {
  return canvasTexture(128, (ctx, s) => {
    ctx.clearRect(0, 0, s, s)
    const c = s / 2
    const g = ctx.createRadialGradient(c, c, 0, c, c, c)
    g.addColorStop(0, 'rgba(255,255,238,1)')
    g.addColorStop(0.14, 'rgba(255,228,150,0.98)')
    g.addColorStop(0.38, 'rgba(255,146,42,0.5)')
    g.addColorStop(1, 'rgba(255,80,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 7; i++) {
      ctx.save()
      ctx.translate(c, c)
      ctx.rotate((i / 7) * TAU + Math.random() * 0.4)
      const grad = ctx.createLinearGradient(0, 0, c, 0)
      grad.addColorStop(0, 'rgba(255,245,200,0.85)')
      grad.addColorStop(1, 'rgba(255,160,40,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.moveTo(0, -3)
      ctx.lineTo(c * (0.5 + Math.random() * 0.45), 0)
      ctx.lineTo(0, 3)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
  })
}

export function makeBloodTexture() {
  return canvasTexture(64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(140,10,10,0.9)')
    g.addColorStop(0.4, 'rgba(100,4,4,0.5)')
    g.addColorStop(1, 'rgba(60,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
}

export function makeGrassTexture(color = '#708d3d') {
  return canvasTexture(128, (ctx, s) => {
    ctx.clearRect(0, 0, s, s)
    for (let i = 0; i < 34; i++) {
      const x = 8 + Math.random() * (s - 16)
      const h = s * (0.35 + Math.random() * 0.6)
      const bend = (Math.random() - 0.5) * 22
      const w = 1.2 + Math.random() * 2.2
      const shade = Math.random()
      ctx.strokeStyle = shade > 0.7 ? '#9aab57' : shade > 0.35 ? color : '#4a632d'
      ctx.lineWidth = w
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x, s)
      ctx.quadraticCurveTo(x + bend * 0.25, s - h * 0.55, x + bend, s - h)
      ctx.stroke()
    }
  })
}

export function makeStoneTexture() {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#6b665b'
    ctx.fillRect(0, 0, s, s)
    let y = 0
    while (y < s) {
      const rowH = 26 + Math.random() * 22
      let x = -Math.random() * 40
      while (x < s) {
        const w = 40 + Math.random() * 70
        const shade = 92 + Math.random() * 45
        ctx.fillStyle = `rgb(${shade + 8},${shade + 4},${shade - 7})`
        ctx.beginPath()
        ctx.roundRect(x + 2, y + 2, w - 4, rowH - 4, 3)
        ctx.fill()
        ctx.strokeStyle = 'rgba(40,37,32,0.45)'
        ctx.lineWidth = 1
        ctx.stroke()
        x += w
      }
      y += rowH
    }
    ctx.globalAlpha = 0.13
    for (let i = 0; i < 2000; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#fff' : '#000'
      ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1)
    }
  }, { repeat: [2, 1] })
}

export function makeWoodTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#4d3421'
    ctx.fillRect(0, 0, s, s)
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * s
      ctx.strokeStyle = `rgba(${20 + Math.random() * 40},${12 + Math.random() * 25},${6 + Math.random() * 15},${0.2 + Math.random() * 0.35})`
      ctx.lineWidth = 0.5 + Math.random() * 2
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.bezierCurveTo(x + Math.random() * 8, s * 0.3, x - Math.random() * 8, s * 0.7, x + Math.random() * 5, s)
      ctx.stroke()
    }
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * s
      const y = Math.random() * s
      ctx.strokeStyle = 'rgba(20,10,4,0.5)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.ellipse(x, y, 5 + Math.random() * 8, 2 + Math.random() * 3, Math.random(), 0, TAU)
      ctx.stroke()
    }
  }, { repeat: [3, 1] })
}

export function makeRoofTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#5f3527'
    ctx.fillRect(0, 0, s, s)
    const rowH = 24
    for (let y = 0; y < s; y += rowH) {
      const offset = (y / rowH) % 2 ? 16 : 0
      for (let x = -offset; x < s; x += 32) {
        const shade = 70 + Math.random() * 45
        ctx.fillStyle = `rgb(${shade + 36},${shade - 4},${shade - 18})`
        ctx.beginPath()
        ctx.roundRect(x + 1, y + 1, 30, rowH - 2, [0, 0, 7, 7])
        ctx.fill()
        ctx.strokeStyle = 'rgba(34,17,12,0.55)'
        ctx.stroke()
      }
    }
  }, { repeat: [4, 2] })
}

export function makeFlagTexture(kind = 'king') {
  return canvasTexture(512, (ctx, s) => {
    if (kind === 'king') {
      ctx.fillStyle = '#7e171b'
      ctx.fillRect(0, 0, s, s)
      ctx.strokeStyle = '#d8b56c'
      ctx.lineWidth = 10
      ctx.strokeRect(18, 18, s - 36, s - 36)
      ctx.fillStyle = '#d8b56c'
      ctx.font = 'bold 96px Georgia'
      ctx.textAlign = 'center'
      ctx.fillText('III', s / 2, s / 2 + 10)
      ctx.font = '36px Georgia'
      ctx.fillText('KING’S COLOUR', s / 2, s / 2 + 80)
    } else if (kind === 'regimental') {
      ctx.fillStyle = '#1f4c36'
      ctx.fillRect(0, 0, s, s)
      ctx.strokeStyle = '#d8b56c'
      ctx.lineWidth = 8
      ctx.strokeRect(16, 16, s - 32, s - 32)
      ctx.fillStyle = '#e4d6aa'
      ctx.font = 'bold 54px Georgia'
      ctx.textAlign = 'center'
      ctx.fillText('95th', s / 2, 170)
      ctx.font = '28px Georgia'
      ctx.fillText('RIFLES', s / 2, 215)
      ctx.beginPath()
      ctx.arc(s / 2, 330, 72, 0, TAU)
      ctx.strokeStyle = '#d8b56c'
      ctx.lineWidth = 5
      ctx.stroke()
      ctx.font = '24px Georgia'
      ctx.fillText('WATERLOO', s / 2, 335)
    } else {
      ctx.fillStyle = '#243b78'
      ctx.fillRect(0, 0, s, s)
      ctx.fillStyle = '#f0ede2'
      ctx.fillRect(s / 3, 0, s / 3, s)
      ctx.fillStyle = '#a82b2b'
      ctx.fillRect(0, 0, s / 3, s)
    }
  })
}

export function makeGroundTexture() {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#c6c8b4'
    ctx.fillRect(0, 0, s, s)
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * s
      const y = Math.random() * s
      const r = 1 + Math.random() * 10
      const light = Math.random() > 0.5
      ctx.fillStyle = light ? `rgba(238,235,206,${0.035 + Math.random() * 0.1})` : `rgba(64,72,44,${0.03 + Math.random() * 0.1})`
      ctx.beginPath()
      ctx.ellipse(x, y, r, r * rand(0.4, 1.3), Math.random() * TAU, 0, TAU)
      ctx.fill()
    }
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * s
      const y = Math.random() * s
      ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(48,58,31,0.18)' : 'rgba(218,210,164,0.15)'
      ctx.lineWidth = 0.6 + Math.random() * 1.2
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + rand(-3, 3), y - rand(2, 7))
      ctx.stroke()
    }
    for (let i = 0; i < 800; i++) {
      ctx.fillStyle = `rgba(85,64,40,${0.05 + Math.random() * 0.13})`
      ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3)
    }
  }, { repeat: [26, 26] })
}

export function makeShadowTexture() {
  return canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(0,0,0,0.7)')
    g.addColorStop(0.5, 'rgba(0,0,0,0.38)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
}

export function makeGrainTexture() {
  return canvasTexture(256, (ctx, s) => {
    const image = ctx.createImageData(s, s)
    for (let i = 0; i < image.data.length; i += 4) {
      const v = 120 + Math.random() * 135
      image.data[i] = v
      image.data[i + 1] = v
      image.data[i + 2] = v
      image.data[i + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
  }, { srgb: false })
}

export function makeMuzzleLightTexture() {
  return radialTexture(64, 'rgba(255,220,130,1)', 'rgba(255,90,0,0)')
}
