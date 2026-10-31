import { clamp } from './utils.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.started = false;
    this.lastShot = 0;
  }

  ensure() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = .55;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoise(2.7);
    this.buildAmbient();
    this.started = true;
    return true;
  }

  resume() {
    if (!this.ctx) this.ensure();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? .55 : 0, this.ctx.currentTime, .08);
  }

  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * .86 + white * .14;
      data[i] = white * .7 + last * .3;
    }
    return buf;
  }

  buildAmbient() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    filter.Q.value = .4;
    const gain = ctx.createGain();
    gain.gain.value = .038;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = .09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = .014;
    lfo.connect(lfoGain).connect(gain.gain);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    lfo.start();
    this.wind = gain;

    // distant battle bed
    const rumble = ctx.createBufferSource();
    rumble.buffer = this.noiseBuffer;
    rumble.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 90;
    const rg = ctx.createGain(); rg.gain.value = .025;
    rumble.connect(lp).connect(rg).connect(this.master);
    rumble.start();
    this.rumble = rg;
  }

  shot(volume = .2, pan = 0) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this.lastShot < .025) return;
    this.lastShot = t;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = .9 + Math.random() * .4;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 280;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1450; bp.Q.value = .55;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + .006);
    g.gain.exponentialRampToValueAtTime(.0001, t + .18);
    const p = this.ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + .1);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(volume * .9, t);
    og.gain.exponentialRampToValueAtTime(.0001, t + .13);
    src.connect(hp).connect(bp).connect(g).connect(p).connect(this.master);
    osc.connect(og).connect(p);
    src.start(t, Math.random() * 1.8, .26);
    osc.start(t); osc.stop(t + .14);
  }

  cannon(volume = .45, pan = 0) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = .55;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(680, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + .7);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + .012);
    g.gain.exponentialRampToValueAtTime(.0001, t + .9);
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(56, t);
    osc.frequency.exponentialRampToValueAtTime(24, t + .5);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(volume * 1.4, t);
    og.gain.exponentialRampToValueAtTime(.0001, t + .7);
    src.connect(lp).connect(g).connect(p).connect(this.master);
    osc.connect(og).connect(p);
    src.start(t, Math.random() * 1.9, 1);
    osc.start(t); osc.stop(t + .8);
  }

  drum(volume = .13, pitch = 1, delay = 0) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(92 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(54 * pitch, t + .15);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + .005);
    g.gain.exponentialRampToValueAtTime(.0001, t + .25);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 240 * pitch; bp.Q.value = 1.1;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(volume * .22, t);
    ng.gain.exponentialRampToValueAtTime(.0001, t + .09);
    osc.connect(g).connect(this.master);
    src.connect(bp).connect(ng).connect(this.master);
    osc.start(t); osc.stop(t + .28);
    src.start(t, Math.random() * 2, .12);
  }

  order() {
    if (!this.enabled || !this.ctx) return;
    this.drum(.1, 1.05);
    this.drum(.1, .96, .095);
    this.drum(.14, 1.0, .2);
  }

  advance() {
    if (!this.enabled || !this.ctx) return;
    for (let i = 0; i < 9; i++) this.drum(i % 2 ? .08 : .11, 1 + (i % 3) * .03, i * .075);
  }

  bugle() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [392, 523, 659, 523, 659, 784];
    notes.forEach((freq, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq;
      const st = t + i * .14;
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(.035, st + .02);
      g.gain.exponentialRampToValueAtTime(.0001, st + .23);
      o.connect(g).connect(this.master);
      o.start(st); o.stop(st + .24);
    });
  }

  hoof() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(.04, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + .07);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random(), .08);
  }
}
