import {
  TAU, clamp, lerp, dist, angleDiff, rand, randInt, pick, rotate, rgba, smoothstep
} from './utils.js';
import { WORLD, buildTerrain } from './terrain.js';
import { AudioEngine } from './audio.js';
import { Ragdoll } from './ragdoll.js';
import { createArmies, buildSpriteSheets, humanAngle } from './units.js';

const canvas = document.getElementById('battlefield');
const ctx = canvas.getContext('2d', { alpha: false });
const minimapCanvas = document.getElementById('minimap');
const mctx = minimapCanvas.getContext('2d');

const ICONS = {
  line: `<svg viewBox="0 0 32 32"><path d="M9 26 15 7l2 1-3 10 6-7 3 2-5 5 7-2 1 3-11 2-2 5Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M7 25h5" stroke="currentColor" stroke-width="1.2"/></svg>`,
  light: `<svg viewBox="0 0 32 32"><path d="M4 17c5-8 13-11 21-9-4 3-5 6-6 9l-2-3-5 2 1 4-2 3-1-5-5 1Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M10 23c3 0 7-1 10-4" stroke="currentColor" stroke-width="1.2"/></svg>`,
  guard: `<svg viewBox="0 0 32 32"><path d="M16 4c3 5 3 11 0 17-3-6-3-12 0-17Z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M9 12c4-3 8-3 12 0M8 17c5-3 11-3 16 0M16 21v7M12 27h8" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="16" cy="10" r="1.4" fill="currentColor"/></svg>`,
  cav: `<svg viewBox="0 0 32 32"><path d="M7 24c2-6 6-9 12-10l3-5 5 2-2 4c3 3 3 6-1 8l2 5h-4l-2-4-5 2-2 5H9l3-6c-1-1-3-1-5-1Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5 12c2 0 4 2 4 5" stroke="currentColor" stroke-width="1.2"/></svg>`,
  arty: `<svg viewBox="0 0 32 32"><path d="M5 21h17l4-12h3l-4 12M8 20l-2 6M20 20l3 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="26" r="3" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="21" cy="26" r="3" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M29 8l-2 1" stroke="currentColor" stroke-width="1.2"/></svg>`
};

const clampCamera = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

class Game {
  constructor() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.terrain = buildTerrain();
    this.audio = new AudioEngine();
    this.time = 0;
    this.realTime = 0;
    this.speed = 1;
    this.paused = false;
    this.over = false;
    this.observing = false;
    this.units = [];
    this.ragdolls = [];
    this.maxRagdolls = 130;
    this.particles = [];
    this.tracers = [];
    this.rings = [];
    this.projectiles = [];
    this.decals = [];
    this.floating = [];
    this.timers = [];
    this.camera = { x: 1140, y: 990, tx: 1140, ty: 990, zoom: .62, tz: .62 };
    this.selection = new Set();
    this.hoverUnit = null;
    this.pointer = { x: 0, y: 0, wx: 0, wy: 0, down: false, button: -1 };
    this.dragBox = null;
    this.orderDrag = null;
    this.touch = null;
    this.touchPoints = new Map();
    this.pinch = null;
    this.suppressTouch = 0;
    this.keys = new Set();
    this.capture = { progress: 0, hold: 0, taken: false, contested: false };
    this.aiClock = 1.5;
    this.aiWave = 0;
    this.battleShots = 0;
    this.clockTick = 0;
    this.hudTick = 0;
    this.smokeClock = 0;
    this.chimneyClock = 0;
    this.shake = 0;
    this.messages = [];
    this.script = 0;
    this.presentStart = 0;
    this.totalKills = 0;
    this.startedAt = performance.now();
    this.helpOpen = false;
    this.weaponSmokeBudget = 0;
    this.tracers.length = 0;
    this.hoverEl = this.createHoverCard();
    this.smokeSprites = this.makeSmokeSprites();
    this.mist = this.makeMist();
    this.minimapCache = null;
    this.initUI();
    this.resize();
    this.bindEvents();
    this.sprites = buildSpriteSheets();
    this.units = createArmies(this);
    this.playerUnits = this.units.filter(u => u.side === 'fr');
    this.enemyUnits = this.units.filter(u => u.side === 'gb');
    this.presentStart = this.units.reduce((n, u) => n + u.aliveCount, 0);
    this.buildRoster();
    this.buildMinimapCache();
    this.selectUnit(this.playerUnits[1]);
    this.updateHUD(true);
    this.intro();
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  createHoverCard() {
    const el = document.createElement('div');
    el.className = 'hover-card hidden';
    el.innerHTML = '<span class="hc-side"></span><strong></strong><span class="hc-sub"></span><div class="hc-bar"><i></i></div>';
    document.body.appendChild(el);
    return el;
  }

  intro() {
    setTimeout(() => {
      const loading = document.getElementById('loading');
      loading.classList.add('fade');
      setTimeout(() => loading.remove(), 900);
      this.audio.ensure();
      this.audio.setEnabled(true);
      this.showToast('Take the crossroads', 'La Haye Sainte · the Allied centre');
    }, 420);
    this.after(3.2, () => {
      this.message('The Allied line is deploying behind the farm');
      this.setFieldOrders('The farm at the crossroads anchors the Allied centre. Close the distance under smoke, break their battalions, and the road to Brussels opens.');
    });
    this.after(10, () => this.message('Allied skirmishers are feeling for our line'));
    this.after(16, () => this.message('British battalions advance from the ridge', 'warn'));
    this.after(19.5, () => {
      const highlanders = this.enemyUnits.find(u => u.short === '42nd Foot');
      if (highlanders) highlanders.setMove(1350, 650);
      const rifles = this.enemyUnits.find(u => u.short === '95th Rifles');
      if (rifles) rifles.setMove(1560, 760);
      this.setFieldOrders('The 42nd is moving down toward the orchard. Meet them with volleys, not bayonets, until their formation wavers.');
    });
    this.after(35, () => {
      this.aiWave = 1;
      this.message('The Allied centre begins its advance', 'warn');
    });
  }

  makeSmokeSprites() {
    const sprites = [];
    for (let k = 0; k < 4; k++) {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const g = c.getContext('2d');
      const rnd = () => Math.random();
      for (let i = 0; i < 20; i++) {
        const x = 64 + (rnd() - .5) * 50;
        const y = 64 + (rnd() - .5) * 42;
        const r = 13 + rnd() * 28;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        const tone = 186 + Math.floor(rnd() * 45);
        grd.addColorStop(0, `rgba(${tone},${tone - 4},${tone - 12},.18)`);
        grd.addColorStop(.55, `rgba(${tone - 12},${tone - 15},${tone - 20},.08)`);
        grd.addColorStop(1, 'rgba(80,80,72,0)');
        g.fillStyle = grd;
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      sprites.push(c);
    }
    return sprites;
  }

  makeMist() {
    const arr = [];
    for (let i = 0; i < 11; i++) {
      arr.push({
        x: rand(0, WORLD.w), y: rand(300, 1500),
        r: rand(180, 420), a: rand(.014, .038),
        vx: rand(1.5, 5), vy: rand(-.4, 1)
      });
    }
    return arr;
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    canvas.width = Math.round(this.vw * this.dpr);
    canvas.height = Math.round(this.vh * this.dpr);
    canvas.style.width = this.vw + 'px';
    canvas.style.height = this.vh + 'px';
    const fit = Math.min(this.vw / 2100, this.vh / 1300);
    this.minZoom = Math.max(.36, Math.min(fit * .92, .8));
    this.maxZoom = Math.max(1.3, this.minZoom * 3.2);
    if (!this.initialZoomSet) {
      this.camera.zoom = clamp(fit * 1.25, .52, .78);
      this.camera.tz = this.camera.zoom;
      if (this.vw < 900) { this.camera.x = 1215; this.camera.tx = 1215; }
      this.initialZoomSet = true;
    }
    this.clampCamera();
    this.resizeMinimap();
  }

  resizeMinimap() {
    const rect = minimapCanvas.getBoundingClientRect();
    if (rect.width) {
      minimapCanvas.width = Math.round(rect.width * this.dpr);
      minimapCanvas.height = Math.round((rect.width / WORLD.w * WORLD.h) * this.dpr);
      minimapCanvas.style.height = 'auto';
      this.buildMinimapCache();
    }
  }

  clampCamera() {
    const viewW = this.vw / this.camera.zoom;
    const viewH = this.vh / this.camera.zoom;
    const mx = Math.min(300, viewW * .34);
    const my = Math.min(250, viewH * .34);
    this.camera.x = clampCamera(this.camera.x, Math.min(WORLD.w / 2, viewW / 2 - 100), Math.max(WORLD.w / 2, WORLD.w - viewW / 2 + 100));
    this.camera.y = clampCamera(this.camera.y, Math.min(WORLD.h / 2, viewH / 2 - 100), Math.max(WORLD.h / 2, WORLD.h - viewH / 2 + 100));
    this.camera.tx = clampCamera(this.camera.tx, Math.min(WORLD.w / 2, viewW / 2 - 100), Math.max(WORLD.w / 2, WORLD.w - viewW / 2 + 100));
    this.camera.ty = clampCamera(this.camera.ty, Math.min(WORLD.h / 2, viewH / 2 - 100), Math.max(WORLD.h / 2, WORLD.h - viewH / 2 + 100));
  }

  initUI() {
    this.el = {
      objectiveFill: document.getElementById('obj-fill'),
      objectiveStatus: document.getElementById('obj-status'),
      objectiveTitle: document.getElementById('obj-title'),
      frenchMorale: document.getElementById('french-morale'),
      britishMorale: document.getElementById('british-morale'),
      armyMorale: document.getElementById('army-morale'),
      present: document.getElementById('present-count'),
      fieldOrders: document.getElementById('field-orders'),
      orderText: document.getElementById('order-text'),
      messages: document.getElementById('messages'),
      panel: document.getElementById('selection-panel'),
      selIcon: document.getElementById('sel-icon'),
      selKicker: document.getElementById('sel-kicker'),
      selName: document.getElementById('sel-name'),
      selStrength: document.getElementById('sel-strength'),
      selMorale: document.getElementById('sel-morale'),
      selState: document.getElementById('sel-state'),
      selStrengthBar: document.getElementById('sel-strength-bar'),
      selMoraleBar: document.getElementById('sel-morale-bar'),
      formationText: document.getElementById('formation-text'),
      holdText: document.getElementById('hold-text'),
      roster: document.getElementById('roster'),
      minimap: minimapCanvas,
      clock: document.getElementById('clock'),
      toast: document.getElementById('toast'),
      hint: document.getElementById('hint'),
      hintText: document.getElementById('hint-text'),
      pauseBtn: document.getElementById('pause-btn'),
      pauseWash: document.getElementById('pause-wash'),
      result: document.getElementById('result'),
      resultKicker: document.getElementById('result-kicker'),
      resultTitle: document.getElementById('result-title'),
      resultCopy: document.getElementById('result-copy'),
      resultStats: document.getElementById('result-stats'),
      helpPop: document.getElementById('help-pop'),
      soundBtn: document.getElementById('sound-btn')
    };
    document.querySelectorAll('.speed-group button').forEach(btn => {
      btn.addEventListener('click', () => {
        this.speed = Number(btn.dataset.speed);
        document.querySelectorAll('.speed-group button').forEach(b => b.classList.toggle('active', b === btn));
        this.audio.resume();
      });
    });
    document.getElementById('pause-btn').addEventListener('click', () => this.togglePause());
    document.getElementById('sound-btn').addEventListener('click', () => {
      this.audio.resume();
      this.audio.setEnabled(!this.audio.enabled);
      this.el.soundBtn.classList.toggle('muted', !this.audio.enabled);
    });
    document.getElementById('help-btn').addEventListener('click', e => {
      e.stopPropagation();
      this.helpOpen = !this.helpOpen;
      this.el.helpPop.classList.toggle('hidden', !this.helpOpen);
    });
    document.getElementById('close-sel').addEventListener('click', () => this.clearSelection());
    document.querySelectorAll('.sel-actions button').forEach(btn => {
      btn.addEventListener('click', () => this.doAction(btn.dataset.action));
    });
    document.getElementById('replay-btn').addEventListener('click', () => location.reload());
    document.getElementById('observe-btn').addEventListener('click', () => {
      this.el.result.classList.add('hidden');
      this.observing = true;
      this.paused = false;
      this.el.pauseWash.classList.add('hidden');
    });
    minimapCanvas.addEventListener('pointerdown', e => {
      e.stopPropagation();
      this.audio.resume();
      const r = minimapCanvas.getBoundingClientRect();
      const wx = (e.clientX - r.left) / r.width * WORLD.w;
      const wy = (e.clientY - r.top) / r.height * WORLD.h;
      this.camera.tx = wx;
      this.camera.ty = wy;
      this.camera.x = lerp(this.camera.x, wx, .35);
      this.camera.y = lerp(this.camera.y, wy, .35);
    });
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      this.audio.resume();
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); this.togglePause(); return; }
      if (k === 'escape') {
        if (this.helpOpen) { this.helpOpen = false; this.el.helpPop.classList.add('hidden'); }
        else this.clearSelection();
        return;
      }
      if (k === 'f') { this.doAction('formation'); e.preventDefault(); }
      if (k === 'h') { this.doAction('hold'); e.preventDefault(); }
      if (k === 'c') { this.doAction('charge'); e.preventDefault(); }
      if (k === 'm') { this.camera.tx = 1370; this.camera.ty = 820; }
      if (k === '=' || k === '+') this.zoomBy(1.18);
      if (k === '-' || k === '_') this.zoomBy(.84);
      if (/^[1-6]$/.test(k)) {
        const u = this.playerUnits[Number(k) - 1];
        if (u) {
          if (e.shiftKey) this.toggleUnitSelection(u);
          else this.selectUnit(u);
        }
      }
      this.keys.add(k);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => this.onPointerDown(e));
    canvas.addEventListener('pointermove', e => this.onPointerMove(e));
    canvas.addEventListener('pointerup', e => this.onPointerUp(e));
    canvas.addEventListener('pointercancel', e => this.onPointerUp(e));
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const before = this.screenToWorld(e.clientX, e.clientY);
      this.zoomBy(Math.exp(-e.deltaY * .0012));
      const after = this.screenToWorld(e.clientX, e.clientY);
      this.camera.tx += (before.x - after.x);
      this.camera.ty += (before.y - after.y);
      this.clampCamera();
    }, { passive: false });
    canvas.addEventListener('mouseleave', () => {
      this.hoverUnit = null;
      this.hoverEl.classList.add('hidden');
    });
  }

  zoomBy(f) {
    this.camera.tz = clamp(this.camera.tz * f, this.minZoom, this.maxZoom);
  }

  togglePause() {
    if (this.over && !this.observing) return;
    this.paused = !this.paused;
    this.el.pauseBtn.classList.toggle('paused', this.paused);
    this.el.pauseWash.classList.toggle('hidden', !this.paused);
    const p = this.el.pauseBtn.querySelector('.pause-x');
    if (p) p.classList.toggle('hidden', !this.paused);
    if (!this.paused) this.audio.resume();
  }

  worldToScreen(x, y) {
    return {
      x: (x - this.camera.x) * this.camera.zoom + this.vw / 2,
      y: (y - this.camera.y) * this.camera.zoom + this.vh / 2
    };
  }

  screenToWorld(x, y) {
    return {
      x: (x - this.vw / 2) / this.camera.zoom + this.camera.x,
      y: (y - this.vh / 2) / this.camera.zoom + this.camera.y
    };
  }

  onPointerDown(e) {
    this.audio.resume();
    const x = e.clientX, y = e.clientY;
    const w = this.screenToWorld(x, y);
    this.pointer.x = x; this.pointer.y = y; this.pointer.wx = w.x; this.pointer.wy = w.y;
    this.pointer.down = true;
    this.pointer.button = e.button;

    if (e.pointerType === 'touch') {
      this.touchPoints.set(e.pointerId, { x, y });
      if (this.touchPoints.size === 1) {
        this.touch = { id: e.pointerId, x, y, sx: x, sy: y, moved: false, camx: this.camera.tx, camy: this.camera.ty, world: w };
      } else if (this.touchPoints.size === 2) {
        if (this.touch) this.touch.moved = true;
        this.touch = null;
        const pts = [...this.touchPoints.values()];
        const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
        this.pinch = {
          dist: Math.max(20, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)),
          zoom: this.camera.zoom,
          worldMid: this.screenToWorld(mx, my)
        };
      }
      return;
    }

    if (e.button === 1) {
      this.panDrag = { x, y, camx: this.camera.x, camy: this.camera.y };
      canvas.classList.add('panning');
      e.preventDefault();
      return;
    }
    if (e.button === 2) {
      this.orderDrag = { x, y, wx: w.x, wy: w.y, moved: false };
      const enemy = this.unitAt(w.x, w.y, 'gb');
      if (enemy) this.orderDrag.enemy = enemy;
      return;
    }
    if (e.button === 0) {
      this.dragBox = { x, y, sx: x, sy: y, moved: false };
    }
  }

  onPointerMove(e) {
    const x = e.clientX, y = e.clientY;
    const w = this.screenToWorld(x, y);
    this.pointer.x = x; this.pointer.y = y; this.pointer.wx = w.x; this.pointer.wy = w.y;

    this.hoverUnit = this.unitAt(w.x, w.y);
    if (this.hoverUnit && !this.hoverUnit.routing) {
      this.showHoverCard(this.hoverUnit, x, y);
      canvas.classList.add('over-unit');
    } else {
      this.hoverEl.classList.add('hidden');
      canvas.classList.remove('over-unit');
    }

    if (e.pointerType === 'touch') {
      if (this.touchPoints.has(e.pointerId)) this.touchPoints.set(e.pointerId, { x, y });
      if (this.pinch && this.touchPoints.size >= 2) {
        const pts = [...this.touchPoints.values()];
        const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
        const nd = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const z = clamp(this.pinch.zoom * nd / this.pinch.dist, this.minZoom, this.maxZoom);
        this.camera.zoom = z; this.camera.tz = z;
        this.camera.tx = this.pinch.worldMid.x - (mx - this.vw / 2) / z;
        this.camera.ty = this.pinch.worldMid.y - (my - this.vh / 2) / z;
        this.camera.x = this.camera.tx; this.camera.y = this.camera.ty;
        this.clampCamera();
        if (this.touch) this.touch.moved = true;
        return;
      }
      if (this.touch && this.touch.id === e.pointerId) {
        const dx = x - this.touch.sx, dy = y - this.touch.sy;
        if (Math.hypot(dx, dy) > 8) this.touch.moved = true;
        if (this.touch.moved) {
          this.camera.tx = this.touch.camx - dx / this.camera.zoom;
          this.camera.ty = this.touch.camy - dy / this.camera.zoom;
          this.camera.x = this.camera.tx;
          this.camera.y = this.camera.ty;
          this.clampCamera();
        }
      }
      return;
    }

    if (this.panDrag) {
      this.camera.tx = this.panDrag.camx - (x - this.panDrag.x) / this.camera.zoom;
      this.camera.ty = this.panDrag.camy - (y - this.panDrag.y) / this.camera.zoom;
      this.clampCamera();
    }
    if (this.dragBox) {
      if (Math.hypot(x - this.dragBox.sx, y - this.dragBox.sy) > 5) this.dragBox.moved = true;
      this.dragBox.x = x; this.dragBox.y = y;
    }
    if (this.orderDrag) {
      if (Math.hypot(x - this.orderDrag.x, y - this.orderDrag.y) > 7) this.orderDrag.moved = true;
    }
    if (this.selection.size) {
      this.el.hint.classList.add('show');
      this.el.hintText.textContent = this.hoverUnit && this.hoverUnit.side === 'gb'
        ? 'Right-click to attack'
        : 'Right-click to march · right-drag to dress the line';
    }
  }

  onPointerUp(e) {
    const x = e.clientX, y = e.clientY;
    const w = this.screenToWorld(x, y);

    if (e.pointerType === 'touch') {
      const wasPinching = !!this.pinch;
      this.touchPoints.delete(e.pointerId);
      if (this.touchPoints.size < 2) this.pinch = null;
      if (this.touch && this.touch.id === e.pointerId) {
        if (!this.touch.moved && !wasPinching && performance.now() > this.suppressTouch) {
          this.tapAt(w.x, w.y);
        }
        if (wasPinching) this.suppressTouch = performance.now() + 260;
        this.touch = null;
      }
      this.pointer.down = false;
      return;
    }

    if (this.panDrag) {
      this.panDrag = null;
      canvas.classList.remove('panning');
    }
    if (this.dragBox) {
      if (this.dragBox.moved) {
        this.boxSelect(this.dragBox.sx, this.dragBox.sy, x, y, e.shiftKey);
      } else {
        this.clickSelect(w.x, w.y, e.shiftKey);
      }
      this.dragBox = null;
    }
    if (this.orderDrag) {
      const target = this.unitAt(w.x, w.y, 'gb') || this.orderDrag.enemy;
      const start = { x: this.orderDrag.wx, y: this.orderDrag.wy };
      const dragDist = Math.hypot(x - this.orderDrag.x, y - this.orderDrag.y);
      if (target && !target.routing) {
        this.issueAttack(target);
      } else {
        let facing = null;
        if (dragDist > 18) {
          facing = humanAngle(start.x, start.y, w.x, w.y);
        }
        this.issueMove(start.x, start.y, facing);
      }
      this.orderDrag = null;
    }
    this.pointer.down = false;
  }

  tapAt(x, y) {
    const own = this.unitAt(x, y, 'fr');
    const enemy = this.unitAt(x, y, 'gb');
    if (own && !own.routing) {
      this.selectUnit(own);
      return;
    }
    if (enemy) {
      if (this.selection.size) this.issueAttack(enemy);
      return;
    }
    if (this.selection.size) this.issueMove(x, y, null);
    else this.clearSelection();
  }

  clickSelect(wx, wy, additive) {
    const unit = this.unitAt(wx, wy, 'fr');
    if (unit && !unit.routing) {
      if (additive) this.toggleUnitSelection(unit);
      else this.selectUnit(unit);
    } else if (!additive) {
      this.clearSelection();
    }
  }

  boxSelect(x1, y1, x2, y2, additive) {
    const a = this.screenToWorld(Math.min(x1, x2), Math.min(y1, y2));
    const b = this.screenToWorld(Math.max(x1, x2), Math.max(y1, y2));
    if (!additive) this.selection.clear();
    for (const u of this.playerUnits) {
      if (u.routing || u.dead) continue;
      const cx = u.x, cy = u.y;
      const inBox = cx >= a.x - 20 && cx <= b.x + 20 && cy >= a.y - 20 && cy <= b.y + 20;
      if (inBox) this.selection.add(u);
    }
    this.refreshSelection();
  }

  unitAt(wx, wy, side = null) {
    let best = null, bd = Infinity;
    for (const u of this.units) {
      if (u.dead || u.routing) continue;
      if (side && u.side !== side) continue;
      const d = dist(wx, wy, u.x, u.y);
      const threshold = u.type === 'cav' ? 55 : 46;
      if (d < threshold && d < bd) { bd = d; best = u; }
    }
    if (best) return best;
    // then search individual soldiers for precise clicks
    for (const u of this.units) {
      if (u.dead || u.routing) continue;
      if (side && u.side !== side) continue;
      for (const s of u.soldiers) {
        if (!s.alive) continue;
        const d = dist(wx, wy, s.x, s.y);
        if (d < 13 && d < bd) { bd = d; best = u; }
      }
    }
    return best;
  }

  selectUnit(unit, additive = false) {
    if (!unit || unit.side !== 'fr' || unit.routing) return;
    if (!additive) this.selection.clear();
    this.selection.add(unit);
    this.refreshSelection();
    this.audio.order();
    this.el.hint.classList.add('show');
  }

  toggleUnitSelection(unit) {
    if (this.selection.has(unit)) this.selection.delete(unit);
    else this.selection.add(unit);
    this.refreshSelection();
  }

  clearSelection() {
    this.selection.clear();
    this.refreshSelection();
  }

  refreshSelection() {
    for (const u of this.units) u.selected = this.selection.has(u);
    if (!this.selection.size) {
      this.el.panel.classList.add('hidden');
      this.el.hint.classList.remove('show');
    } else {
      this.el.panel.classList.remove('hidden');
      this.updateSelectionPanel();
    }
    this.updateRoster();
  }

  issueMove(x, y, facing) {
    if (!this.selection.size) return;
    const units = [...this.selection];
    let cx = 0, cy = 0;
    for (const u of units) { cx += u.x; cy += u.y; }
    cx /= units.length; cy /= units.length;
    const spread = units.length > 1 ? .86 : 0;
    for (const u of units) {
      if (u.dead || u.routing) continue;
      const tx = x + (u.x - cx) * spread;
      const ty = y + (u.y - cy) * spread;
      u.setMove(tx, ty, facing);
    }
    this.audio.order();
    this.ringAt(x, y, '#d2b474', 18);
    this.el.hint.classList.add('show');
  }

  issueAttack(enemy) {
    if (!this.selection.size) return;
    for (const u of this.selection) {
      if (!u.routing) {
        u.setAttack(enemy);
        if (u.type === 'cav' && u.distanceTo(enemy) < 420) u.charge();
      }
    }
    this.audio.advance();
    this.ringAt(enemy.x, enemy.y, '#d77b61', 24);
    this.message(`Attack ordered: ${enemy.short}`);
  }

  doAction(action) {
    if (!this.selection.size) return;
    const usable = [...this.selection].filter(u => !u.routing && !u.dead);
    if (!usable.length) return;
    if (action === 'formation') {
      let any = false;
      for (const u of usable) any = u.toggleFormation() || any;
      if (!any) this.message('Cavalry and guns cannot change formation');
      else this.audio.order();
    }
    if (action === 'hold') {
      const state = !usable[0].holdFire;
      for (const u of usable) u.holdFire = state;
      this.message(state ? 'Hold your fire' : 'Fire at will');
      this.audio.order();
    }
    if (action === 'charge') {
      for (const u of usable) {
        if (!u.charging) u.charge();
      }
      this.message('Bayonets — advance!');
      this.setFieldOrders('The charge is ordered. Close quickly; a broken formation will not survive long in the smoke.');
    }
    this.updateSelectionPanel();
    this.updateRoster();
  }

  setFieldOrders(text) {
    this.el.orderText.textContent = text;
    this.el.fieldOrders.classList.remove('quiet');
  }

  showToast(title, sub = '') {
    const t = this.el.toast;
    t.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  message(text, type = '') {
    const el = document.createElement('div');
    el.className = 'message ' + type;
    el.innerHTML = text.replace(/\b(has broken!|rout|Allied|French|Guard|crossroads)\b/gi, '<b>$1</b>');
    this.el.messages.appendChild(el);
    setTimeout(() => el.remove(), 5000);
    while (this.el.messages.children.length > 4) this.el.messages.firstChild.remove();
  }

  showHoverCard(u, x, y) {
    const el = this.hoverEl;
    el.classList.remove('hidden');
    el.querySelector('.hc-side').textContent = u.side === 'fr' ? 'French' : 'Allied';
    el.querySelector('.hc-side').className = 'hc-side ' + u.side;
    el.querySelector('strong').textContent = u.name;
    el.querySelector('.hc-sub').textContent = `${u.template.label} · ${u.aliveCount} men · ${u.shortState}`;
    el.querySelector('.hc-bar i').style.width = (u.strength * 100) + '%';
    el.style.left = Math.min(this.vw - 235, x + 17) + 'px';
    el.style.top = Math.min(this.vh - 90, y + 17) + 'px';
  }

  buildRoster() {
    this.el.roster.innerHTML = '';
    this.playerUnits.forEach((u, i) => {
      const card = document.createElement('button');
      card.className = 'unit-card';
      card.innerHTML = `
        <div class="u-flag"></div>
        <div class="sel-pip"></div>
        <div class="u-icon">${ICONS[u.template.icon]}</div>
        <span class="u-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="u-name">${u.short}</span>
        <div class="u-bar"><i></i></div>
        <span class="u-men"></span>
        <span class="u-state"></span>`;
      card.addEventListener('click', e => {
        this.audio.resume();
        if (e.shiftKey) this.toggleUnitSelection(u);
        else this.selectUnit(u);
      });
      u.card = card;
      this.el.roster.appendChild(card);
    });
    this.updateRoster();
  }

  updateRoster() {
    for (const u of this.playerUnits) {
      if (!u.card) continue;
      u.card.classList.toggle('selected', this.selection.has(u));
      u.card.classList.toggle('routed', u.routing || u.dead);
      u.card.querySelector('.u-men').textContent = `${u.aliveCount} / ${u.maxCount}`;
      u.card.querySelector('.u-state').textContent = u.shortState;
      const bar = u.card.querySelector('.u-bar i');
      bar.style.width = (u.strength * 100) + '%';
      bar.style.background = u.strength > .55 ? '#a9b87d' : u.strength > .28 ? '#c3a25e' : '#b25f4e';
    }
  }

  updateSelectionPanel() {
    if (!this.selection.size) return;
    const units = [...this.selection];
    const one = units.length === 1 ? units[0] : null;
    if (one) {
      this.el.selIcon.innerHTML = ICONS[one.template.icon];
      this.el.selKicker.textContent = one.template.label;
      this.el.selName.textContent = one.name;
      this.el.selStrength.textContent = `${one.aliveCount} / ${one.maxCount}`;
      this.el.selMorale.textContent = one.routing ? 'Broken' : one.morale.toFixed(0) + ' %';
      this.el.selState.textContent = one.shortState;
      this.el.selStrengthBar.style.width = (one.strength * 100) + '%';
      this.el.selMoraleBar.style.width = clamp(one.morale, 0, 100) + '%';
      this.el.selMoraleBar.style.background = one.morale > 55 ? '#8fa76a' : one.morale > 30 ? '#c6a15d' : '#bd6352';
      this.el.formationText.textContent = one.formation === 'line' ? 'Form column' : 'Form line';
      this.el.holdText.textContent = one.holdFire ? 'Fire at will' : 'Hold fire';
    } else {
      const alive = units.reduce((n, u) => n + u.aliveCount, 0);
      const max = units.reduce((n, u) => n + u.maxCount, 0);
      const morale = units.reduce((n, u) => n + u.morale, 0) / units.length;
      this.el.selIcon.innerHTML = ICONS.guard;
      this.el.selKicker.textContent = 'Grande Armée';
      this.el.selName.textContent = `${units.length} regiments selected`;
      this.el.selStrength.textContent = `${alive} / ${max}`;
      this.el.selMorale.textContent = morale.toFixed(0) + ' %';
      this.el.selState.textContent = 'Combined';
      this.el.selStrengthBar.style.width = (alive / max * 100) + '%';
      this.el.selMoraleBar.style.width = clamp(morale, 0, 100) + '%';
      this.el.formationText.textContent = 'Form line';
      this.el.holdText.textContent = units[0].holdFire ? 'Fire at will' : 'Hold fire';
    }
    document.querySelectorAll('.sel-actions button').forEach(btn => {
      const a = btn.dataset.action;
      const usable = units.some(u => !u.routing && !u.dead);
      btn.disabled = !usable;
      if (a === 'hold') btn.classList.toggle('active', units.every(u => u.holdFire));
      if (a === 'charge') btn.classList.toggle('active', units.some(u => u.charging));
      if (a === 'formation') btn.classList.toggle('active', units.some(u => u.formation === 'column'));
    });
  }

  updateHUD(force = false) {
    this.hudTick -= 1 / 60;
    if (!force && this.hudTick > 0) return;
    this.hudTick = .16;
    const fr = this.units.filter(u => u.side === 'fr');
    const gb = this.units.filter(u => u.side === 'gb');
    const frMorale = this.armyMorale(fr);
    const gbMorale = this.armyMorale(gb);
    this.el.frenchMorale.style.width = clamp(frMorale, 4, 100) + '%';
    this.el.britishMorale.style.width = clamp(gbMorale, 4, 100) + '%';
    const avg = frMorale;
    this.el.armyMorale.textContent = avg > 70 ? 'Steady' : avg > 45 ? 'Shaken' : avg > 22 ? 'Wavering' : 'Broken';
    this.el.armyMorale.style.color = avg > 45 ? 'var(--gold)' : '#dc937d';
    const present = this.units.reduce((n, u) => n + u.aliveCount, 0);
    this.el.present.textContent = present;
    this.el.objectiveFill.style.width = (this.capture.taken ? 100 : this.capture.progress) + '%';
    const holdLeft = Math.max(0, Math.ceil(30 - this.capture.hold));
    this.el.objectiveStatus.textContent = this.capture.taken
      ? this.capture.contested
        ? 'Crossroads contested — the farm changes hands'
        : this.capture.frenchHolding
          ? `Crossroads held — break the centre (${holdLeft}s)`
          : 'Crossroads undefended — return to the farm'
      : this.capture.contested
        ? 'Contested — the farm changes hands'
        : this.capture.progress > 0
          ? `French infantry closing on the farm (${Math.round(this.capture.progress)}%)`
          : 'The farm is held by the Allies';
    const minutes = 40 + Math.floor(this.time / 12);
    this.el.clock.textContent = `15:${String(minutes).padStart(2, '0')}`;
    for (const u of this.playerUnits) u.card && (u.card.querySelector('.u-men').textContent = `${u.aliveCount} / ${u.maxCount}`);
    this.updateRoster();
    if (this.selection.size) this.updateSelectionPanel();
    this.drawMinimap();
  }

  armyMorale(units) {
    if (!units.length) return 0;
    const total = units.reduce((n, u) => n + (u.dead || u.routing ? 0 : u.effectiveMorale) * u.maxCount, 0);
    const max = units.reduce((n, u) => n + u.maxCount, 0);
    return total / max;
  }

  after(delay, fn) {
    this.timers.push({ t: delay, fn });
  }

  spawnMuzzle(x, y, angle, power = 1) {
    for (let i = 0; i < 2; i++) {
      const a = angle + rand(-.2, .2);
      this.particles.push({
        kind: 'smoke',
        x: x + Math.sin(a) * rand(2, 8), y: y - Math.cos(a) * rand(2, 8),
        vx: Math.sin(a) * rand(4, 12) + rand(-2, 2), vy: -Math.cos(a) * rand(4, 12) + rand(-2, 2),
        r: rand(6, 11) * power, grow: rand(6, 12), life: rand(1.9, 3.6), maxLife: 3.6,
        alpha: rand(.26, .42), rot: rand(0, TAU), spin: rand(-.5, .5), sprite: randInt(0, 3)
      });
    }
    this.particles.push({
      kind: 'flash', x, y, vx: 0, vy: 0, r: rand(4, 7) * power, life: .1, maxLife: .1, alpha: .9
    });
  }

  spawnCannonSmoke(x, y, angle) {
    for (let i = 0; i < 20; i++) {
      const a = angle + rand(-.5, .5);
      this.particles.push({
        kind: 'smoke',
        x: x + Math.sin(a) * rand(2, 26), y: y - Math.cos(a) * rand(2, 26),
        vx: Math.sin(a) * rand(9, 38) + rand(-4, 4), vy: -Math.cos(a) * rand(9, 38) + rand(-4, 4),
        r: rand(10, 20), grow: rand(18, 36), life: rand(1.8, 3.8), maxLife: 3.8,
        alpha: rand(.38, .62), rot: rand(0, TAU), spin: rand(-.5, .5), sprite: randInt(0, 3)
      });
    }
    this.particles.push({ kind: 'flash', x, y, r: 18, life: .16, maxLife: .16, alpha: 1 });
    this.rings.push({ x, y, r: 8, maxR: 52, life: .55, maxLife: .55, color: 'rgba(235,200,134,.6)', width: 2 });
    this.shake = Math.max(this.shake, 7);
  }

  spawnBlood(x, y, dir, amount = 7) {
    for (let i = 0; i < amount; i++) {
      const a = dir + rand(-.8, .8);
      const sp = rand(10, 72);
      this.particles.push({
        kind: 'blood',
        x, y, vx: Math.sin(a) * sp, vy: -Math.cos(a) * sp,
        r: rand(.7, 2.4), life: rand(.4, 1.1), maxLife: 1.1, alpha: rand(.35, .75)
      });
    }
    this.decals.push({ x, y, r: rand(5, 10), a: rand(.06, .13), color: 'rgba(80,27,21,1)' });
    if (this.decals.length > 250) this.decals.shift();
  }

  killSoldier(unit, soldier, direction, shooterSide, melee = false) {
    if (!soldier.alive || this.over) return;
    soldier.alive = false;
    this.totalKills++;
    const power = melee ? .8 : 1.4;
    const rd = new Ragdoll(soldier.x, soldier.y, soldier.angle, unit.side, {
      impulse: { x: Math.sin(direction) * 45 * power, y: -Math.cos(direction) * 45 * power },
      explosion: false
    });
    rd.weaponAngle = soldier.angle + rand(-1.9, 1.9);
    this.ragdolls.push(rd);
    if (this.ragdolls.length > this.maxRagdolls) this.ragdolls.shift();
    this.spawnBlood(soldier.x, soldier.y, direction, melee ? 4 : randInt(4, 9));
    unit.takeCasualty(this, direction);
    unit.engaged = true;
    this.audio.shot(.018, 0);
    if (unit.morale <= 22 && !unit.routing) unit.rout();
    this.floating.push({ x: soldier.x, y: soldier.y - 10, text: unit.side === 'fr' ? '−' : '−', life: .75, maxLife: .75, color: unit.side === 'fr' ? '#d37e6b' : '#e4bd83' });
  }

  fireProjectile(x, y, target, side, unit) {
    if (!target || target.dead) return;
    const tx = target.x + rand(-38, 38);
    const ty = target.y + rand(-28, 28);
    const d = dist(x, y, tx, ty);
    this.projectiles.push({
      x, y, sx: x, sy: y, tx, ty, t: 0,
      dur: clamp(d / 730, .3, 1.5), side, unit
    });
  }

  explode(x, y, side) {
    this.shake = Math.max(this.shake, 9);
    this.rings.push({ x, y, r: 8, maxR: 70, life: .8, maxLife: .8, color: 'rgba(237,208,142,.5)', width: 2.5 });
    this.rings.push({ x, y, r: 30, maxR: 110, life: 1.2, maxLife: 1.2, color: 'rgba(57,47,31,.32)', width: 6 });
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        kind: 'debris', x, y, vx: rand(-90, 90), vy: rand(-90, 90),
        r: rand(1, 3), life: rand(.4, 1), maxLife: 1, alpha: .7
      });
    }
    for (let i = 0; i < 9; i++) {
      this.particles.push({
        kind: 'smoke', x: x + rand(-12, 12), y: y + rand(-12, 12),
        vx: rand(-8, 8), vy: rand(-8, 8), r: rand(9, 18), grow: rand(14, 30),
        life: rand(1.2, 2.8), maxLife: 2.8, alpha: rand(.25, .45),
        rot: rand(0, TAU), spin: rand(-.5, .5), sprite: randInt(0, 3)
      });
    }
    this.decals.push({ x, y, r: rand(13, 22), a: .12, color: 'rgba(32,30,21,1)', crater: true });
    if (this.decals.length > 250) this.decals.shift();
    this.audio.cannon(.12, 0);
    // casualties around the impact
    let kills = 0;
    for (const u of this.units) {
      if (u.side === side || u.dead) continue;
      for (const s of u.soldiers) {
        if (!s.alive) continue;
        const d = dist(x, y, s.x, s.y);
        if (d < 62 && Math.random() < .9 - d / 80) {
          kills++;
          this.after(rand(0, .08), () => {
            if (!s.alive) return;
            this.killSoldier(u, s, rand(0, TAU), side, false);
            const rd = this.ragdolls[this.ragdolls.length - 1];
            if (rd) { rd.kick(Math.cos(Math.atan2(s.y - y, s.x - x)) * 4, Math.sin(Math.atan2(s.y - y, s.x - x)) * 4, 1.6); }
          });
          if (kills >= 4) break;
        }
      }
      if (kills >= 4) break;
    }
  }

  ringAt(x, y, color, r) {
    this.rings.push({ x, y, r: 4, maxR: r, life: .5, maxLife: .5, color, width: 1.5 });
  }

  update(dt) {
    if (!this.paused && !this.over || this.observing) {
      this.time += dt;
      for (let i = this.timers.length - 1; i >= 0; i--) {
        const t = this.timers[i];
        t.t -= dt;
        if (t.t <= 0) {
          this.timers.splice(i, 1);
          try { t.fn(); } catch (err) { console.error(err); }
        }
      }
      for (const u of this.units) u.update(dt, this);
      this.updateAI(dt);
      this.updateObjective(dt);
      this.updateProjectiles(dt);
      for (let i = this.ragdolls.length - 1; i >= 0; i--) {
        this.ragdolls[i].update(dt);
        if (this.ragdolls[i].alpha <= 0) this.ragdolls.splice(i, 1);
      }
      this.updateParticles(dt);
      this.updateEffects(dt);
      this.chimneyClock -= dt;
      if (this.chimneyClock <= 0) {
        this.chimneyClock = .9;
        this.spawnChimney();
      }
      this.checkBattleEnd();
    }
    this.updateCamera(dt);
    this.updateMist(dt);
  }

  updateCamera(dt) {
    const pan = 780 / this.camera.zoom * dt;
    let dx = 0, dy = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= pan;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += pan;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= pan;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += pan;
    if (dx || dy) {
      this.camera.tx += dx;
      this.camera.ty += dy;
    }
    // gently follow a selected unit when idle? only when pressing Tab could, skip
    const ease = 1 - Math.exp(-7 * Math.max(.001, dt));
    this.camera.x = lerp(this.camera.x, this.camera.tx, ease);
    this.camera.y = lerp(this.camera.y, this.camera.ty, ease);
    this.camera.zoom = lerp(this.camera.zoom, this.camera.tz, 1 - Math.exp(-10 * Math.max(.001, dt)));
    this.shake *= Math.exp(-7 * Math.max(.001, dt));
    if (this.shake < .05) this.shake = 0;
    this.clampCamera();
    // selection ring / hint
    this.el.hint.classList.toggle('show', this.selection.size > 0);
  }

  updateMist(dt) {
    for (const m of this.mist) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.x - m.r > WORLD.w) m.x = -m.r;
      if (m.y < 150) m.vy = Math.abs(m.vy);
      if (m.y > 1550) m.vy = -Math.abs(m.vy);
    }
  }

  updateAI(dt) {
    this.aiClock -= dt;
    if (this.aiClock > 0) return;
    this.aiClock = rand(2.1, 3.8);
    const french = this.units.filter(u => u.side === 'fr' && !u.routing && !u.dead);
    const british = this.units.filter(u => u.side === 'gb' && !u.routing && !u.dead);
    if (!french.length) return;

    for (const u of british) {
      if (u.dead) continue;
      if (u.type === 'arty') {
        let best = null, bd = Infinity;
        for (const f of french) { const d = u.distanceTo(f); if (d < 800 && d < bd) { bd = d; best = f; } }
        if (best) u.target = best;
        continue;
      }
      let best = null, bd = Infinity;
      for (const f of french) {
        let d = u.distanceTo(f);
        if (u.type === 'cav' && f.type === 'arty') d *= .6;
        if (d < bd) { bd = d; best = f; }
      }
      const activeRange = u.type === 'cav' ? 1100 : 650;
      if (best && (bd < activeRange || this.time > 35 || this.aiWave > 0)) {
        if (u.target !== best) u.setAttack(best);
        if (u.type === 'cav' && bd < 390 && !u.charging && this.time > 8) u.charge();
        if (u.type === 'line' && bd < 210 && this.time > 25) u.charge();
      } else if (this.time > 28) {
        if (u.type === 'cav') u.setMove(clamp(1050 + Math.sin(this.time * .1) * 220, 400, 2100), 890);
        else if (u.type === 'light') u.setMove(1550, 760);
        else u.setMove(clamp(u.x, 850, 1450), 700);
      }
    }

    // Ingame interference: if a British unit has spent too long static near the farm, press it forward
    if (this.capture.progress > 30) {
      for (const u of british) {
        if ((u.type === 'line' || u.type === 'guard') && u.distanceTo({ x: 1380, y: 820 }) < 320) {
          if (!u.charging && Math.random() < .3) u.charge();
        }
      }
    }
  }

  updateObjective(dt) {
    const z = this.terrain.farmZone;
    const frNear = this.units.filter(u => u.side === 'fr' && !u.routing && !u.dead && u.distanceTo(z) < 150);
    const gbNear = this.units.filter(u => u.side === 'gb' && !u.routing && !u.dead && u.distanceTo(z) < 140);
    this.capture.frenchHolding = frNear.length > 0;
    this.capture.britishNear = gbNear.length;
    this.capture.contested = frNear.length > 0 && gbNear.length > 0;
    if (frNear.length && !gbNear.length && !this.capture.taken) {
      const rate = 7 + frNear.length * 1.7;
      this.capture.progress = Math.min(100, this.capture.progress + rate * dt);
      if (this.capture.progress >= 100) {
        this.capture.taken = true;
        this.capture.progress = 100;
        this.message('The crossroads is taken! The Allied centre wavers', '');
        this.showToast('La Haye Sainte is ours', 'The Allied centre is giving way');
        this.audio.bugle();
        for (const u of this.units) if (u.side === 'gb' && !u.routing) u.morale = Math.max(0, u.morale - 27);
        this.setFieldOrders('The farm has fallen. Press the advantage before the Guard can restore the line.');
        for (const u of this.units) {
          if (u.side === 'gb' && u.morale <= 22) u.rout();
        }
      }
    } else if (!this.capture.taken) {
      this.capture.progress = Math.max(0, this.capture.progress - (gbNear.length ? 3.2 : 1.2) * dt);
    }
    if (this.capture.taken) {
      if (frNear.length && !this.capture.contested) {
        this.capture.hold += dt;
      } else {
        // the farm must be held, not merely visited
        const drain = this.capture.contested ? .8 : .5;
        this.capture.hold = Math.max(0, this.capture.hold - dt * drain);
      }
      this.el.objectiveTitle.textContent = 'Break the Allied centre';
    }
    // keep routed units counting down
    for (const u of this.units) {
      if (u.side === 'gb' && u.routing) u.routClock += 0;
    }
  }

  spawnChimney() {
    this.particles.push({
      kind: 'smoke',
      x: 1470, y: 694, vx: rand(1, 5), vy: rand(-5, -2),
      r: rand(5, 9), grow: rand(4, 9), life: rand(3, 4.8), maxLife: 4.8,
      alpha: rand(.1, .2), rot: rand(0, TAU), spin: rand(-.2, .2), sprite: randInt(0, 3)
    });
    if (Math.random() < .35) {
      // distant battery rumble
      this.audio.cannon(.018, rand(-.8, .8));
    }
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      const k = clamp(p.t / p.dur, 0, 1);
      p.x = lerp(p.sx, p.tx, k);
      p.y = lerp(p.sy, p.ty, k);
      if (k >= 1) {
        this.projectiles.splice(i, 1);
        this.explode(p.tx, p.ty, p.side);
      }
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      if (p.kind === 'smoke') {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= (1 - dt * .65); p.vy *= (1 - dt * .65);
        p.vy -= dt * 1.1;
        p.r += p.grow * dt;
        p.rot += p.spin * dt;
      } else if (p.kind === 'blood') {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= (1 - dt * 2.4); p.vy *= (1 - dt * 2.4);
      } else if (p.kind === 'debris') {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= (1 - dt * 2.1); p.vy *= (1 - dt * 2.1);
      }
    }
    if (this.particles.length > 520) this.particles.splice(0, this.particles.length - 520);
  }

  updateEffects(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t += dt;
      if (t.t >= t.life) this.tracers.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.floating.length - 1; i >= 0; i--) {
      const f = this.floating[i];
      f.life -= dt;
      f.y -= dt * 13;
      if (f.life <= 0) this.floating.splice(i, 1);
    }
    for (const u of this.units) {
      for (const s of u.soldiers) s.flash = Math.max(0, s.flash - dt * 4);
    }
  }

  checkBattleEnd() {
    if (this.over) return;
    const fr = this.units.filter(u => u.side === 'fr');
    const gb = this.units.filter(u => u.side === 'gb');
    const frFighting = fr.filter(u => !u.dead && !u.routing);
    const gbFighting = gb.filter(u => !u.dead && !u.routing);
    const gbMorale = this.armyMorale(gb);
    const frMorale = this.armyMorale(fr);
    if (!frFighting.length) return this.endBattle(false);
    if (!gbFighting.length || gbMorale < 10) {
      return this.endBattle(true);
    }
    if (this.capture.taken && ((this.capture.hold > 15 && gbMorale < 38) || this.capture.hold > 30)) {
      return this.endBattle(true);
    }
    if (frMorale < 4) return this.endBattle(false);
  }

  endBattle(victory) {
    if (this.over) return;
    this.over = true;
    this.observing = false;
    this.paused = false;
    this.el.pauseBtn.classList.remove('paused');
    this.el.pauseWash.classList.add('hidden');
    const totalFrStart = this.playerUnits.reduce((n, u) => n + u.maxCount, 0);
    const frLeft = this.playerUnits.reduce((n, u) => n + u.aliveCount, 0);
    const gbLeft = this.enemyUnits.reduce((n, u) => n + u.aliveCount, 0);
    const gbStart = this.enemyUnits.reduce((n, u) => n + u.maxCount, 0);
    this.el.resultKicker.textContent = victory ? 'The field is ours' : 'The line is broken';
    this.el.resultTitle.textContent = victory ? 'Waterloo' : 'La Haye Sainte';
    this.el.resultCopy.textContent = victory
      ? 'The Allied centre has broken. The eagles stand upon the crossroads, and the road to Brussels lies open.'
      : 'The French line dissolves into the smoke. The farm remains in Allied hands, and the day is lost.';
    this.el.resultStats.innerHTML = `
      <div><b>${frLeft}</b><span>French remaining</span></div>
      <div><b>${gbStart - gbLeft}</b><span>Allied casualties</span></div>
      <div><b>${totalFrStart - frLeft}</b><span>French casualties</span></div>
      <div><b>${this.battleShots}</b><span>volleys fired</span></div>`;
    this.el.result.classList.remove('hidden');
    this.audio.bugle();
    if (victory) this.showToast('Victory at Waterloo', 'The crossroads is taken');
  }

  loop = (now) => {
    const rdt = Math.min(.05, (now - this.last) / 1000);
    this.last = now;
    this.realTime += rdt;
    const dt = this.paused ? 0 : Math.min(.055, rdt * this.speed);
    if (this.over && !this.observing) {
      this.updateCamera(rdt);
    } else {
      this.update(dt);
    }
    this.render(rdt);
    this.updateHUD();
    this.updateDOM(rdt);
    requestAnimationFrame(this.loop);
  };

  updateDOM(dt) {
    this.clockTick += dt;
    if (this.clockTick > .22) {
      this.clockTick = 0;
      if (this.selection.size) this.updateSelectionPanel();
      this.updateRoster();
    }
    if (this.orderDrag && this.orderDrag.moved) {
      canvas.classList.add('ordering');
    } else canvas.classList.remove('ordering');
  }

  drawWorld(ctx) {
    const cam = this.camera;
    // terrain
    ctx.drawImage(this.terrain.canvas, 0, 0, WORLD.w, WORLD.h);

    // low mist
    for (const m of this.mist) {
      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
      g.addColorStop(0, `rgba(208,212,194,${m.a})`);
      g.addColorStop(.6, `rgba(198,204,184,${m.a * .55})`);
      g.addColorStop(1, 'rgba(198,204,184,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, m.r, m.r * .34, 0, 0, TAU);
      ctx.fill();
    }

    // decals
    for (const d of this.decals) {
      if (d.crater) {
        ctx.fillStyle = `rgba(45,40,29,${d.a})`;
        ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * .62, .4, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(93,82,58,.15)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 1.5, d.r, .4, 0, TAU); ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(80,27,21,${d.a})`;
        ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * .6, .2, 0, TAU); ctx.fill();
      }
    }

    // objective marker
    this.drawObjective(ctx);

    // selection rings, order paths
    this.drawOrders(ctx);

    // ragdolls beneath the living
    for (const r of this.ragdolls) r.drawShadow(ctx);
    const corpses = [...this.ragdolls].sort((a, b) => a.pts.pelvis.y - b.pts.pelvis.y);
    for (const r of corpses) r.draw(ctx);

    // units by depth
    const units = this.units.filter(u => !u.dead || u.soldiers.some(s => s.alive));
    units.sort((a, b) => {
      const ay = a.y + (a.type === 'cav' ? 15 : 0);
      const by = b.y + (b.type === 'cav' ? 15 : 0);
      return ay - by;
    });
    for (const u of units) u.draw(ctx, this.realTime);

    // projectiles
    for (const p of this.projectiles) {
      ctx.strokeStyle = 'rgba(54,49,35,.24)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(lerp(p.sx, p.x, .88), lerp(p.sy, p.y, .88));
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(28,27,20,.9)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(234,222,185,.4)';
      ctx.beginPath(); ctx.arc(p.x - .6, p.y - .6, .8, 0, TAU); ctx.fill();
    }

    // tracers
    for (const t of this.tracers) {
      const a = 1 - t.t / t.life;
      ctx.strokeStyle = t.side === 'fr' ? `rgba(226,218,192,${a * .22})` : `rgba(239,209,170,${a * .22})`;
      ctx.lineWidth = .8;
      ctx.beginPath();
      ctx.moveTo(t.x1 + rand(-20, 20), t.y1 + rand(-20, 20));
      ctx.lineTo(t.x2 + rand(-12, 12), t.y2 + rand(-12, 12));
      ctx.stroke();
    }

    // rings
    for (const r of this.rings) {
      const k = 1 - r.life / r.maxLife;
      const rad = lerp(r.r, r.maxR, smoothstep(k));
      ctx.save();
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = (1 - k) * (1 - k);
      ctx.lineWidth = r.width * (1 - k * .5);
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    // particles: blood/debris first, smoke on top
    for (const p of this.particles) {
      if (p.kind === 'blood') {
        ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1) * .8;
        ctx.fillStyle = '#63201a';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      } else if (p.kind === 'debris') {
        ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
        ctx.fillStyle = '#4b4530';
        ctx.fillRect(p.x, p.y, p.r, p.r * .7);
      }
    }
    ctx.globalAlpha = 1;
    for (const p of this.particles) {
      if (p.kind === 'smoke') {
        const k = 1 - p.life / p.maxLife;
        const a = p.alpha * Math.min(1, k * 6) * Math.min(1, (1 - k) * 2.4);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const s = p.r * 2.1;
        ctx.drawImage(this.smokeSprites[p.sprite], -s / 2, -s / 2, s, s);
        ctx.restore();
      } else if (p.kind === 'flash') {
        const a = clamp(p.life / p.maxLife, 0, 1);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
        g.addColorStop(0, `rgba(255,246,194,${a})`);
        g.addColorStop(.28, `rgba(255,198,91,${a * .9})`);
        g.addColorStop(1, 'rgba(255,135,38,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // floating casualty glyphs
    for (const f of this.floating) {
      ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1);
      ctx.fillStyle = f.color;
      ctx.font = '600 10px "Gill Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // right-drag facing guide
    if (this.orderDrag && this.orderDrag.moved) {
      this.drawFacingGuide(ctx);
    }
    // selection drag
    // in screen space later
  }

  drawObjective(ctx) {
    const z = this.terrain.farmZone;
    const contested = this.capture.contested;
    const color = this.capture.taken ? 'rgba(221,189,112,.55)' : contested ? 'rgba(214,115,80,.56)' : 'rgba(215,188,129,.32)';
    const pulse = .5 + Math.sin(this.realTime * 1.4) * .5;
    ctx.save();
    ctx.translate(z.x, z.y);
    // soft halo so the objective reads through smoke and crowd
    const halo = ctx.createRadialGradient(0, 0, 34, 0, 0, 108);
    halo.addColorStop(0, 'rgba(221,190,120,0)');
    halo.addColorStop(.78, 'rgba(221,190,120,0)');
    halo.addColorStop(1, this.capture.taken ? 'rgba(231,199,126,.14)' : 'rgba(231,199,126,.07)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, 108, 0, TAU); ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 9]);
    ctx.lineDashOffset = this.realTime * 10;
    ctx.beginPath(); ctx.arc(0, 0, 78, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = .35 + pulse * .25;
    ctx.beginPath(); ctx.arc(0, 0, 84, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
    // centre diamond
    ctx.save();
    ctx.translate(0, -2);
    ctx.rotate(Math.PI / 4);
    ctx.globalAlpha = .34 + pulse * .25;
    ctx.fillStyle = color;
    ctx.fillRect(-3.2, -3.2, 6.4, 6.4);
    ctx.restore();
    if (this.capture.taken) {
      // tricolour over the taken farm
      ctx.save();
      ctx.translate(0, -8);
      ctx.strokeStyle = 'rgba(44,36,23,.9)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -25); ctx.stroke();
      const wave = Math.sin(this.realTime * 2.2) * 1.3;
      const cols = ['#2b5090', '#e8e0c8', '#a63f34'];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = cols[i];
        ctx.beginPath();
        ctx.moveTo(1 + i * 4, -25);
        ctx.lineTo(1 + i * 4 + 4 + wave, -25);
        ctx.lineTo(1 + i * 4 + 4 + wave * 1.3, -16);
        ctx.lineTo(1 + i * 4, -16);
        ctx.fill();
      }
      ctx.fillStyle = '#d1b36f';
      ctx.beginPath(); ctx.arc(0, -26, 1.1, 0, TAU); ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + this.realTime * .12;
      const x = Math.cos(a) * 94, y = Math.sin(a) * 94;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(4, 2); ctx.lineTo(-4, 2); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (!this.capture.taken) {
      ctx.globalAlpha = .72;
      ctx.shadowColor = 'rgba(18,17,11,.9)';
      ctx.shadowBlur = 5;
      ctx.fillStyle = '#e8d8b0';
      ctx.font = 'italic 12px Palatino, serif';
      ctx.textAlign = 'center';
      ctx.fillText('La Haye Sainte', 0, 109);
      ctx.font = '7px "Gill Sans", sans-serif';
      ctx.letterSpacing = '0.2em';
      ctx.fillStyle = 'rgba(234,217,178,.55)';
      ctx.fillText('CROSSROADS', 0, 120);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawOrders(ctx) {
    if (!this.selection.size) return;
    for (const u of this.selection) {
      if (u.dead || u.routing) continue;
      const pulse = .5 + Math.sin(this.realTime * 2.2 + u.id) * .12;
      ctx.save();
      ctx.strokeStyle = `rgba(227,200,135,${.45 * pulse})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.arc(u.x, u.y, u.type === 'cav' ? 38 : 30, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      const corners = 4;
      for (let c = 0; c < 4; c++) {
        const a = c * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.arc(u.x, u.y, u.type === 'cav' ? 38 : 30, a - .14, a + .14);
        ctx.strokeStyle = 'rgba(245,219,157,.75)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();

      // firing envelope: a faint arc toward the unit's facing
      if (u.type === 'arty') {
        ctx.save();
        ctx.strokeStyle = 'rgba(18,17,11,.22)';
        ctx.lineWidth = 2.4;
        ctx.setLineDash([2, 10]);
        ctx.beginPath(); ctx.arc(u.x, u.y, u.range, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(224,196,132,.22)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(u.x, u.y, u.range, 0, TAU); ctx.stroke();
        ctx.restore();
      } else if (u.type !== 'cav') {
        const facing = u.angle - Math.PI / 2;
        ctx.save();
        ctx.strokeStyle = 'rgba(18,17,11,.24)';
        ctx.lineWidth = 2.4;
        ctx.setLineDash([2, 10]);
        ctx.beginPath(); ctx.arc(u.x, u.y, u.range, facing - .52, facing + .52); ctx.stroke();
        ctx.strokeStyle = 'rgba(232,205,143,.3)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(u.x, u.y, u.range, facing - .52, facing + .52); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(240,215,158,.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(u.x + Math.sin(u.angle) * 33, u.y - Math.cos(u.angle) * 33);
        ctx.lineTo(u.x + Math.sin(u.angle) * 43, u.y - Math.cos(u.angle) * 43);
        ctx.stroke();
        ctx.restore();
      }

      // path
      if (u.dest) {
        const dest = u.dest;
        ctx.save();
        ctx.strokeStyle = 'rgba(233,210,159,.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 8]);
        ctx.lineDashOffset = -this.realTime * 20;
        ctx.beginPath();
        ctx.moveTo(u.x, u.y);
        ctx.lineTo(dest.x, dest.y);
        ctx.stroke();
        ctx.setLineDash([]);
        const a = Math.atan2(dest.y - u.y, dest.x - u.x);
        ctx.translate(dest.x, dest.y);
        ctx.rotate(a);
        ctx.fillStyle = 'rgba(233,210,159,.6)';
        ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-2, -4); ctx.lineTo(-2, 4); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      if (u.target && !u.target.dead) {
        ctx.save();
        ctx.strokeStyle = 'rgba(217,118,95,.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 6]);
        ctx.beginPath(); ctx.arc(u.target.x, u.target.y, 28, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }
  }

  drawFacingGuide(ctx) {
    const d = this.orderDrag;
    const end = this.screenToWorld(this.pointer.x, this.pointer.y);
    const x1 = d.wx, y1 = d.wy, x2 = end.x, y2 = end.y;
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.save();
    ctx.strokeStyle = 'rgba(231,202,140,.68)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([7, 7]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.translate(x2, y2);
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(238,209,147,.85)';
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-2, -5); ctx.lineTo(-2, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(233,210,159,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x1, y1, 13, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  render(rdt) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#3e4834';
    ctx.fillRect(0, 0, this.vw, this.vh);
    const shakeX = this.shake ? rand(-this.shake, this.shake) : 0;
    const shakeY = this.shake ? rand(-this.shake, this.shake) : 0;
    ctx.save();
    ctx.translate(this.vw / 2 + shakeX, this.vh / 2 + shakeY);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);
    this.drawWorld(ctx);
    ctx.restore();

    // screen-space selection box
    if (this.dragBox && this.dragBox.moved) {
      const x = Math.min(this.dragBox.sx, this.dragBox.x);
      const y = Math.min(this.dragBox.sy, this.dragBox.y);
      const w = Math.abs(this.dragBox.x - this.dragBox.sx);
      const h = Math.abs(this.dragBox.y - this.dragBox.sy);
      ctx.save();
      ctx.fillStyle = 'rgba(221,197,142,.06)';
      ctx.strokeStyle = 'rgba(231,208,154,.55)';
      ctx.lineWidth = 1;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + .5, y + .5, w, h);
      ctx.restore();
    }
    // subtle screen haze
    const haze = ctx.createLinearGradient(0, this.vh * .55, 0, this.vh);
    haze.addColorStop(0, 'rgba(217,209,180,0)');
    haze.addColorStop(1, 'rgba(207,190,156,.035)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, this.vh * .55, this.vw, this.vh * .45);
  }

  buildMinimapCache() {
    const w = 520, h = Math.round(520 / WORLD.w * WORLD.h);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(this.terrain.canvas, 0, 0, w, h);
    g.fillStyle = 'rgba(17,21,13,.12)';
    g.fillRect(0, 0, w, h);
    this.minimapCache = c;
  }

  drawMinimap() {
    if (!this.minimapCache) return;
    const w = minimapCanvas.width, h = minimapCanvas.height;
    if (!w) return;
    mctx.clearRect(0, 0, w, h);
    mctx.drawImage(this.minimapCache, 0, 0, w, h);
    mctx.fillStyle = 'rgba(13,17,10,.12)';
    mctx.fillRect(0, 0, w, h);
    const z = this.terrain.farmZone;
    mctx.strokeStyle = this.capture.taken ? 'rgba(227,196,120,.85)' : 'rgba(220,189,124,.38)';
    mctx.lineWidth = 1;
    mctx.beginPath();
    mctx.arc(z.x / WORLD.w * w, z.y / WORLD.h * h, 5, 0, TAU);
    mctx.stroke();
    for (const u of this.units) {
      if (u.dead) continue;
      const x = u.x / WORLD.w * w, y = u.y / WORLD.h * h;
      mctx.fillStyle = u.routing ? 'rgba(120,120,110,.5)' : u.side === 'fr' ? '#729ad3' : '#d47560';
      mctx.beginPath(); mctx.arc(x, y, u.type === 'cav' ? 2.8 : 2.1, 0, TAU); mctx.fill();
      if (u.selected) {
        mctx.strokeStyle = 'rgba(240,215,158,.9)';
        mctx.lineWidth = 1;
        mctx.beginPath(); mctx.arc(x, y, 4.1, 0, TAU); mctx.stroke();
      }
    }
    // camera viewport
    const vw = this.vw / this.camera.zoom, vh = this.vh / this.camera.zoom;
    mctx.strokeStyle = 'rgba(238,222,183,.45)';
    mctx.lineWidth = 1;
    mctx.strokeRect(
      (this.camera.x - vw / 2) / WORLD.w * w,
      (this.camera.y - vh / 2) / WORLD.h * h,
      vw / WORLD.w * w,
      vh / WORLD.h * h
    );
  }
}

// Hover card CSS is injected here to keep the HUD rules with the component.
const style = document.createElement('style');
style.textContent = `
.hover-card {
  position: fixed; z-index: 20; width: 218px; pointer-events: none;
  background: rgba(14,18,11,.92); border: 1px solid rgba(214,194,151,.24);
  padding: 9px 11px 8px; box-shadow: 0 12px 30px rgba(0,0,0,.35);
  backdrop-filter: blur(6px); transform: translateZ(0);
}
.hover-card .hc-side { display:block; font-family: var(--sans); font-size:7px; letter-spacing:.2em; text-transform:uppercase; color:#d8b978; }
.hover-card .hc-side.gb { color:#d8816e; }
.hover-card strong { display:block; margin-top:2px; font-size:12px; font-weight:500; color:#f0e5cd; }
.hover-card .hc-sub { display:block; margin-top:2px; font-family:var(--sans); font-size:7.5px; letter-spacing:.04em; color:rgba(233,223,196,.5); }
.hover-card .hc-bar { height:2px; margin-top:7px; background:rgba(232,220,190,.12); }
.hover-card .hc-bar i { display:block; height:100%; background:#a9b87d; }
`;
document.head.appendChild(style);

window.addEventListener('load', () => {
  window.game = new Game();
});
