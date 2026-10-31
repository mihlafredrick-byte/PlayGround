import { clamp, rand } from './utils.js'

export class BattleAudio {
  constructor() {
    this.ctx = null
    this.master = null
    this.muted = false
    this.ambientGain = null
    this.noiseBuffer = null
    this.lastShot = 0
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.62
    this.master.connect(this.ctx.destination)
    this.noiseBuffer = this.makeNoise(2.2)
    this.startAmbience()
  }

  makeNoise(seconds) {
    const rate = this.ctx.sampleRate
    const buffer = this.ctx.createBuffer(1, Math.floor(rate * seconds), rate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1
      last = last * 0.75 + white * 0.25
      data[i] = last
    }
    return buffer
  }

  noiseSource(loop = false) {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = loop
    return src
  }

  startAmbience() {
    const ctx = this.ctx
    const wind = this.noiseSource(true)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 340
    lp.Q.value = 0.3
    const gain = ctx.createGain()
    gain.gain.value = 0.035
    wind.connect(lp).connect(gain).connect(this.master)
    wind.start()
    this.ambientGain = gain

    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.frequency.value = 0.075
    lfoGain.gain.value = 0.017
    lfo.connect(lfoGain).connect(gain.gain)
    lfo.start()

    // Low battlefield rumble.
    const rumble = ctx.createOscillator()
    const rumbleGain = ctx.createGain()
    rumble.type = 'sine'
    rumble.frequency.value = 34
    rumbleGain.gain.value = 0.012
    rumble.connect(rumbleGain).connect(this.master)
    rumble.start()
  }

  panFor(position, listener) {
    if (!position || !listener) return 0
    const dx = position.x - listener.x
    const dz = position.z - listener.z
    return clamp(dx / (Math.abs(dz) + 4), -0.8, 0.8)
  }

  connectSpatial(node, pan, volume) {
    const panner = this.ctx.createStereoPanner()
    panner.pan.value = pan
    const gain = this.ctx.createGain()
    gain.gain.value = volume
    node.connect(gain).connect(panner).connect(this.master)
    return gain
  }

  shot(distance = 0, pan = 0, heavy = false) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const att = clamp(1 - distance / 75, 0.12, 1)
    const volume = (heavy ? 0.7 : 0.5) * att

    const noise = this.noiseSource()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(heavy ? 520 : 1300, t)
    bp.frequency.exponentialRampToValueAtTime(heavy ? 120 : 260, t + 0.16)
    bp.Q.value = 0.7
    const g = ctx.createGain()
    g.gain.setValueAtTime(volume, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + (heavy ? 0.5 : 0.22))
    noise.connect(bp).connect(g)
    const panner = ctx.createStereoPanner()
    panner.pan.value = pan
    g.connect(panner).connect(this.master)
    noise.start(t)
    noise.stop(t + 0.55)

    const crack = this.noiseSource()
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 2600
    const cg = ctx.createGain()
    cg.gain.setValueAtTime(volume * 0.6, t)
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.055)
    crack.connect(hp).connect(cg)
    cg.connect(panner)
    crack.start(t)
    crack.stop(t + 0.08)

    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(heavy ? 64 : 118, t)
    osc.frequency.exponentialRampToValueAtTime(heavy ? 25 : 48, t + 0.2)
    const og = ctx.createGain()
    og.gain.setValueAtTime(volume * 0.8, t)
    og.gain.exponentialRampToValueAtTime(0.0001, t + (heavy ? 0.55 : 0.25))
    osc.connect(og).connect(panner)
    osc.start(t)
    osc.stop(t + 0.6)
    this.lastShot = performance.now()
  }

  cannon(distance = 0, pan = 0) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const att = clamp(1 - distance / 110, 0.2, 1)
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(68, t)
    osc.frequency.exponentialRampToValueAtTime(24, t + 0.85)
    const og = ctx.createGain()
    og.gain.setValueAtTime(0.75 * att, t)
    og.gain.exponentialRampToValueAtTime(0.0001, t + 1.2)
    const panner = ctx.createStereoPanner()
    panner.pan.value = pan
    osc.connect(og).connect(panner).connect(this.master)
    osc.start(t)
    osc.stop(t + 1.25)

    const noise = this.noiseSource()
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(1100, t)
    lp.frequency.exponentialRampToValueAtTime(180, t + 0.7)
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.55 * att, t)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.1)
    noise.connect(lp).connect(ng).connect(panner)
    noise.start(t)
    noise.stop(t + 1.15)
  }

  reloadClick(pitch = 1) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const noise = this.noiseSource()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1800 * pitch
    bp.Q.value = 3
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.16, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055)
    noise.connect(bp).connect(g).connect(this.master)
    noise.start(t)
    noise.stop(t + 0.07)
  }

  hitMarker() {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1450, t)
    osc.frequency.exponentialRampToValueAtTime(960, t + 0.09)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.12, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    osc.connect(g).connect(this.master)
    osc.start(t)
    osc.stop(t + 0.14)
  }

  hurt() {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const noise = this.noiseSource()
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 300
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.3, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
    noise.connect(lp).connect(g).connect(this.master)
    noise.start(t)
    noise.stop(t + 0.32)
  }

  ui() {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 620
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.04, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
    osc.connect(g).connect(this.master)
    osc.start(t)
    osc.stop(t + 0.09)
  }

  distantVolley() {
    if (!this.ctx) return
    for (let i = 0; i < 6; i++) {
      setTimeout(() => this.shot(60, rand(-0.8, 0.8), false), i * rand(35, 110))
    }
  }

  toggleMute() {
    this.muted = !this.muted
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.62
    return this.muted
  }
}
