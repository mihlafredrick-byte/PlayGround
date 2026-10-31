import {
  TAU, clamp, lerp, mulberry32, fbm, valueNoise, polyPath, rgba, rand
} from './utils.js';

export const WORLD = { w: 2600, h: 1700 };

const palette = {
  grass: '#69784a',
  grassLight: '#83905a',
  grassDark: '#4e5d39',
  wheat: '#a09559',
  wheatLight: '#baae6d',
  fallow: '#7b754f',
  soil: '#6d6042',
  soilDark: '#534932',
  road: '#a18f6a',
  roadLight: '#b6a681',
  stone: '#a69c82',
  stoneDark: '#77705d',
  roof: '#744f3d',
  roofLight: '#946a51',
  roofDark: '#52382c'
};

function polyField(ctx, pts, fill, rnd, opts = {}) {
  ctx.save();
  polyPath(ctx, pts);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.clip();
  const minX = Math.min(...pts.map(p => p[0])), maxX = Math.max(...pts.map(p => p[0]));
  const minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]));
  const n = opts.count || Math.floor((maxX - minX) * (maxY - minY) / 70);
  const angle = opts.angle ?? 0.2;
  for (let i = 0; i < n; i++) {
    const x = lerp(minX, maxX, rnd()), y = lerp(minY, maxY, rnd());
    const len = opts.len ? lerp(opts.len[0], opts.len[1], rnd()) : 2 + rnd() * 5;
    const a = angle + (rnd() - .5) * .55;
    const shade = rnd();
    ctx.strokeStyle = shade < .5
      ? rgba(opts.dark || '#4e5b37', .12 + rnd() * .24)
      : rgba(opts.light || '#c1bb79', .08 + rnd() * .2);
    ctx.lineWidth = .7 + rnd() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * len, y - Math.sin(a) * len);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  // broad painterly tonal patches
  for (let i = 0; i < (opts.blotches || 11); i++) {
    const x = lerp(minX, maxX, rnd()), y = lerp(minY, maxY, rnd());
    const r = 35 + rnd() * 100;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(opts.light || '#c8c17e', .035 + rnd() * .04));
    g.addColorStop(1, rgba(opts.light || '#c8c17e', 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}

function drawRoad(ctx, points, width) {
  const path = new Path2D();
  path.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length - 1; i++) {
    const xc = (points[i][0] + points[i + 1][0]) / 2;
    const yc = (points[i][1] + points[i + 1][1]) / 2;
    path.quadraticCurveTo(points[i][0], points[i][1], xc, yc);
  }
  const last = points[points.length - 1];
  path.lineTo(last[0], last[1]);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(62,53,36,.34)';
  ctx.lineWidth = width + 12;
  ctx.stroke(path);
  ctx.strokeStyle = palette.road;
  ctx.lineWidth = width;
  ctx.stroke(path);
  ctx.strokeStyle = 'rgba(205,190,151,.26)';
  ctx.lineWidth = width * .62;
  ctx.stroke(path);
  ctx.strokeStyle = 'rgba(89,74,48,.3)';
  ctx.lineWidth = 2;
  ctx.stroke(path);
  ctx.restore();

  // wheel ruts and puddles
  const rnd = mulberry32(1299);
  for (let k = 0; k < 2; k++) {
    ctx.save();
    ctx.strokeStyle = 'rgba(91,77,51,.32)';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([15, 11]);
    ctx.lineDashOffset = k * 18;
    ctx.stroke(path);
    ctx.restore();
  }
  for (let i = 0; i < 22; i++) {
    const p = points[Math.floor(rnd() * points.length)];
    const x = p[0] + (rnd() - .5) * width * .8;
    const y = p[1] + (rnd() - .5) * width * .8;
    ctx.fillStyle = `rgba(85,92,73,${.12 + rnd() * .18})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 5 + rnd() * 12, 2 + rnd() * 5, rnd() * TAU, 0, TAU);
    ctx.fill();
  }
}

function drawTree(ctx, x, y, r, rnd, tint = 0) {
  ctx.save();
  // cast shadow to south-east
  ctx.fillStyle = 'rgba(27,33,20,.23)';
  ctx.beginPath();
  ctx.ellipse(x + r * .33, y + r * .43, r * .98, r * .64, -.25, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(45,40,27,.5)';
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1.5, r * .12), 0, TAU);
  ctx.fill();

  const lobes = 5 + Math.floor(rnd() * 4);
  for (let i = 0; i < lobes; i++) {
    const a = rnd() * TAU;
    const d = rnd() * r * .52;
    const lr = r * (.32 + rnd() * .38);
    const lx = x + Math.cos(a) * d;
    const ly = y + Math.sin(a) * d;
    const dark = i < 2;
    const grd = ctx.createRadialGradient(lx - lr * .25, ly - lr * .35, 1, lx, ly, lr);
    grd.addColorStop(0, dark ? '#485536' : (i % 3 === 0 ? '#6e7d4b' : '#5d6d41'));
    grd.addColorStop(.62, dark ? '#354028' : '#465533');
    grd.addColorStop(1, '#2e3924');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(181,181,117,.17)';
  for (let i = 0; i < 8; i++) {
    const a = rnd() * TAU, d = rnd() * r * .62;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1 + rnd() * 3.6, 0, TAU);
    ctx.fill();
  }
  if (tint) {
    ctx.fillStyle = `rgba(112,95,49,${tint})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawHedge(ctx, pts, rnd) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#3d492c';
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  for (let i = 0; i < 160; i++) {
    const t = rnd();
    const p = pointAlong(pts, t);
    const a = rnd() * TAU, d = rnd() * 8;
    const r = 3 + rnd() * 6;
    ctx.fillStyle = rnd() < .45 ? 'rgba(106,119,68,.85)' : 'rgba(68,84,48,.9)';
    ctx.beginPath();
    ctx.arc(p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function pointAlong(pts, t) {
  const total = pts.length - 1;
  const f = t * total;
  const i = Math.min(total - 1, Math.floor(f));
  return [lerp(pts[i][0], pts[i + 1][0], f - i), lerp(pts[i][1], pts[i + 1][1], f - i)];
}

function drawStoneWall(ctx, pts, rnd) {
  ctx.save();
  ctx.strokeStyle = 'rgba(42,40,29,.4)';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.strokeStyle = '#8d856f';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(206,195,160,.3)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  for (let i = 0; i < 80; i++) {
    const p = pointAlong(pts, rnd());
    ctx.fillStyle = rnd() < .5 ? 'rgba(64,61,46,.28)' : 'rgba(228,215,173,.2)';
    ctx.fillRect(p[0] + (rnd() - .5) * 5, p[1] + (rnd() - .5) * 4, 1 + rnd() * 3, 1 + rnd() * 2);
  }
  ctx.restore();
}

function drawFence(ctx, pts, rnd) {
  ctx.save();
  ctx.strokeStyle = 'rgba(57,45,29,.45)';
  ctx.lineWidth = 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = Math.max(1, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 16));
    for (let j = 0; j <= n; j++) {
      const x = lerp(a[0], b[0], j / n), y = lerp(a[1], b[1], j / n);
      ctx.fillStyle = 'rgba(52,43,29,.65)';
      ctx.fillRect(x - 1, y - 3, 2.4, 7);
      ctx.fillStyle = 'rgba(191,171,129,.35)';
      ctx.fillRect(x - .5, y - 2, 1, 5);
    }
    ctx.strokeStyle = 'rgba(73,58,36,.8)';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1] - 2);
    ctx.lineTo(b[0], b[1] - 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBuilding(ctx, x, y, w, h, rot, style, rnd) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const dark = style === 'barn';
  // shadow
  ctx.fillStyle = 'rgba(26,29,18,.33)';
  ctx.fillRect(-w / 2 + 12, -h / 2 + 14, w, h);
  // wall base
  ctx.fillStyle = dark ? '#8d8067' : '#b0a58c';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  // roof
  const roofGrad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  roofGrad.addColorStop(0, dark ? '#57463a' : '#8a6047');
  roofGrad.addColorStop(.44, dark ? '#6a5543' : '#9f7254');
  roofGrad.addColorStop(1, dark ? '#42362c' : '#6e4c3b');
  ctx.fillStyle = roofGrad;
  ctx.fillRect(-w / 2 - 8, -h / 2 - 7, w + 16, h + 14);
  // roof outline and ridge
  ctx.strokeStyle = 'rgba(45,35,26,.5)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-w / 2 - 8, -h / 2 - 7, w + 16, h + 14);
  ctx.strokeStyle = 'rgba(34,28,22,.52)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-w / 2 - 3, 0);
  ctx.lineTo(w / 2 + 3, 0);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(215,185,143,.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // roof tile rows
  ctx.strokeStyle = dark ? 'rgba(35,28,22,.22)' : 'rgba(70,45,34,.22)';
  ctx.lineWidth = .8;
  for (let yy = -h / 2; yy < h / 2; yy += 5.5) {
    ctx.beginPath();
    ctx.moveTo(-w / 2, yy);
    ctx.lineTo(w / 2, yy);
    ctx.stroke();
    for (let xx = -w / 2 + ((Math.floor(yy / 5.5) % 2) * 4); xx < w / 2; xx += 8) {
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx, yy + 5.5);
      ctx.stroke();
    }
  }
  // gable ends
  ctx.fillStyle = '#a2957b';
  ctx.fillRect(-w / 2 - 8, -h / 2 - 7, w + 16, 4);
  ctx.fillRect(-w / 2 - 8, h / 2 + 3, w + 16, 4);
  // chimney
  ctx.fillStyle = '#6d6252';
  ctx.fillRect(w * .24, -h * .26, 14, 13);
  ctx.fillStyle = '#4b4238';
  ctx.fillRect(w * .24 + 3, -h * .25, 8, 6);
  // small dormer window
  if (!dark) {
    ctx.fillStyle = '#3a3f36';
    ctx.fillRect(-w * .22, -5, 13, 10);
    ctx.strokeStyle = 'rgba(196,177,139,.4)';
    ctx.strokeRect(-w * .22, -5, 13, 10);
  }
  ctx.restore();
}

function drawWell(ctx, x, y, rnd) {
  ctx.save();
  ctx.fillStyle = 'rgba(35,37,24,.3)';
  ctx.beginPath(); ctx.ellipse(x + 4, y + 5, 15, 8, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8d846d';
  ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.fill();
  ctx.fillStyle = '#4e5b50';
  ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#69614f'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - 8, y - 5); ctx.lineTo(x, y - 13); ctx.lineTo(x + 8, y - 5); ctx.stroke();
  ctx.restore();
}

function drawOrchard(ctx, x, y, cols, rows, rnd) {
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const tx = x + i * 48 + (j % 2) * 10 + (rnd() - .5) * 14;
      const ty = y + j * 44 + (rnd() - .5) * 10;
      drawTree(ctx, tx, ty, 13 + rnd() * 6, rnd, .05);
    }
  }
}

function drawCropRows(ctx, pts, rnd, color, spacing = 10) {
  ctx.save();
  polyPath(ctx, pts);
  ctx.clip();
  const minX = Math.min(...pts.map(p => p[0])) - 20, maxX = Math.max(...pts.map(p => p[0])) + 20;
  const minY = Math.min(...pts.map(p => p[1])) - 20, maxY = Math.max(...pts.map(p => p[1])) + 20;
  for (let x = minX; x < maxX; x += spacing) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, minY);
    ctx.lineTo(x + 7, maxY);
    ctx.stroke();
  }
  ctx.restore();
}

function buildGround(ctx, rnd) {
  const grd = ctx.createLinearGradient(0, 0, WORLD.w, WORLD.h);
  grd.addColorStop(0, '#657348');
  grd.addColorStop(.45, '#70804e');
  grd.addColorStop(1, '#5e6e45');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  // painterly broad base mottling
  for (let i = 0; i < 180; i++) {
    const x = rnd() * WORLD.w, y = rnd() * WORLD.h;
    const r = 70 + rnd() * 280;
    const col = rnd() < .32 ? '#89915a' : rnd() < .5 ? '#536439' : '#778651';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, .09 + rnd() * .09));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const f1 = [[120, 82], [612, 60], [691, 388], [530, 590], [112, 545]];
  polyField(ctx, f1, palette.wheat, rnd, { angle: -.14, dark: '#6a603b', light: '#cdbf7b', count: 3600, blotches: 18 });
  drawCropRows(ctx, f1, rnd, 'rgba(92,80,45,.15)', 9);

  const f2 = [[750, 67], [1204, 85], [1284, 405], [1094, 542], [706, 460]];
  polyField(ctx, f2, '#7a8753', rnd, { angle: .06, dark: '#4c5a35', light: '#aeb47a', count: 2600 });

  const f3 = [[1638, 58], [2490, 44], [2564, 371], [2400, 690], [1785, 690], [1596, 426]];
  polyField(ctx, f3, '#a89b60', rnd, { angle: .22, dark: '#6a5d37', light: '#d4c385', count: 5000, blotches: 24 });
  drawCropRows(ctx, f3, rnd, 'rgba(104,87,49,.17)', 11);

  const f4 = [[125, 730], [645, 622], [780, 926], [454, 1061], [105, 1002]];
  polyField(ctx, f4, '#7b8954', rnd, { angle: -.08, dark: '#506039', light: '#b0b679', count: 2800 });
  const f5 = [[1600, 820], [2160, 723], [2520, 890], [2470, 1250], [1840, 1330], [1560, 1100]];
  polyField(ctx, f5, '#8e8455', rnd, { angle: .13, dark: '#5e5434', light: '#c1b579', count: 3500 });
  const f6 = [[242, 1182], [815, 1092], [1000, 1380], [733, 1590], [192, 1515]];
  polyField(ctx, f6, '#72814b', rnd, { angle: .02, dark: '#465735', light: '#a6ae72', count: 3200 });
  const f7 = [[1710, 1418], [2450, 1366], [2590, 1664], [1836, 1680], [1510, 1552]];
  polyField(ctx, f7, '#837d51', rnd, { angle: -.1, dark: '#5d5434', light: '#b7ab72', count: 2800 });
  const f8 = [[1010, 1190], [1375, 1128], [1530, 1350], [1440, 1680], [948, 1660], [856, 1391]];
  polyField(ctx, f8, '#697a48', rnd, { angle: -.2, dark: '#445433', light: '#9ca56c', count: 3600 });

  // pasture around farm
  const f9 = [[1120, 640], [1670, 620], [1840, 860], [1660, 1080], [1190, 1018], [1030, 810]];
  polyField(ctx, f9, '#74824f', rnd, { angle: .1, dark: '#4a5937', light: '#a5aa6d', count: 2200 });

  // little kitchen garden
  const garden = [[1504, 695], [1637, 690], [1647, 754], [1510, 762]];
  ctx.save(); polyPath(ctx, garden); ctx.fillStyle = '#695e42'; ctx.fill(); ctx.clip();
  for (let i = 0; i < 20; i++) {
    ctx.strokeStyle = 'rgba(49,56,33,.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(1504 + i * 7, 690); ctx.lineTo(1504 + i * 7, 766); ctx.stroke();
  }
  ctx.restore();

  // crossroad and tracks
  drawRoad(ctx, [[1170, 1780], [1240, 1400], [1288, 1090], [1356, 890], [1430, 746], [1390, 590], [1310, 288], [1350, 20]], 46);
  drawRoad(ctx, [[-30, 858], [320, 838], [740, 852], [1110, 840], [1432, 760], [1850, 700], [2190, 604], [2640, 590]], 34);
  drawRoad(ctx, [[510, 1710], [690, 1460], [910, 1240], [1120, 1010], [1360, 760]], 20);

  // ridge shadow bands
  ctx.save();
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `rgba(47,58,35,${.055 + i * .018})`;
    ctx.lineWidth = 22 - i * 5;
    ctx.beginPath();
    ctx.moveTo(0, 538 + i * 18);
    ctx.bezierCurveTo(600, 505 + i * 15, 1150, 585 + i * 12, 1700, 535 + i * 18);
    ctx.bezierCurveTo(2060, 505 + i * 18, 2380, 555 + i * 10, 2600, 520 + i * 16);
    ctx.stroke();
  }
  ctx.restore();

  // hedges and boundaries
  drawHedge(ctx, [[113, 548], [531, 593], [691, 387]], rnd);
  drawHedge(ctx, [[691, 388], [720, 458], [750, 66]], rnd);
  drawHedge(ctx, [[1204, 85], [1284, 405], [1300, 498]], rnd);
  drawHedge(ctx, [[1598, 426], [1785, 690], [1600, 818]], rnd);
  drawHedge(ctx, [[1785, 690], [2400, 690], [2560, 372]], rnd);
  drawHedge(ctx, [[125, 730], [645, 622], [780, 926]], rnd);
  drawHedge(ctx, [[125, 1003], [454, 1061], [780, 926]], rnd);
  drawHedge(ctx, [[105, 1180], [242, 1182], [815, 1092]], rnd);
  drawHedge(ctx, [[1600, 820], [1840, 1330], [2470, 1250]], rnd);
  drawHedge(ctx, [[1840, 1330], [1710, 1418]], rnd);
  drawHedge(ctx, [[948, 1660], [1440, 1680]], rnd);

  drawFence(ctx, [[480, 1036], [634, 1010], [790, 964]], rnd);
  drawFence(ctx, [[1690, 718], [1770, 739], [1840, 780]], rnd);
  drawFence(ctx, [[1030, 1288], [1110, 1258], [1170, 1238]], rnd);

  // farm yard
  ctx.save();
  polyPath(ctx, [[1230, 674], [1580, 658], [1666, 914], [1508, 973], [1228, 922]]);
  ctx.fillStyle = '#8f8264';
  ctx.fill();
  ctx.clip();
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rnd() < .5 ? 'rgba(179,166,130,.22)' : 'rgba(95,84,60,.2)';
    ctx.fillRect(1220 + rnd() * 470, 650 + rnd() * 330, 1 + rnd() * 4, 1 + rnd() * 3);
  }
  ctx.restore();

  // cobbles / courtyard paths
  ctx.save();
  ctx.strokeStyle = 'rgba(73,65,47,.36)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(1372, 850); ctx.quadraticCurveTo(1400, 800, 1432, 776); ctx.stroke();
  ctx.restore();

  drawStoneWall(ctx, [[1218, 666], [1578, 646], [1662, 906], [1500, 966]], rnd);
  drawStoneWall(ctx, [[1218, 666], [1222, 928]], rnd);

  drawBuilding(ctx, 1443, 728, 174, 67, -.04, 'house', rnd);
  drawBuilding(ctx, 1290, 758, 88, 107, .05, 'barn', rnd);
  drawBuilding(ctx, 1572, 806, 61, 83, .02, 'barn', rnd);
  drawWell(ctx, 1378, 826, rnd);

  // orchard
  drawOrchard(ctx, 1110, 980, 7, 5, rnd);
  drawOrchard(ctx, 1620, 1000, 6, 4, rnd);

  // scattered trees and copses
  const trees = [
    [188, 358, 21], [235, 420, 16], [168, 493, 14], [322, 535, 19], [278, 637, 15],
    [820, 585, 18], [920, 545, 13], [988, 610, 21], [744, 660, 15],
    [2350, 768, 20], [2426, 733, 26], [2490, 835, 17], [2288, 870, 14],
    [152, 1100, 22], [205, 1148, 15], [471, 1140, 17], [835, 1150, 15],
    [1510, 1180, 19], [1570, 1228, 14], [2400, 1450, 22], [2480, 1510, 18], [1350, 1570, 17],
    [550, 300, 23], [490, 360, 14], [1020, 290, 18], [1830, 300, 16], [1910, 258, 20],
    [2050, 820, 14], [2120, 860, 18], [1490, 1080, 12], [858, 920, 19], [610, 960, 13]
  ];
  const obstacles = [];
  for (const [x, y, r] of trees) {
    drawTree(ctx, x, y, r, rnd);
    obstacles.push({ x, y, r: r * .42, type: 'tree' });
  }

  // hedgerow tree line at far edges
  for (let x = 20; x < WORLD.w; x += 62 + rnd() * 40) {
    if (x < 180 || (x > 1240 && x < 1490)) continue;
    drawTree(ctx, x, 10 + rnd() * 16, 14 + rnd() * 10, rnd);
  }
  for (let y = 40; y < WORLD.h; y += 70 + rnd() * 50) {
    drawTree(ctx, 10 + rnd() * 20, y, 15 + rnd() * 10, rnd);
    drawTree(ctx, WORLD.w - 10 - rnd() * 20, y, 15 + rnd() * 10, rnd);
  }

  // pond in the low field
  ctx.save();
  const pond = new Path2D();
  pond.ellipse(430, 1288, 55, 30, -.3, 0, TAU);
  ctx.fillStyle = 'rgba(38,45,31,.35)';
  ctx.fill(pond);
  ctx.strokeStyle = '#53675c';
  ctx.lineWidth = 4;
  ctx.stroke(pond);
  ctx.clip(pond);
  const wg = ctx.createLinearGradient(370, 1260, 490, 1310);
  wg.addColorStop(0, '#647d76');
  wg.addColorStop(.55, '#455f5b');
  wg.addColorStop(1, '#334942');
  ctx.fillStyle = wg;
  ctx.fillRect(360, 1245, 150, 90);
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = `rgba(199,209,186,${.08 + rnd() * .18})`;
    ctx.lineWidth = .8;
    ctx.beginPath();
    ctx.ellipse(380 + rnd() * 100, 1260 + rnd() * 55, 4 + rnd() * 13, 1 + rnd() * 2, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  // meadow flowers, grass tufts
  for (let i = 0; i < 1500; i++) {
    const x = rnd() * WORLD.w, y = rnd() * WORLD.h;
    const n = valueNoise(x / 130, y / 130);
    if (n < .32) continue;
    if (rnd() < .8) {
      ctx.strokeStyle = rnd() < .5 ? 'rgba(180,190,125,.13)' : 'rgba(40,54,30,.13)';
      ctx.lineWidth = .8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - .5) * 3, y - 2 - rnd() * 4);
      ctx.stroke();
    } else {
      ctx.fillStyle = rnd() < .45 ? 'rgba(223,204,139,.4)' : 'rgba(203,194,170,.3)';
      ctx.beginPath();
      ctx.arc(x, y, .9 + rnd() * 1.1, 0, TAU);
      ctx.fill();
    }
  }

  // stone / mud flecks
  for (let i = 0; i < 320; i++) {
    const x = rnd() * WORLD.w, y = rnd() * WORLD.h;
    ctx.fillStyle = `rgba(91,84,61,${.05 + rnd() * .1})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 1 + rnd() * 4, .6 + rnd() * 2, rnd() * TAU, 0, TAU);
    ctx.fill();
  }

  // soft cloud shadows
  for (let i = 0; i < 8; i++) {
    const x = rnd() * WORLD.w, y = rnd() * WORLD.h;
    const rx = 200 + rnd() * 320, ry = 80 + rnd() * 160;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, 'rgba(28,37,22,.075)');
    g.addColorStop(.72, 'rgba(28,37,22,.04)');
    g.addColorStop(1, 'rgba(28,37,22,0)');
    ctx.save();
    ctx.translate(x, y); ctx.scale(1, ry / rx);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
    ctx.restore();
  }

  return obstacles;
}

export function buildTerrain() {
  const S = 1.2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(WORLD.w * S);
  canvas.height = Math.round(WORLD.h * S);
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S);
  const rnd = mulberry32(18150618);
  const obstacles = buildGround(ctx, rnd);

  // static atmosphere / rain pooling
  ctx.save();
  for (let i = 0; i < 60; i++) {
    const x = rnd() * WORLD.w, y = rnd() * WORLD.h;
    ctx.fillStyle = `rgba(94,100,75,${.05 + rnd() * .06})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 10 + rnd() * 35, 3 + rnd() * 10, rnd() * TAU, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  return {
    canvas,
    obstacles,
    scale: S,
    farmZone: { x: 1435, y: 842, r: 118 },
    roadCrossing: { x: 1360, y: 840 }
  };
}
