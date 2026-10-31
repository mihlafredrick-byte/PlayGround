import { TAU, clamp, rotate, rand, rgba } from './utils.js';

const FALL_COLORS = {
  fr: {
    coat: '#2d4b7d', coatDark: '#192c4d', facing: '#9e3c32', trouser: '#cdc3a8',
    leather: '#29241c', skin: '#c99c74', hat: '#171814', plume: '#9f342d', belt: '#d9ccb0'
  },
  gb: {
    coat: '#8e342e', coatDark: '#571e1c', facing: '#c6a052', trouser: '#b7b2a1',
    leather: '#29241c', skin: '#c99c74', hat: '#141512', plume: '#c7b27c', belt: '#ded4bb'
  }
};

export class Ragdoll {
  constructor(x, y, angle, side, opts = {}) {
    this.side = side;
    this.age = 0;
    this.still = 0;
    this.settled = false;
    this.alpha = 1;
    this.scale = opts.scale || 1;
    this.blood = [];
    this.seed = Math.random() * 1000;
    this.weaponAngle = angle + rand(-1.8, 1.8);
    this.hasWeapon = opts.weapon !== false;
    const color = FALL_COLORS[side] || FALL_COLORS.fr;
    this.colors = color;

    const imp = opts.impulse || { x: 0, y: 0, spin: 0 };
    const c = Math.cos(angle), s = Math.sin(angle);
    const spread = opts.explosion ? 1.7 : 1;
    const jitter = () => (Math.random() - .5) * 4 * spread;

    const local = [
      ['head', 0, 10.2], ['neck', 0, 6.4], ['pelvis', 0, -2.2],
      ['lShoulder', -3.1, 5.2], ['rShoulder', 3.1, 5.2],
      ['lElbow', -4.7, 2.2], ['rElbow', 4.5, 2.8],
      ['lHand', -4.4, -.8], ['rHand', 4.8, 1.2],
      ['lHip', -1.9, -2.6], ['rHip', 1.9, -2.6],
      ['lKnee', -2.4, -6.3], ['rKnee', 2.2, -6.6],
      ['lFoot', -2.8, -10.1], ['rFoot', 2.5, -10.5]
    ];
    this.pts = {};
    this.order = [];
    for (const [name, lx, ly] of local) {
      const [rx, ry] = rotate(lx, ly, angle);
      const p = {
        x: x + rx + jitter(), y: y + ry + jitter(),
        px: 0, py: 0, z: Math.random() * 2, oz: 0
      };
      p.px = p.x - (imp.x || 0) * .055 - (Math.random() - .5) * 1.1 * spread;
      p.py = p.y - (imp.y || 0) * .055 - (Math.random() - .5) * 1.1 * spread;
      p.oz = 30 + Math.random() * (opts.explosion ? 120 : 55);
      this.pts[name] = p;
      this.order.push(name);
    }
    // rotate a little so bodies do not all face the same way
    const spin = rand(-.35, .35) + (imp.spin || 0);
    for (const n of this.order) {
      const p = this.pts[n];
      const dx = p.x - x, dy = p.y - y;
      const [rx, ry] = rotate(dx, dy, spin);
      p.x = x + rx; p.y = y + ry;
    }
    this.rest = [
      ['head', 'neck', 3.8], ['neck', 'pelvis', 8.6],
      ['lShoulder', 'rShoulder', 6.2], ['lShoulder', 'neck', 3.2],
      ['rShoulder', 'neck', 3.2], ['lHip', 'rHip', 3.8],
      ['lHip', 'pelvis', 2.1], ['rHip', 'pelvis', 2.1],
      ['lShoulder', 'lHip', 7.9], ['rShoulder', 'rHip', 7.9],
      ['lShoulder', 'rHip', 8.7], ['rShoulder', 'lHip', 8.7],
      ['lShoulder', 'lElbow', 3.1], ['lElbow', 'lHand', 3.0],
      ['rShoulder', 'rElbow', 3.2], ['rElbow', 'rHand', 3.0],
      ['lHip', 'lKnee', 3.8], ['lKnee', 'lFoot', 3.9],
      ['rHip', 'rKnee', 3.8], ['rKnee', 'rFoot', 4.0],
      ['neck', 'lElbow', 5.2], ['neck', 'rElbow', 5.2]
    ];
    this.constraints = this.rest.map(([a, b, len]) => ({ a: this.pts[a], b: this.pts[b], len: len * this.scale, stiff: 1 }));

    // blood splatter beneath the body
    for (let i = 0; i < 4 + Math.floor(Math.random() * 7); i++) {
      this.blood.push({
        x: x + rand(-14, 14), y: y + rand(-10, 10),
        r: rand(1.2, 6), sx: rand(.4, 1.6), a: rand(.08, .2)
      });
    }
    this.bloodPulse = 0;
  }

  kick(ix, iy, power = 1) {
    for (const n of this.order) {
      const p = this.pts[n];
      const m = n === 'head' || n === 'neck' ? .6 : 1;
      p.ox -= ix * .018 * power * m + rand(-.08, .08);
      p.oy -= iy * .018 * power * m + rand(-.08, .08);
      p.oz += rand(20, 80) * power;
    }
  }

  update(dt) {
    this.age += dt;
    if (this.settled) {
      if (this.age > 100) this.alpha = Math.max(0, 1 - (this.age - 100) / 30);
      return;
    }
    const step = Math.min(dt, .033) / 2;
    for (let sub = 0; sub < 2; sub++) {
      for (const name in this.pts) {
        const p = this.pts[name];
        const vx = (p.x - (p.px ?? p.x)) * .86;
        const vy = (p.y - (p.py ?? p.y)) * .86;
        p.px = p.x; p.py = p.y;
        p.x += vx;
        p.y += vy;
        p.oz -= 520 * step;
        p.z += p.oz * step;
        if (p.z <= 0) {
          p.z = 0;
          if (p.oz < -30) p.oz *= -.2;
          else p.oz = 0;
          p.x += (p.x - (p.px ?? p.x)) * .18;
          p.y += (p.y - (p.py ?? p.py)) * .18;
        }
      }

      for (let iter = 0; iter < 4; iter++) {
        for (const c of this.constraints) {
          const a = c.a, b = c.b;
          let dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || .001;
          const diff = (d - c.len) / d * .5 * c.stiff;
          dx *= diff; dy *= diff;
          a.x += dx; a.y += dy;
          b.x -= dx; b.y -= dy;
        }
      }
    }

    // ground drag
    for (const name in this.pts) {
      const p = this.pts[name];
      if (p.z === 0) {
        p.x = p.x * .998 + ((p.x + (p.x - (p.px ?? p.x))) * .002);
      }
    }

    if (this.age > 2.8) {
      this.still += dt;
      if (this.still > 1.4) this.settled = true;
    }
    this.bloodPulse = Math.min(1, this.age / 2);
  }

  drawShadow(ctx) {
    const pelvis = this.pts.pelvis;
    const head = this.pts.head;
    const dx = head.x - pelvis.x, dy = head.y - pelvis.y;
    const len = Math.hypot(dx, dy) || 1;
    const rx = Math.max(13, len * 1.15), ry = Math.max(6, len * .5);
    ctx.save();
    ctx.translate((pelvis.x + head.x) / 2 + 2, (pelvis.y + head.y) / 2 + 4);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = 'rgba(24,29,19,.23)';
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  draw(ctx) {
    if (this.alpha <= .01) return;
    const c = this.colors;
    const P = this.pts;
    const yz = p => p.y - p.z * .72;

    ctx.save();
    ctx.globalAlpha = this.alpha;

    // blood beneath
    for (const b of this.blood) {
      ctx.fillStyle = `rgba(92,28,22,${b.a * this.alpha})`;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + 2, b.r * b.sx, b.r * .55, .3, 0, TAU);
      ctx.fill();
    }

    // ghost/shadow pass
    ctx.strokeStyle = 'rgba(24,27,17,.2)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(P.lHip.x + 2, P.lHip.y + 3); ctx.lineTo(P.lKnee.x + 2, P.lKnee.y + 3); ctx.lineTo(P.lFoot.x + 2, P.lFoot.y + 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(P.rHip.x + 2, P.rHip.y + 3); ctx.lineTo(P.rKnee.x + 2, P.rKnee.y + 3); ctx.lineTo(P.rFoot.x + 2, P.rFoot.y + 3); ctx.stroke();

    // back arm
    this.limb(ctx, P.rShoulder, P.rElbow, P.rHand, c.coatDark, 3.4, 2.7);
    this.limb(ctx, P.rHip, P.rKnee, P.rFoot, c.trouser, 3.7, 2.8, '#2d2820');

    // legs
    this.limb(ctx, P.lHip, P.lKnee, P.lFoot, c.trouser, 3.9, 2.9, '#2d2820');

    // torso
    ctx.fillStyle = c.coat;
    ctx.beginPath();
    const sx = (P.lShoulder.x + P.rShoulder.x) / 2, sy = (P.lShoulder.y + P.rShoulder.y) / 2;
    ctx.moveTo(P.lShoulder.x, yz(P.lShoulder));
    ctx.quadraticCurveTo(P.lHip.x, (yz(P.lShoulder) + yz(P.lHip)) / 2, P.lHip.x, yz(P.lHip));
    ctx.lineTo(P.rHip.x, yz(P.rHip));
    ctx.quadraticCurveTo(P.rHip.x * .4 + P.rShoulder.x * .6, (yz(P.rShoulder) + yz(P.rHip)) / 2 + 1, P.rShoulder.x, yz(P.rShoulder));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = c.coatDark;
    ctx.lineWidth = .8;
    ctx.stroke();

    // crossbelt
    ctx.strokeStyle = rgba(c.belt, .62);
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(P.lShoulder.x, yz(P.lShoulder));
    ctx.lineTo(P.rHip.x, yz(P.rHip));
    ctx.stroke();
    ctx.fillStyle = c.facing;
    ctx.beginPath();
    ctx.arc(P.rShoulder.x, yz(P.rShoulder), 2.2, 0, TAU);
    ctx.fill();

    // near arm
    this.limb(ctx, P.lShoulder, P.lElbow, P.lHand, c.coat, 3.5, 2.8);
    ctx.fillStyle = c.skin;
    ctx.beginPath(); ctx.arc(P.lHand.x, yz(P.lHand), 1.5, 0, TAU); ctx.fill();

    // musket
    if (this.hasWeapon) {
      const h = P.rHand;
      const a = this.weaponAngle + Math.sin(this.seed + this.age * .2) * .02;
      const muzzleX = h.x + Math.cos(a) * 17;
      const muzzleY = yz(h) + Math.sin(a) * 17;
      ctx.strokeStyle = '#4b3522';
      ctx.lineWidth = 1.55;
      ctx.beginPath(); ctx.moveTo(h.x, yz(h)); ctx.lineTo(muzzleX, muzzleY); ctx.stroke();
      ctx.strokeStyle = 'rgba(201,204,193,.85)';
      ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(muzzleX, muzzleY); ctx.lineTo(muzzleX + Math.cos(a) * 5, muzzleY + Math.sin(a) * 5); ctx.stroke();
      if (this.age < 1.2) {
        ctx.fillStyle = `rgba(90,32,23,${(1 - this.age / 1.2) * .6})`;
        ctx.beginPath(); ctx.arc(muzzleX, muzzleY, 3 + Math.sin(this.age * 20), 0, TAU); ctx.fill();
      }
    }

    // head
    const hx = P.head.x, hy = yz(P.head);
    const neck = P.neck;
    const ha = Math.atan2(hy - yz(neck), hx - neck.x) + Math.PI / 2;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ha);
    ctx.fillStyle = c.skin;
    ctx.beginPath(); ctx.ellipse(0, 0, 2.6, 3.1, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = c.hat;
    ctx.beginPath(); ctx.ellipse(0, -.8, 2.9, 3.0, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(215,200,163,.2)';
    ctx.beginPath(); ctx.ellipse(0, -1.8, 1.7, 1.1, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = c.plume;
    ctx.beginPath(); ctx.arc(0, 2.2, 1.2, 0, TAU); ctx.fill();
    ctx.restore();

    if (this.side === 'fr' && Math.random() > .996) {
      ctx.fillStyle = 'rgba(229,215,177,.7)';
      ctx.fillRect(P.pelvis.x - 1, yz(P.pelvis) - 1, 1.5, 1.3);
    }

    ctx.restore();
  }

  limb(ctx, a, b, c, color, w1, w2, footColor) {
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = w1;
    ctx.beginPath(); ctx.moveTo(a.x, a.y - a.z * .72); ctx.lineTo(b.x, b.y - b.z * .72); ctx.stroke();
    ctx.lineWidth = w2;
    ctx.beginPath(); ctx.moveTo(b.x, b.y - b.z * .72); ctx.lineTo(c.x, c.y - c.z * .72); ctx.stroke();
    if (footColor) {
      ctx.strokeStyle = footColor;
      ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.moveTo(c.x, c.y - c.z * .72); ctx.lineTo(c.x + 1.7, c.y - c.z * .72 + 1); ctx.stroke();
    }
  }
}
