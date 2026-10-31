import {
  TAU, clamp, lerp, approach, approachAngle, angleDiff, dist, rand, randInt, pick, rotate
} from './utils.js';

const FR = {
  main: '#2e4f82', dark: '#1b3155', facing: '#a33b2f', trousers: '#d1c6a9',
  belt: '#e4d9bd', skin: '#c89a70', hat: '#181a16', plume: '#a23b30', horse: '#5a3d27'
};
const GB = {
  main: '#8f352e', dark: '#5c211f', facing: '#c8a253', trousers: '#bbb5a3',
  belt: '#e8dfc6', skin: '#c99d75', hat: '#151613', plume: '#d0bd87', horse: '#4b3728'
};

export const UNIT_TYPES = {
  line: { label: 'Regiment of the line', speed: 28, range: 305, reload: 6.6, hit: .034, morale: 82, icon: 'line' },
  light: { label: 'Light infantry', speed: 34, range: 338, reload: 7.4, hit: .039, morale: 86, icon: 'light' },
  guard: { label: 'Imperial Guard', speed: 30, range: 312, reload: 5.7, hit: .047, morale: 96, icon: 'guard' },
  cav: { label: 'Heavy cavalry', speed: 86, range: 72, reload: 1.4, hit: .2, morale: 90, icon: 'cav' },
  arty: { label: 'Foot artillery', speed: 16, range: 690, reload: 8.6, hit: .01, morale: 74, icon: 'arty' }
};

let UID = 0;

const SPRITE_SCALE = 2.45;
const SPRITE_SIZE = 128;

export function humanAngle(ax, ay, bx, by) {
  return Math.atan2(bx - ax, -(by - ay));
}

export class Soldier {
  constructor(unit, index, side, x, y, angle) {
    this.unit = unit;
    this.index = index;
    this.side = side;
    this.maxHp = 100;
    this.hp = 1;
    this.alive = true;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.tx = x;
    this.ty = y;
    this.step = rand(0, TAU);
    this.action = 'idle';
    this.actionT = 0;
    this.aim = 0;
    this.jitter = rand(-1, 1);
    this.hasFlag = false;
    this.bloodied = 0;
    this.recoil = 0;
    this.moving = false;
    this.flash = 0;
  }

  setAction(name, time) {
    this.action = name;
    this.actionT = time;
  }

  update(dt, game) {
    if (!this.alive) return;
    const u = this.unit;
    this.actionT = Math.max(0, this.actionT - dt);
    if (this.actionT <= 0 && this.action !== 'idle') this.action = 'idle';
    const targetAngle = u.target && u.target.alive && !u.moving
      ? humanAngle(this.x, this.y, u.target.x, u.target.y)
      : u.angle;
    this.angle = approachAngle(this.angle, targetAngle, dt * 3.2);

    if (u.routing) {
      const away = humanAngle(u.chargeFrom?.x ?? this.x, u.chargeFrom?.y ?? this.y + 100, this.x, this.y);
      const sp = u.type === 'cav' ? 70 : 38;
      this.x += Math.sin(away) * sp * dt;
      this.y -= Math.cos(away) * sp * dt;
      this.x += Math.sin(this.step * .9) * 3 * dt;
      this.step += dt * 9;
      this.moving = true;
      return;
    }

    let slot = null;
    if (u.type === 'arty' && u.guns.length) {
      const gun = u.guns[this.index % u.guns.length];
      const side = Math.floor(this.index / u.guns.length);
      const local = [gun.lx + (side ? 10 : -10), gun.ly + (side ? 9 : 14)];
      const [rx, ry] = rotate(local[0], local[1], u.angle);
      slot = [u.x + rx, u.y + ry];
    } else {
      const f = u.formationSlots[this.index];
      if (f) {
        const [rx, ry] = rotate(f[0], f[1], u.angle);
        slot = [u.x + rx, u.y + ry];
      }
    }
    if (!slot) slot = [this.x, this.y];

    let dx = slot[0] - this.x, dy = slot[1] - this.y;
    const d = Math.hypot(dx, dy);
    let speed = u.currentSpeed * (u.type === 'cav' ? 1 : 1.4) + 9;
    if (u.routing) speed = 42;
    if (u.charging) speed *= 1.2;
    if (d > 1.4) {
      const step = Math.min(d, speed * dt);
      this.x += dx / d * step;
      this.y += dy / d * step;
      this.moving = step > .08;
    } else {
      this.moving = false;
    }
    this.step += dt * (this.moving ? (u.type === 'cav' ? 11 : 8.5) : 1.3);
    // soften formation without collisions
    const wobble = Math.sin(this.step * .13 + this.index) * .7;
    this.x += Math.sin(this.angle + Math.PI / 2) * wobble * dt * 4;
    this.y += Math.cos(this.angle + Math.PI / 2) * wobble * dt * 4;
  }

  draw(ctx, time) {
    if (!this.alive) return;
    const sheets = this.unit.game.sprites?.[this.side];
    if (sheets) {
      const set = this.unit.type === 'cav' ? sheets.cav : sheets.foot;
      if (!set) { this.drawVector(ctx, time); return; }
      let sprite;
      if (this.action === 'fire') {
        const k = clamp(this.actionT / .6, 0, 1);
        sprite = set.fire[k > .55 ? 0 : 1];
      } else if (this.action === 'reload') {
        const k = clamp(this.actionT / 2.4, 0, 1);
        sprite = set.reload[k > .55 ? 0 : 1];
      } else if (this.action === 'melee') {
        sprite = set.melee;
      } else if (this.moving) {
        const n = set.walk.length;
        const phase = ((this.step * 1.7) % TAU + TAU) % TAU;
        sprite = set.walk[Math.floor(phase / TAU * n) % n];
      } else if (this.unit.target && this.unit.target.alive && !this.unit.moving && !this.unit.routing
          && this.unit.distanceTo(this.unit.target) < this.unit.range * 1.1) {
        sprite = set.aim;
      } else {
        sprite = set.idle[Math.floor(time * 1.25 + this.index * .37) % set.idle.length];
      }
      if (!sprite || !sprite.image) { this.drawVector(ctx, time); return; }
      const scale = sprite.worldSize;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.drawImage(sprite.image, -scale / 2, -scale / 2, scale, scale);
      ctx.restore();
      return;
    }
    this.drawVector(ctx, time);
  }

  drawVector(ctx, time) {
    const u = this.unit;
    const side = this.side === 'fr' ? FR : GB;
    const cav = u.type === 'cav';
    const isArtyCrew = u.type === 'arty';
    const stride = this.moving ? Math.sin(this.step * 1.7) : Math.sin(this.step) * .1;
    const bob = this.moving ? Math.abs(Math.sin(this.step * 1.7)) * .55 : Math.sin(this.step) * .12;
    const recoil = this.action === 'fire' ? Math.sin(clamp(this.actionT / .28, 0, 1) * Math.PI) : 0;
    const reload = this.action === 'reload';
    const aim = u.target && u.target.alive && !u.moving && !u.routing && u.distanceTo(this.unit.target) < u.range * 1.1;
    const charge = u.charging;

    ctx.save();
    ctx.translate(this.x, this.y - (cav ? 2 : 0));
    ctx.rotate(this.angle);

    // shadow
    ctx.fillStyle = 'rgba(24,29,19,.23)';
    ctx.beginPath();
    ctx.ellipse(1.4, 2.4, cav ? 7 : 3.8, cav ? 10 : 5.4, 0, 0, TAU);
    ctx.fill();

    if (cav) {
      this.drawHorse(ctx, side, stride, bob, recoil);
      this.drawRider(ctx, side, bob, recoil, aim, charge);
      ctx.restore();
      return;
    }

    // legs
    ctx.lineCap = 'round';
    const legSwing = this.moving ? stride * 2.3 : 0;
    ctx.strokeStyle = side.trousers;
    ctx.lineWidth = 1.9;
    ctx.beginPath(); ctx.moveTo(-1.4, 1.8); ctx.lineTo(-1.8, 4.4 + legSwing); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1.4, 1.8); ctx.lineTo(1.8, 4.4 - legSwing); ctx.stroke();
    ctx.strokeStyle = '#29251d';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-1.8, 4.4 + legSwing); ctx.lineTo(-2 + legSwing * .2, 5.8 + legSwing); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1.8, 4.4 - legSwing); ctx.lineTo(2 - legSwing * .2, 5.8 - legSwing); ctx.stroke();

    // pack
    ctx.fillStyle = 'rgba(46,35,23,.9)';
    ctx.beginPath();
    ctx.ellipse(0, 2.2, 2.35, 1.7, 0, 0, TAU);
    ctx.fill();

    // coat / torso
    ctx.fillStyle = side.main;
    ctx.beginPath();
    ctx.moveTo(-2.6, 1.9);
    ctx.quadraticCurveTo(-3.1, -1.1, -2.2, -3.4);
    ctx.quadraticCurveTo(0, -4.5, 2.2, -3.4);
    ctx.quadraticCurveTo(3.1, -1.1, 2.6, 1.9);
    ctx.quadraticCurveTo(0, 2.7, -2.6, 1.9);
    ctx.fill();
    // coat tails and facing
    ctx.fillStyle = side.dark;
    ctx.beginPath(); ctx.moveTo(-2.5, 1.3); ctx.lineTo(-1.2, 5.3 + legSwing * .18); ctx.lineTo(-.2, 2.2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(2.5, 1.3); ctx.lineTo(1.2, 5.3 - legSwing * .18); ctx.lineTo(.2, 2.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = side.facing;
    ctx.beginPath(); ctx.arc(-2.2, -2.5, 1.15, 0, TAU); ctx.arc(2.2, -2.5, 1.15, 0, TAU); ctx.fill();

    // crossbelt
    ctx.strokeStyle = 'rgba(230,220,190,.78)';
    ctx.lineWidth = 1.05;
    ctx.beginPath(); ctx.moveTo(-2.2, -3.1); ctx.lineTo(2.0, 1.6); ctx.stroke();
    // buttons
    ctx.fillStyle = 'rgba(236,204,126,.65)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(.1, -2.6 + i * 1.25, .38, 0, TAU); ctx.fill();
    }

    // head + shako
    const headY = -4.4 - bob * .25 + recoil * .3;
    ctx.fillStyle = side.skin;
    ctx.beginPath(); ctx.arc(0, headY, 2.05, 0, TAU); ctx.fill();
    ctx.fillStyle = side.hat;
    ctx.beginPath(); ctx.ellipse(-.1, headY - .65, 2.18, 1.7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(205,194,164,.23)';
    ctx.beginPath(); ctx.ellipse(-.45, headY - 1.1, 1.15, .55, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = side.plume;
    ctx.beginPath(); ctx.arc(0, headY + 1.15, .75, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d4c59d';
    ctx.fillRect(-1.5, headY - 2.0, 3, .45);
    if (this.hasFlag) {
      // flag pole held upright; cloth drawn separately for depth
      ctx.strokeStyle = '#3a2c1d';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(2.2, 1.5); ctx.lineTo(2.2, -16); ctx.stroke();
    }

    // arms and musket
    const aimLift = aim ? .4 : 0;
    const meleePose = this.action === 'melee';
    const musketAngle = reload ? -.68 : (meleePose ? .02 : (this.moving ? .14 : (aim || recoil ? -.05 : -.23)));
    const kick = recoil * 1.8;
    ctx.save();
    ctx.translate(1.6, -1.2 + aimLift);
    ctx.rotate(musketAngle);
    const muzzleY = -11.6 + kick;
    // arm to forestock
    ctx.strokeStyle = side.main;
    ctx.lineWidth = 1.55;
    ctx.beginPath(); ctx.moveTo(-3.5, -1.7); ctx.lineTo(-.5, -3.2); ctx.stroke();
    ctx.strokeStyle = side.skin;
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(-.5, -3.2); ctx.lineTo(-.5, -5.5); ctx.stroke();
    // musket
    ctx.strokeStyle = '#553c26';
    ctx.lineWidth = 1.35;
    ctx.beginPath(); ctx.moveTo(0, 2.1); ctx.lineTo(0, muzzleY); ctx.stroke();
    ctx.strokeStyle = 'rgba(176,179,169,.85)';
    ctx.lineWidth = .55;
    ctx.beginPath(); ctx.moveTo(0, muzzleY); ctx.lineTo(0, muzzleY - 4.4); ctx.stroke();
    // barrel glint
    ctx.strokeStyle = 'rgba(232,226,198,.35)';
    ctx.lineWidth = .35;
    ctx.beginPath(); ctx.moveTo(.4, -3); ctx.lineTo(.4, muzzleY + 1); ctx.stroke();
    // lock and trigger guard
    ctx.strokeStyle = 'rgba(213,186,117,.5)';
    ctx.beginPath(); ctx.arc(-.2, .2, 1.05, 0, TAU); ctx.stroke();
    // second arm
    ctx.strokeStyle = side.main;
    ctx.lineWidth = 1.45;
    ctx.beginPath(); ctx.moveTo(3.5, -1.6); ctx.lineTo(1.4, 1.4); ctx.stroke();
    ctx.fillStyle = side.skin;
    ctx.beginPath(); ctx.arc(1.2, 1.6, .83, 0, TAU); ctx.fill();
    if (reload) {
      ctx.strokeStyle = 'rgba(196,198,187,.75)';
      ctx.lineWidth = .7;
      const ram = Math.sin((1 - this.actionT / 2.4) * Math.PI) * 5;
      ctx.beginPath(); ctx.moveTo(-2.9, -4.5 - ram); ctx.lineTo(-2.9, -8 - ram); ctx.stroke();
      ctx.strokeStyle = side.skin;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-2.8, -2.7); ctx.lineTo(-2.9, -5.2 - ram); ctx.stroke();
    }
    if (this.action === 'fire') {
      ctx.fillStyle = 'rgba(255,208,101,.9)';
      ctx.beginPath(); ctx.arc(0, muzzleY - 4.5, 1.6 + recoil, 0, TAU); ctx.fill();
    }
    ctx.restore();

    // sword for officers (every 8th man)
    if (this.index % 11 === 0 && !isArtyCrew) {
      ctx.strokeStyle = 'rgba(215,216,203,.8)';
      ctx.lineWidth = .55;
      ctx.beginPath(); ctx.moveTo(-3.1, -1.5); ctx.lineTo(-5.4, -7.2); ctx.stroke();
      ctx.strokeStyle = 'rgba(208,180,112,.7)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(-3.1, -1.5, .8, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  drawHorse(ctx, side, stride, bob, recoil) {
    ctx.lineCap = 'round';
    // legs
    ctx.strokeStyle = '#2e2419';
    ctx.lineWidth = 1.4;
    const s = this.moving ? stride * 2.8 : 0;
    for (const [x, off] of [[-3, 0], [3, Math.PI], [-2.7, Math.PI * .9], [2.7, .1]]) {
      const sw = Math.sin(this.step * 1.7 + off) * 2.4;
      ctx.beginPath(); ctx.moveTo(x, 2.5); ctx.lineTo(x + sw * .2, 7 + sw); ctx.stroke();
    }
    // tail
    ctx.strokeStyle = '#3a2a1b';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.quadraticCurveTo(-2, 11, 0, 12.5); ctx.stroke();
    // body
    const hg = ctx.createLinearGradient(-5, 0, 5, 0);
    hg.addColorStop(0, side.horse);
    hg.addColorStop(.5, '#7b5938');
    hg.addColorStop(1, '#4a3322');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.ellipse(0, 0, 4.9, 9.2, 0, 0, TAU); ctx.fill();
    // chest and neck
    ctx.fillStyle = side.horse;
    ctx.beginPath(); ctx.ellipse(0, -7.6, 3.3, 4.1, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4b3524';
    ctx.beginPath(); ctx.ellipse(0, -11, 2.2, 3.1, 0, 0, TAU); ctx.fill();
    // ears
    ctx.fillStyle = '#3b2b1d';
    ctx.beginPath(); ctx.moveTo(-1.4, -12.8); ctx.lineTo(-2.4, -15); ctx.lineTo(-.4, -13.4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(1.4, -12.8); ctx.lineTo(2.4, -15); ctx.lineTo(.4, -13.4); ctx.fill();
    // saddle blanket
    ctx.fillStyle = side.main;
    ctx.beginPath(); ctx.roundRect(-4, -3.2, 8, 6, 1.2); ctx.fill();
    ctx.strokeStyle = side.facing;
    ctx.lineWidth = .7;
    ctx.strokeRect(-4, -3.2, 8, 6);
    // reins
    ctx.strokeStyle = 'rgba(34,27,18,.7)';
    ctx.lineWidth = .55;
    ctx.beginPath(); ctx.moveTo(2.6, -4.5); ctx.quadraticCurveTo(3.8, -7.5, 1.2, -10.5); ctx.stroke();
  }

  drawRider(ctx, side, bob, recoil, aim, charge) {
    ctx.save();
    ctx.translate(0, -1.8 - bob * .3);
    // rider torso
    ctx.fillStyle = side.main;
    ctx.beginPath();
    ctx.moveTo(-2.3, 1.6);
    ctx.quadraticCurveTo(-2.8, -1.6, -1.8, -3.6);
    ctx.quadraticCurveTo(0, -4.7, 1.8, -3.6);
    ctx.quadraticCurveTo(2.8, -1.6, 2.3, 1.6);
    ctx.closePath(); ctx.fill();
    // cuirass glint
    ctx.fillStyle = 'rgba(191,194,186,.7)';
    ctx.beginPath(); ctx.ellipse(0, -.7, 1.65, 2.15, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = side.dark; ctx.lineWidth = .4; ctx.stroke();
    // head + helmet
    ctx.fillStyle = side.skin;
    ctx.beginPath(); ctx.arc(0, -4.45, 1.85, 0, TAU); ctx.fill();
    ctx.fillStyle = '#30322d';
    ctx.beginPath(); ctx.ellipse(0, -4.7, 2.1, 1.7, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(220,196,143,.75)';
    ctx.lineWidth = .55;
    ctx.beginPath(); ctx.arc(0, -4.55, 2.12, .1, Math.PI - .1); ctx.stroke();
    ctx.fillStyle = side.facing;
    ctx.beginPath(); ctx.moveTo(-.5, -6); ctx.lineTo(0, -8.6); ctx.lineTo(.5, -6); ctx.fill();
    // sabre arm
    ctx.strokeStyle = side.main; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(2.1, -2.4); ctx.lineTo(4.8, -5.2); ctx.stroke();
    ctx.strokeStyle = 'rgba(218,219,208,.85)'; ctx.lineWidth = .75;
    ctx.beginPath(); ctx.moveTo(4.8, -5.2); ctx.lineTo(6.6 + (charge ? 1.5 : 0), -10.5); ctx.stroke();
    // reins arm
    ctx.strokeStyle = side.main; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(-2.1, -2.2); ctx.lineTo(-3.3, -.3); ctx.stroke();
    ctx.fillStyle = side.skin; ctx.beginPath(); ctx.arc(-3.4, 0, .8, 0, TAU); ctx.fill();
    // legs
    ctx.strokeStyle = side.trousers; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-1.8, 1.2); ctx.lineTo(-3.6, 3.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1.8, 1.2); ctx.lineTo(3.6, 3.8); ctx.stroke();
    ctx.restore();
  }
}

export class Unit {
  constructor(game, cfg) {
    this.game = game;
    this.id = ++UID;
    this.side = cfg.side;
    this.name = cfg.name;
    this.short = cfg.short;
    this.type = cfg.type;
    this.template = UNIT_TYPES[cfg.type];
    this.x = cfg.x;
    this.y = cfg.y;
    this.angle = cfg.angle;
    this.dest = null;
    this.destAngle = null;
    this.explicitFacing = false;
    this.target = null;
    this.attackOrder = false;
    this.scanClock = rand(0, .5);
    this.maxCount = cfg.count;
    this.soldiers = [];
    this.aliveCount = cfg.count;
    this.morale = cfg.morale ?? this.template.morale;
    this.maxMorale = 100;
    this.cooldown = rand(1, 4);
    this.moving = false;
    this.currentSpeed = this.template.speed;
    this.routing = false;
    this.routAway = rand(-.5, .5);
    this.routClock = 0;
    this.chargeFrom = null;
    this.charging = false;
    this.chargeClock = 0;
    this.holdFire = false;
    this.formation = 'line';
    this.formationSlots = [];
    this.guns = [];
    this.meleeClock = 0;
    this.kills = 0;
    this.losses = 0;
    this.volleys = 0;
    this.engaged = false;
    this.flankWarn = 0;
    this.time = rand(0, 10);
    this.selected = false;
    this.dead = false;
    this.lastOrder = 0;
    this.smokeClock = 0;
    this.suppression = 0;
    this.standardIndex = 0;

    for (let i = 0; i < cfg.count; i++) {
      const s = new Soldier(this, i, cfg.side, cfg.x + rand(-5, 5), cfg.y + rand(-5, 5), cfg.angle);
      s.hasFlag = i === this.standardIndex;
      this.soldiers.push(s);
    }
    if (cfg.type === 'arty') {
      for (let i = 0; i < 4; i++) this.guns.push({ lx: -54 + i * 36, ly: 1, recoil: 0 });
    }
    this.recalcFormation();
  }

  get alive() { return !this.dead; }
  get strength() { return this.aliveCount / this.maxCount; }
  get effectiveMorale() { return this.routing ? 0 : this.morale * clamp(.45 + this.strength * .55, 0, 1); }
  get shortState() {
    if (this.routing) return 'Routing';
    if (this.charging) return 'Charging';
    if (this.moving) return 'Marching';
    if (this.target && this.distanceTo(this.target) < this.range) return this.holdFire ? 'Holding' : 'Engaged';
    return 'Ready';
  }
  get range() { return this.template.range; }
  get damage() { return this.template.hit; }

  distanceTo(other) {
    return Math.hypot(other.x - this.x, other.y - this.y);
  }

  recalcFormation() {
    const count = this.maxCount;
    this.formationSlots = [];
    if (this.type === 'cav') {
      const files = Math.ceil(count / 2);
      const gap = 18, rankGap = 25;
      for (let i = 0; i < count; i++) {
        const rank = Math.floor(i / files);
        const file = i % files;
        this.formationSlots.push([(file - (files - 1) / 2) * gap, rank * rankGap + (file % 2) * 1.2]);
      }
    } else if (this.type === 'arty') {
      for (let i = 0; i < count; i++) {
        const g = i % 4, side = Math.floor(i / 4);
        this.formationSlots.push([-54 + g * 36 + (side ? 10 : -10), side ? 9 : 14]);
      }
    } else if (this.formation === 'column') {
      const files = Math.min(4, Math.max(2, Math.ceil(count / 10)));
      const ranks = Math.ceil(count / files);
      const gap = 16, rankGap = 13;
      for (let i = 0; i < count; i++) {
        const file = i % files;
        const rank = Math.floor(i / files);
        this.formationSlots.push([(file - (files - 1) / 2) * gap, rank * rankGap - (ranks - 1) * rankGap * .5]);
      }
    } else {
      const ranks = 3;
      const files = Math.ceil(count / ranks);
      const gap = 17, rankGap = 14;
      for (let i = 0; i < count; i++) {
        const rank = Math.floor(i / files);
        const file = i % files;
        this.formationSlots.push([(file - (files - 1) / 2) * gap, rank * rankGap]);
      }
    }
  }

  setMove(x, y, angle = null) {
    if (this.routing || this.dead) return;
    this.dest = { x, y };
    this.target = null;
    this.attackOrder = false;
    this.explicitFacing = angle !== null;
    if (angle !== null) this.destAngle = angle;
    this.lastOrder = this.game.time;
  }

  setAttack(enemy) {
    if (this.routing || this.dead || !enemy || enemy.dead) return;
    this.target = enemy;
    this.attackOrder = true;
    this.dest = null;
    this.lastOrder = this.game.time;
  }

  halt() {
    this.dest = null;
    this.moving = false;
    this.attackOrder = false;
  }

  toggleFormation() {
    if (this.type === 'arty' || this.type === 'cav') return false;
    this.formation = this.formation === 'line' ? 'column' : 'line';
    this.recalcFormation();
    return true;
  }

  toggleHoldFire() {
    this.holdFire = !this.holdFire;
    return this.holdFire;
  }

  charge() {
    if (this.charging || this.routing || this.dead) return;
    this.charging = true;
    this.chargeClock = 9;
    this.chargeFrom = { x: this.x, y: this.y };
    this.holdFire = false;
    if (!this.target) {
      const enemies = this.game.units.filter(u => u.side !== this.side && !u.routing && !u.dead);
      let best = null, bd = 9999;
      for (const e of enemies) {
        const d = this.distanceTo(e);
        if (d < bd) { bd = d; best = e; }
      }
      if (best && bd < 560) this.target = best;
    }
    this.game.audio.advance();
  }

  findTarget() {
    if (this.attackOrder) {
      if (this.target && !this.target.dead && !this.target.routing) return;
      this.attackOrder = false;
      this.target = null;
    }
    const candidates = this.game.units.filter(u => u.side !== this.side && !u.dead && !u.routing);
    let best = null, bestScore = Infinity;
    for (const e of candidates) {
      const d = this.distanceTo(e);
      if (d > this.range * 1.12 + 60) continue;
      let score = d;
      if (e.type === 'arty' && this.type === 'cav') score *= .45;
      if (this.target === e) score *= .75;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (best) this.target = best;
    else if (this.target && this.distanceTo(this.target) > this.range * 1.5) this.target = null;
  }

  update(dt, game) {
    if (this.dead) return;
    this.time += dt;
    this.cooldown -= dt;
    this.suppression = Math.max(0, this.suppression - dt * 1.8);
    this.meleeClock = Math.max(0, this.meleeClock - dt);
    if (this.flankWarn > 0) this.flankWarn -= dt;

    if (this.routing) {
      this.routClock += dt;
      this.moving = false;
      const dir = humanAngle(this.chargeFrom?.x ?? this.x, this.chargeFrom?.y ?? this.y + 100, this.x, this.y);
      this.x += Math.sin(dir) * 24 * dt;
      this.y -= Math.cos(dir) * 24 * dt;
      if (this.routClock > 22) this.dead = true;
      for (const s of this.soldiers) s.update(dt, game);
      return;
    }

    if (this.chargeClock > 0) {
      this.chargeClock -= dt;
      if (this.chargeClock <= 0) this.charging = false;
    }

    this.scanClock -= dt;
    if (this.scanClock <= 0) {
      this.scanClock = .38;
      this.findTarget();
    }

    if (this.type === 'arty') {
      this.updateArtillery(dt, game);
    }

    // movement toward destination or attack target
    let moveTarget = this.dest;
    let closingToTarget = false;
    const desired = this.type === 'cav' || this.charging ? 42 : this.range * .82;
    if (this.target && this.target.alive && !this.target.routing) {
      const d = this.distanceTo(this.target);
      if (this.charging || (this.dest === null && d > desired + 8)) {
        moveTarget = { x: this.target.x, y: this.target.y };
        closingToTarget = true;
      }
    }

    this.moving = false;
    if (moveTarget) {
      const dx = moveTarget.x - this.x, dy = moveTarget.y - this.y;
      const d = Math.hypot(dx, dy);
      // Infantry dress the line at volley range; only a charge closes to the bayonet.
      const stop = closingToTarget ? (this.charging ? 6 : Math.max(16, desired - 6)) : 7;
      if (d > stop) {
        const moveAngle = humanAngle(this.x, this.y, moveTarget.x, moveTarget.y);
        let face = this.angle;
        if (!this.explicitFacing && !this.target) face = moveAngle;
        if (this.charging) face = moveAngle;
        if (this.explicitFacing && this.destAngle !== null && !this.target) face = this.destAngle;
        this.angle = approachAngle(this.angle, face, dt * (this.type === 'cav' ? 2.8 : 1.65));
        let sp = this.currentSpeed;
        if (this.charging) sp *= 1.5;
        if (this.morale < 35) sp *= .86;
        const step = Math.min(d, sp * dt);
        this.x += dx / d * step;
        this.y += dy / d * step;
        this.moving = true;
        if (this.dest && d < 40) this.dest = null;
      } else if (this.dest) this.dest = null;
    }

    // face the target while stationary
    if (!this.moving && this.target && this.target.alive) {
      const ta = humanAngle(this.x, this.y, this.target.x, this.target.y);
      this.angle = approachAngle(this.angle, ta, dt * 1.4);
      const flank = Math.abs(angleDiff(this.angle, ta));
      if (flank > 1.0 && this.target.distanceTo(this) < 230) this.flankWarn = 1;
    }

    // combat
    if (this.target && this.target.alive && !this.target.routing) {
      const d = this.distanceTo(this.target);
      if (d < 58) {
        this.meleeCombat(dt, game);
      } else if (!this.moving && !this.holdFire && this.cooldown <= 0 && d <= this.range) {
        const facing = Math.abs(angleDiff(this.angle, humanAngle(this.x, this.y, this.target.x, this.target.y)));
        if (facing < .42) this.fireAt(this.target, game);
      }
    }

    // morale recovery
    if (!this.target || this.distanceTo(this.target) > this.range + 100) {
      const friendNear = game.units.some(u => u !== this && u.side === this.side && !u.routing && u.distanceTo(this) < 190);
      if (friendNear) this.morale = Math.min(100, this.morale + dt * 1.25);
      else this.morale = Math.min(100, this.morale + dt * .42);
    }

    // could break
    if (this.morale <= 22 && !this.routing) this.rout();

    for (const s of this.soldiers) s.update(dt, game);
    this.aliveCount = this.soldiers.reduce((n, s) => n + (s.alive ? 1 : 0), 0);
    if (this.aliveCount <= 0) this.dead = true;
  }

  updateArtillery(dt, game) {
    if (!this.target || !this.target.alive) return;
    const d = this.distanceTo(this.target);
    if (d <= this.range && !this.moving) {
      const ta = humanAngle(this.x, this.y, this.target.x, this.target.y);
      this.angle = approachAngle(this.angle, ta, dt * .55);
    }
    if (this.cooldown <= 0 && d <= this.range && Math.abs(angleDiff(this.angle, humanAngle(this.x, this.y, this.target.x, this.target.y))) < .32) {
      this.fireCannons(game);
    }
  }

  fireAt(target, game) {
    const shooters = this.soldiers.filter(s => s.alive);
    if (!shooters.length) return;
    this.volleys++;
    this.cooldown = this.template.reload * rand(.9, 1.12);
    this.holdFire = this.holdFire;
    const d = this.distanceTo(target);
    const accuracy = this.template.hit * clamp(1.18 - d / this.range * .55, .25, 1.15)
      * clamp(.4 + this.morale / 100 * .6, .4, 1.05) * (this.charging ? .7 : 1);
    let expected = 0;
    const hits = [];

    for (let i = 0; i < shooters.length; i++) {
      const s = shooters[i];
      s.setAction('fire', .65 + rand(0, .3));
      s.recoil = rand(.6, 1);
      if (i % 2 === 0 || i === shooters.length - 1) {
        const [mx, my] = rotate(1.6, -16, s.angle);
        game.spawnMuzzle(s.x + mx, s.y + my, s.angle, .7);
      }
      if (Math.random() < accuracy) {
        expected++;
        hits.push(s);
      }
    }
    const targetAngle = humanAngle(this.x, this.y, target.x, target.y);
    // a lingering bank of powder smoke hangs over the line after the volley
    for (let i = 0; i < 3; i++) {
      game.particles.push({
        kind: 'smoke', x: this.x + rand(-34, 34), y: this.y + rand(-14, 10),
        vx: rand(-7, 7), vy: rand(-9, -3),
        r: rand(11, 18), grow: rand(5, 9), life: rand(2.6, 4.4), maxLife: 4.4,
        alpha: rand(.08, .15), rot: rand(0, TAU), spin: rand(-.3, .3), sprite: randInt(0, 3)
      });
    }
    game.audio.shot(clamp(.08 + shooters.length * .006, .1, .24), clamp((this.x - game.camera.x) / 900, -1, 1));
    game.tracers.push({ x1: this.x, y1: this.y, x2: target.x, y2: target.y, t: 0, life: .18, side: this.side });
    if (shooters.length > 10) game.audio.shot(.16, clamp((this.x - game.camera.x) / 900, -1, 1));

    target.morale = Math.max(0, target.morale - 1.2 - expected * .28 - this.template.hit * 7);
    target.suppression = Math.min(8, target.suppression + 1.2);
    this.suppression = Math.max(0, this.suppression - .2);

    // schedule the invisible bullets for a lively, staggered impact
    for (let i = 0; i < expected; i++) {
      const delay = rand(.07, .38);
      game.after(delay, () => {
        if (this.dead || target.dead) return;
        const victim = target.randomSoldier();
        if (victim) game.killSoldier(target, victim, targetAngle + rand(-.1, .1), this.side, false);
      });
    }
    game.battleShots++;
    for (const s of shooters) if (s.action !== 'fire') s.setAction('fire', .5);
    game.after(.85, () => {
      for (const s of this.soldiers) if (s.alive) s.setAction('reload', Math.max(.8, this.cooldown - 1.2));
    });
  }

  fireCannons(game) {
    if (!this.guns.length) return;
    this.cooldown = this.template.reload * rand(.92, 1.1);
    this.volleys++;
    for (let i = 0; i < this.guns.length; i++) {
      const gun = this.guns[i];
      const [gx, gy] = rotate(gun.lx, gun.ly, this.angle);
      const wx = this.x + gx, wy = this.y + gy;
      game.after(i * .22, () => {
        if (this.dead) return;
        gun.recoil = 1;
        game.audio.cannon(.34, clamp((wx - game.camera.x) / 900, -1, 1));
        game.spawnCannonSmoke(wx, wy, this.angle);
        game.fireProjectile(wx, wy, this.target, this.side, this);
      });
    }
  }

  meleeCombat(dt, game) {
    this.moving = false;
    this.engaged = true;
    if (this.meleeClock > 0) return;
    this.meleeClock = this.type === 'cav' ? .75 : 1.25;
    const target = this.target;
    if (!target || target.dead) return;
    const dir = humanAngle(this.x, this.y, target.x, target.y);
    for (const s of this.soldiers) if (s.alive && Math.random() < .6) s.setAction('melee', .5);
    const strikes = this.type === 'cav' ? randInt(2, 4) : randInt(0, 2);
    for (let i = 0; i < strikes; i++) {
      game.after(rand(0, .18), () => {
        if (target.dead) return;
        const victim = target.randomSoldier();
        if (victim) game.killSoldier(target, victim, dir, this.side, true);
      });
    }
    const losses = randInt(0, this.type === 'cav' ? 1 : 1);
    for (let i = 0; i < losses; i++) {
      const victim = this.randomSoldier();
      if (victim) game.killSoldier(this, victim, dir + Math.PI, target.side, true);
    }
    this.morale = Math.max(0, this.morale - .6);
    target.morale = Math.max(0, target.morale - (this.type === 'cav' ? 5 : 1.5));
    game.audio.shot(.05, 0);
  }

  takeCasualty(game, direction = null) {
    this.losses++;
    this.morale = Math.max(0, this.morale - rand(.85, 1.7));
    if (direction !== null) {
      const facing = Math.abs(angleDiff(this.angle, direction));
      if (facing > 1.05) {
        this.morale = Math.max(0, this.morale - 1.9);
        if (this.flankWarn <= 0) {
          this.flankWarn = 4;
          game.message(`${this.short} are taken in flank`, 'warn');
        }
      }
    }
    this.suppression = Math.min(10, this.suppression + 1);
  }

  rout() {
    if (this.routing) return;
    this.routing = true;
    this.chargeFrom = this.target ? { x: this.target.x, y: this.target.y } : { x: this.x, y: this.y + (this.side === 'fr' ? -100 : 100) };
    this.routClock = 0;
    this.dest = null;
    this.target = null;
    this.game.message(`${this.short} has broken!`, 'warn');
    this.game.audio.bugle();
    if (this.game.selection && this.game.selection.delete(this)) this.game.refreshSelection();
  }

  randomSoldier() {
    const alive = this.soldiers.filter(s => s.alive);
    if (!alive.length) return null;
    return pick(alive);
  }

  flagPosition() {
    const s = this.soldiers[this.standardIndex];
    if (s?.alive) {
      const [fx, fy] = rotate(2.2, 0, s.angle);
      return { x: s.x + fx, y: s.y + fy, angle: this.angle, soldier: s };
    }
    return { x: this.x, y: this.y, angle: this.angle, soldier: null };
  }

  draw(ctx, time) {
    if (this.dead && this.soldiers.every(s => !s.alive)) return;
    const drawable = this.soldiers.filter(s => s.alive).sort((a, b) => a.y - b.y);
    for (const s of drawable) s.draw(ctx, time);
    if (this.type === 'arty') this.drawGuns(ctx);
    this.drawFlag(ctx, time);
    if (this.flankWarn > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(.6, this.flankWarn / 2);
      ctx.strokeStyle = '#de876f';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(this.x, this.y, 38 + Math.sin(time * 4) * 3, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }

  drawGuns(ctx) {
    for (const gun of this.guns) {
      const [x, y] = rotate(gun.lx, gun.ly, this.angle);
      ctx.save();
      ctx.translate(this.x + x, this.y + y);
      ctx.rotate(this.angle + Math.PI);
      gun.recoil = Math.max(0, gun.recoil - .035);
      ctx.fillStyle = 'rgba(27,29,19,.28)';
      ctx.beginPath(); ctx.ellipse(2, 4, 8, 4.5, 0, 0, TAU); ctx.fill();
      // carriage
      ctx.fillStyle = '#634b2f';
      ctx.fillRect(-4.5, 1, 9, 5.5);
      ctx.strokeStyle = 'rgba(207,185,137,.4)'; ctx.lineWidth = .5;
      ctx.strokeRect(-4.5, 1, 9, 5.5);
      // wheels
      ctx.strokeStyle = '#33291d'; ctx.lineWidth = 1.5;
      for (const wx of [-5.5, 5.5]) {
        ctx.beginPath(); ctx.arc(wx, 3, 4.1, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(181,160,113,.4)'; ctx.lineWidth = .5;
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 4;
          ctx.beginPath(); ctx.moveTo(wx - Math.cos(a) * 3.4, 3 - Math.sin(a) * 3.4); ctx.lineTo(wx + Math.cos(a) * 3.4, 3 + Math.sin(a) * 3.4); ctx.stroke();
        }
        ctx.strokeStyle = '#33291d'; ctx.lineWidth = 1.5;
      }
      // barrel
      const rec = gun.recoil * 3;
      ctx.strokeStyle = '#4c4d46'; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(0, 3 + rec); ctx.lineTo(0, -12 + rec); ctx.stroke();
      ctx.strokeStyle = 'rgba(206,201,179,.5)'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(-.8, 1 + rec); ctx.lineTo(-.8, -11 + rec); ctx.stroke();
      ctx.fillStyle = '#35362f';
      ctx.beginPath(); ctx.arc(0, -12 + rec, 1.7, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  drawFlag(ctx, time) {
    const fp = this.flagPosition();
    ctx.save();
    ctx.translate(fp.x, fp.y);
    ctx.rotate(fp.angle);
    ctx.strokeStyle = 'rgba(39,30,19,.9)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(0, -20);
    ctx.stroke();
    const wave = Math.sin(time * 2.4 + this.id) * 1.3;
    ctx.translate(0, -20);
    if (this.side === 'fr') {
      const cols = ['#2b5090', '#e8e0c8', '#a63f34'];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = cols[i];
        ctx.beginPath();
        ctx.moveTo(i * 4 - 6, 0);
        ctx.lineTo(i * 4 - 2 + wave, 0);
        ctx.lineTo(i * 4 - 2 + wave * 1.4, 6.5);
        ctx.lineTo(i * 4 - 6, 6.5);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(232,197,112,.8)';
      ctx.beginPath(); ctx.arc(-.8, 3.2, .8, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = '#263f68';
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.lineTo(7 + wave, 0);
      ctx.lineTo(7 + wave * 1.4, 6.5);
      ctx.lineTo(-7, 6.5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(235,225,194,.8)'; ctx.lineWidth = .9;
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7 + wave, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-7, 3.3); ctx.lineTo(7 + wave, 3.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-7, 6.5); ctx.lineTo(7 + wave * 1.4, 6.5); ctx.stroke();
      ctx.strokeStyle = 'rgba(214,66,57,.9)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-.5, 0); ctx.lineTo(7, 6.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(7 + wave, 0); ctx.lineTo(-.5, 6.5); ctx.stroke();
    }
    // finial
    ctx.fillStyle = '#d1b36f';
    ctx.beginPath(); ctx.arc(0, -.8, 1, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function makeMock(side, type, pose) {
  const target = pose.aim ? { x: 0, y: -200, alive: true } : null;
  return Object.assign(Object.create(Soldier.prototype), {
    side, x: 0, y: 0, angle: 0, index: 3,
    step: pose.step ?? 0,
    moving: !!pose.moving,
    action: pose.action || 'idle',
    actionT: pose.actionT ?? 0,
    hasFlag: false,
    unit: {
      type, target, moving: false, routing: false, charging: !!pose.charging,
      range: 300, distanceTo: () => 160
    }
  });
}

function renderMock(mock) {
  const c = document.createElement('canvas');
  c.width = SPRITE_SIZE; c.height = SPRITE_SIZE;
  const g = c.getContext('2d');
  g.translate(SPRITE_SIZE / 2, SPRITE_SIZE / 2);
  g.scale(SPRITE_SCALE, SPRITE_SCALE);
  Soldier.prototype.drawVector.call(mock, g, 0);
  return { image: c, worldSize: SPRITE_SIZE / SPRITE_SCALE };
}

export function buildSpriteSheets() {
  const sheets = {};
  for (const side of ['fr', 'gb']) {
    const foot = { walk: [], idle: [], fire: [], reload: [], melee: [], aim: null };
    for (let i = 0; i < 8; i++) {
      foot.walk.push(renderMock(makeMock(side, 'line', {
        moving: true, step: i / 8 * TAU / 1.7
      })));
    }
    foot.idle.push(renderMock(makeMock(side, 'line', { step: .2 })));
    foot.idle.push(renderMock(makeMock(side, 'line', { step: 1.7 })));
    foot.aim = renderMock(makeMock(side, 'line', { aim: true }));
    foot.fire.push(renderMock(makeMock(side, 'line', { aim: true, action: 'fire', actionT: .14 })));
    foot.fire.push(renderMock(makeMock(side, 'line', { aim: true, action: 'fire', actionT: .25 })));
    foot.reload.push(renderMock(makeMock(side, 'line', { aim: true, action: 'reload', actionT: 1.2 })));
    foot.reload.push(renderMock(makeMock(side, 'line', { aim: true, action: 'reload', actionT: .55 })));
    foot.melee.push(renderMock(makeMock(side, 'line', { aim: true, action: 'melee' })));

    const cav = { walk: [], idle: [], fire: [], reload: [], melee: [], aim: null, charge: [] };
    for (let i = 0; i < 8; i++) {
      cav.walk.push(renderMock(makeMock(side, 'cav', {
        moving: true, step: i / 8 * TAU / 1.7
      })));
    }
    cav.idle.push(cav.walk[0]);
    cav.idle.push(cav.walk[1]);
    cav.aim = cav.walk[0];
    cav.fire = [cav.walk[0], cav.walk[1]];
    cav.reload = [cav.walk[2], cav.walk[3]];
    cav.melee = renderMock(makeMock(side, 'cav', { moving: true, step: 2, charging: true, action: 'melee' }));
    cav.charge.push(cav.melee);
    cav.charge.push(renderMock(makeMock(side, 'cav', { moving: true, step: 4.2, charging: true, action: 'melee' })));
    sheets[side] = { foot, cav };
  }
  return sheets;
}

export function createArmies(game) {
  const frenchCfg = [
    { side: 'fr', name: '1er Régiment de Ligne', short: '1er Ligne', type: 'line', x: 945, y: 1215, angle: 0, count: 42, morale: 90 },
    { side: 'fr', name: '3e Régiment de Ligne', short: '3e Ligne', type: 'line', x: 1130, y: 1238, angle: .02, count: 42, morale: 90 },
    { side: 'fr', name: 'Bataillon de Voltigeurs', short: 'Voltigeurs', type: 'light', x: 1318, y: 1196, angle: .06, count: 36, morale: 92 },
    { side: 'fr', name: 'Artillerie à Pied', short: 'Batterie', type: 'arty', x: 1048, y: 1350, angle: 0, count: 18, morale: 82 },
    { side: 'fr', name: '2e Cuirassiers', short: 'Cuirassiers', type: 'cav', x: 704, y: 1295, angle: .1, count: 22, morale: 94 },
    { side: 'fr', name: 'Grenadiers de la Garde', short: 'Vieille Garde', type: 'guard', x: 1275, y: 1372, angle: -.03, count: 30, morale: 100 }
  ];
  const britishCfg = [
    { side: 'gb', name: '1st Foot Guards', short: 'Foot Guards', type: 'guard', x: 1080, y: 448, angle: Math.PI, count: 30 },
    { side: 'gb', name: '33rd Regiment of Foot', short: '33rd Foot', type: 'line', x: 895, y: 492, angle: Math.PI, count: 34 },
    { side: 'gb', name: '42nd Highlanders', short: '42nd Foot', type: 'line', x: 690, y: 480, angle: Math.PI + .05, count: 32 },
    { side: 'gb', name: 'Royal Horse Artillery', short: 'RHA Guns', type: 'arty', x: 1260, y: 374, angle: Math.PI, count: 16 },
    { side: 'gb', name: 'Scots Greys', short: 'Scots Greys', type: 'cav', x: 1570, y: 525, angle: Math.PI - .2, count: 16 },
    { side: 'gb', name: '95th Rifles', short: '95th Rifles', type: 'light', x: 1390, y: 480, angle: Math.PI + .03, count: 26 },
    { side: 'gb', name: 'Hanoverian Landwehr', short: 'Landwehr', type: 'line', x: 530, y: 572, angle: Math.PI + .1, count: 28, morale: 64 }
  ];
  return [...frenchCfg.map(c => new Unit(game, c)), ...britishCfg.map(c => new Unit(game, c))];
}
