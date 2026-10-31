import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import '@fontsource/cinzel/500.css'
import '@fontsource/cinzel/600.css'
import '@fontsource/cormorant-garamond/400.css'
import '@fontsource/cormorant-garamond/400-italic.css'
import '@fontsource/barlow-condensed/300.css'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import './style.css'
import { World, terrainHeight } from './world.js'
import { Soldier } from './soldier.js'
import { Effects } from './effects.js'
import { BattleAudio } from './audio.js'
import { clamp, damp, lerp, rand, randInt, pick, TAU } from './utils.js'

const $ = (sel) => document.querySelector(sel)
const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0

const app = $('#app')
const startScreen = $('#start-screen')
const pauseScreen = $('#pause-screen')
const endScreen = $('#end-screen')
const loadingScreen = $('#loading-screen')
const hud = $('#hud')
const touchUI = $('#touch-ui')
const damageFlash = $('#damage-flash')
const slowmo = $('#slowmo')

let renderer
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false })
} catch (error) {
  $('#webgl-error').classList.remove('hidden')
  loadingScreen.classList.add('done')
  throw error
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.25 : 1.55))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.14
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0x9a8465, 0.0034)
const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.08, 650)

const world = new World(scene)
const effects = new Effects(scene, renderer)
const audio = new BattleAudio()

const hemi = new THREE.HemisphereLight(0xa9c1d9, 0x5d4a33, 1.12)
scene.add(hemi)
const sun = new THREE.DirectionalLight(0xffc48b, 3.1)
sun.position.set(-46, 38, -30)
sun.target.position.set(0, 0, -12)
sun.castShadow = true
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048)
sun.shadow.camera.left = -46
sun.shadow.camera.right = 46
sun.shadow.camera.top = 46
sun.shadow.camera.bottom = -46
sun.shadow.camera.near = 1
sun.shadow.camera.far = 140
sun.shadow.bias = -0.0008
sun.shadow.normalBias = 0.018
scene.add(sun)
scene.add(sun.target)
const fill = new THREE.DirectionalLight(0x9db4cf, 0.55)
fill.position.set(40, 22, 25)
scene.add(fill)
const ambient = new THREE.AmbientLight(0xffd6a0, 0.16)
scene.add(ambient)

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uDamage: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uDamage;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 uv = vUv;
      vec3 col = texture2D(tDiffuse, uv).rgb;

      // Gentle warm highlights and cool shadows, kept in linear space.
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col += vec3(0.026, 0.012, -0.006) * smoothstep(0.15, 1.4, luma);
      col *= mix(vec3(0.95, 0.98, 1.03), vec3(1.03, 1.0, 0.96), smoothstep(0.0, 0.7, luma));

      float d = distance(uv, vec2(0.5));
      float vig = smoothstep(0.92, 0.28, d);
      col *= mix(0.62, 1.0, vig);
      col *= 1.0 - uDamage * smoothstep(0.2, 0.8, d) * 0.22;

      float grain = hash(uv * uResolution + uTime * 12.0) - 0.5;
      col += grain * 0.022;

      // A whisper of chromatic separation at the edges.
      vec2 ca = (uv - 0.5) * 0.0009;
      float r = texture2D(tDiffuse, uv + ca).r;
      float b = texture2D(tDiffuse, uv - ca).b;
      col.r = mix(col.r, r, 0.16);
      col.b = mix(col.b, b, 0.16);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
}

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.24, 0.5, 0.95)
composer.addPass(bloom)
const smaa = new SMAAPass()
composer.addPass(smaa)
const grade = new ShaderPass(GradeShader)
composer.addPass(grade)
composer.addPass(new OutputPass())
composer.setSize(window.innerWidth, window.innerHeight)
grade.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight)

const clock = new THREE.Clock()
const game = {
  started: false,
  paused: false,
  over: false,
  victory: false,
  time: 0,
  wave: 1,
  waveState: 'active',
  waveTime: 0,
  interTimer: 0,
  enemies: [],
  allies: [],
  kills: 0,
  headshots: 0,
  allyVolleyTimer: 4.5,
  enemyVolleyTimer: 3.6,
  alliedCannonTimer: 0.8,
  enemyCannonTimer: 9.5,
  charge: false,
  chargeAt: 38,
  hasLocked: false,
  subtitleTimer: 0,
  orderTimer: 0,
  hitMarkerTimer: 0,
  hitTextTimer: 0,
  controlsFade: 0,
  cannonballs: [],
  messageCooldown: 0,
  playerDamageTime: -20,
  endShown: false,
  startAt: 0,
  waveStart: 0,
}

const player = new Soldier({ scene, faction: 'rifle', team: 'allied', x: 0, z: 6.5, isPlayer: true, effects })
player.name = 'You'
player.ammo = 1
player.maxAmmo = 1
player.reloadTime = 2.9
player.reloadTimer = 0
player.reloadProgress = 0
player.meleeTimer = 0
player.meleeCooldown = 0
player.aimHold = 0
player.health = 100
player.maxHealth = 100
player.recoilKick = 0
player.lastStep = 0

const playerStart = new THREE.Vector3(0, 0, 6.5)
const yawState = { yaw: 0, pitch: -0.035 }
const cameraState = {
  aimBlend: 0,
  shake: 0,
  position: new THREE.Vector3(0, 3, 14),
  deathAngle: 0,
}

const FRENCH_NAMES = [
  'Fusilier Moreau', 'Sgt. Delacroix', 'Cpl. Laurent', 'Fusilier Girard', 'Voltigeur Renard',
  'Fusilier Petit', 'Sgt. Vasseur', 'Cpl. Marchand', 'Fusilier Rousseau', 'Grenadier Blanc',
  'Fusilier Caron', 'Sgt. Fontaine', 'Cpl. Dubois', 'Fusilier Mercier', 'Voltigeur Leroy',
  'Fusilier Bonnet', 'Sgt. Chevalier', 'Cpl. Garnier', 'Fusilier Perrin', 'Grenadier Faure',
]
const ALLY_NAMES = [
  'Sgt. Finn', 'Cpl. Reed', 'Pte. Mercer', 'Pte. Hale', 'Cpl. Doyle',
  'Pte. Whitlock', 'Pte. Shaw', 'Pte. Carter', 'Pte. Bell', 'Pte. Grant',
]

function setOrder(small, large, duration = 4.5) {
  if (!game.started) return
  $('#order-small').textContent = small
  $('#order-large').textContent = large
  $('#order-banner').classList.add('show')
  game.orderTimer = duration
}

function say(speaker, text, duration = 4.6) {
  if (!game.started) return
  $('#subtitle-speaker').textContent = speaker
  $('#subtitle-text').textContent = text
  $('#subtitle').classList.add('show')
  game.subtitleTimer = duration
}

function addKillFeed(killer, victim, headshot = false) {
  const el = document.createElement('div')
  el.innerHTML = `<b>${killer}</b> ⟶ ${victim}${headshot ? ' <span class="head">◆ HEAD</span>' : ''}`
  $('#killfeed').prepend(el)
  while ($('#killfeed').children.length > 5) $('#killfeed').lastChild.remove()
  setTimeout(() => el.remove(), 5200)
}

function showHitmarker(killed, text = '') {
  const el = $('#hitmarker')
  el.classList.remove('kill')
  if (killed) el.classList.add('kill')
  el.classList.add('show')
  game.hitMarkerTimer = 0.14
  if (text) {
    $('#hit-text').textContent = text
    $('#hit-text').classList.add('show')
    game.hitTextTimer = 0.55
  }
}

function spawnAllies(count, z = 0.4) {
  const start = game.allies.length
  for (let i = 0; i < count; i++) {
    const slot = start + i
    // Alternate outwards from a deliberate gap in the centre of the line so
    // the player always has a clear lane onto the French.
    const side = slot % 2 === 0 ? -1 : 1
    const rank = Math.floor(slot / 2)
    const x = side * (2.5 + rank * 2.15) + rand(-0.16, 0.16)
    const s = new Soldier({ scene, faction: 'british', team: 'allied', x, z: z + rand(-0.45, 0.45), effects })
    s.name = ALLY_NAMES[(start + i) % ALLY_NAMES.length]
    s.ai = { reload: 0, reloadTime: 4.6, meleeCooldown: 0, crew: false }
    s.setFacing(0, true)
    game.allies.push(s)
  }
  const c1 = new Soldier({ scene, faction: 'british', team: 'allied', x: -14.2, z: 3.1, effects })
  c1.name = 'Gunner Pike'
  c1.ai = { reload: 0, reloadTime: 4, meleeCooldown: 0, crew: true }
  c1.setFacing(0, true)
  c1.crouched = true
  game.allies.push(c1)
  const c2 = new Soldier({ scene, faction: 'british', team: 'allied', x: -13.1, z: 1.6, effects })
  c2.name = 'Gunner Ross'
  c2.ai = { reload: 0, reloadTime: 4, meleeCooldown: 0, crew: true }
  c2.setFacing(0, true)
  game.allies.push(c2)
}

function makeEnemy(index, wave) {
  const count = [10, 13, 16][wave - 1]
  const lineCount = Math.ceil(count * 0.62)
  let x, z, state
  if (index < lineCount) {
    const spread = Math.min(22, 7 + lineCount * 1.8)
    x = -spread + (index / Math.max(1, lineCount - 1)) * spread * 2 + rand(-0.65, 0.65)
    z = -17.2 - rand(0, 2.0) - (wave - 1) * 1.0
    state = 'ready'
  } else {
    const flank = index % 2 === 0 ? 1 : -1
    x = flank * rand(6, 21) + rand(-2, 2)
    z = -31 - rand(0, 7)
    state = 'advance'
  }
  const e = new Soldier({ scene, faction: 'french', team: 'french', x, z, effects })
  e.name = FRENCH_NAMES[(index + wave * 3) % FRENCH_NAMES.length]
  e.setFacing(0, true)
  const targetZ = state === 'ready' ? z : -17 - rand(0, 4)
  e.ai = {
    state,
    advancePos: new THREE.Vector3(x + rand(-2.5, 2.5), 0, targetZ),
    timer: state === 'ready' ? rand(0.4, 1.6) : 0,
    target: null,
    targetClock: 0,
    fireIn: 0,
    reload: 0,
    reloadTime: rand(3.8, 4.8),
    meleeCooldown: 0,
    meleeHit: false,
    charge: false,
    speed: state === 'ready' ? 0 : rand(2.0, 2.8),
  }
  if (state === 'ready') {
    e.aiming = true
    e.mode = 'aim'
    e.ai.timer = rand(0.4, 2.4)
  }
  game.enemies.push(e)
  return e
}

function startWave(wave, silent = false) {
  game.wave = wave
  game.waveState = 'active'
  game.waveTime = 0
  game.charge = false
  game.chargeAt = Math.max(21, 40 - (wave - 1) * 7)
  game.enemyVolleyTimer = wave === 1 ? 1.7 : rand(2.5, 4.0)
  game.allyVolleyTimer = wave === 1 ? 2.3 : rand(2.8, 4.2)
  game.waveStart = game.time
  const count = [10, 13, 16][wave - 1]
  for (let i = 0; i < count; i++) makeEnemy(i, wave)
  if (wave > 1) {
    const aliveAllies = game.allies.filter(a => !a.dead && !a.ai?.crew).length
    const reinforcements = Math.max(0, Math.min(3, 8 - aliveAllies))
    if (reinforcements > 0) {
      for (let i = 0; i < reinforcements; i++) {
        const side = i % 2 === 0 ? -1 : 1
        const s = new Soldier({ scene, faction: 'british', team: 'allied', x: side * rand(3.2, 8.4), z: rand(1.4, 2.6), effects })
        s.name = ALLY_NAMES[(randInt(0, ALLY_NAMES.length - 1))] 
        s.ai = { reload: 1.5, reloadTime: 4.6, meleeCooldown: 0, crew: false }
        s.setFacing(0, true)
        game.allies.push(s)
      }
    }
  }
  if (!silent) {
    if (wave === 1) {
      setOrder('THE FRENCH ARE FORMING', 'HOLD THE LINE', 5.2)
      say('CAPT. HALE', 'Steady, 95th. Wait for the word. Make every shot count.', 5.2)
    } else if (wave === 2) {
      setOrder('SECOND COLUMN', 'THEY COME AGAIN', 4.8)
      say('CAPT. HALE', 'They are massing by the orchard. Load! Load!', 4.8)
    } else {
      setOrder('THE OLD GUARD', 'LAST STAND AT THE ORCHARD', 5.4)
      say('CAPT. HALE', 'No retreat now. We hold this ground or we die on it.', 5.4)
    }
  }
}

function nearestEnemyTo(pos, maxDist = 70) {
  let best = null
  let bestD = maxDist
  for (const e of game.enemies) {
    if (e.dead) continue
    const d = Math.hypot(e.root.position.x - pos.x, e.root.position.z - pos.z)
    if (d < bestD) { bestD = d; best = e }
  }
  return best
}

function nearestAlliedTo(pos) {
  let best = player
  let bestD = player.dead ? Infinity : Math.hypot(player.root.position.x - pos.x, player.root.position.z - pos.z)
  for (const a of game.allies) {
    if (a.dead) continue
    const d = Math.hypot(a.root.position.x - pos.x, a.root.position.z - pos.z)
    if (d < bestD) { bestD = d; best = a }
  }
  return best
}

function chooseEnemyTarget(enemy) {
  if (enemy.ai.target && !enemy.ai.target.dead) {
    const d = Math.hypot(enemy.ai.target.root.position.x - enemy.root.position.x, enemy.ai.target.root.position.z - enemy.root.position.z)
    if (d < 52) return enemy.ai.target
  }
  const candidate = nearestAlliedTo(enemy.root.position)
  if (!candidate || candidate.dead) return null
  if (player.dead) return candidate
  const dPlayer = Math.hypot(player.root.position.x - enemy.root.position.x, player.root.position.z - enemy.root.position.z)
  const dAlly = candidate === player ? dPlayer : Math.hypot(candidate.root.position.x - enemy.root.position.x, candidate.root.position.z - enemy.root.position.z)
  if (candidate !== player && dPlayer < dAlly + 4 && Math.random() < 0.42) return player
  return candidate
}

function chestPoint(soldier) {
  return soldier.refs.torso.localToWorld(new THREE.Vector3(0, 0.32, 0))
}

function enemyFire(enemy, target) {
  if (enemy.dead || !target || target.dead) return
  const muzzle = enemy.muzzleWorld()
  const aim = chestPoint(target)
  const dist = muzzle.distanceTo(aim)
  const dir = aim.clone().sub(muzzle).normalize()
  let chance = clamp(0.49 - dist * 0.0068, 0.13, 0.47)
  if (target === player) {
    if (player.crouched) chance *= 0.55
    if (player.speed > 0.2) chance *= 0.72
    if (player.aiming) chance *= 0.88
  } else {
    chance *= 0.72
  }
  const hit = Math.random() < chance
  const end = aim.clone()
  if (!hit) {
    end.x += rand(-1.2, 1.2)
    end.y += rand(-0.45, 0.85)
    end.z += rand(-1.2, 1.2)
  }
  const flashDir = dir.clone()
  effects.muzzle(muzzle.x, muzzle.y, muzzle.z, flashDir, 1.05)
  effects.tracer(muzzle, end, 0.18)
  const pan = audio.panFor(enemy.root.position, camera.position)
  audio.shot(dist, pan)
  enemy.fireAnimation()
  if (hit) {
    if (target === player) damagePlayer(rand(24, 37), dir, enemy.root.position)
    else {
      const killed = target.damage(100, dir, chestPoint(target), 'torso', 5)
      if (killed) {
        addKillFeed(enemy.name, target.name)
        if (Math.random() < 0.4) say('', 'Man down! Close the gap!', 2.2)
      }
    }
  } else {
    const groundY = terrainHeight(end.x, end.z)
    effects.impact(end.x, Math.max(groundY + 0.05, end.y), end.z, new THREE.Vector3(0, 1, 0), 'dirt', 0.7)
  }
}

function allyFire(ally, target) {
  if (ally.dead || !target || target.dead) return
  const muzzle = ally.muzzleWorld()
  const aim = chestPoint(target)
  const dist = muzzle.distanceTo(aim)
  const dir = aim.clone().sub(muzzle).normalize()
  const hit = Math.random() < clamp(0.42 - dist * 0.004, 0.18, 0.42)
  const end = aim.clone()
  if (!hit) {
    end.x += rand(-1.1, 1.1)
    end.y += rand(-0.6, 0.8)
    end.z += rand(-1.1, 1.1)
  }
  effects.muzzle(muzzle.x, muzzle.y, muzzle.z, dir, 1)
  effects.tracer(muzzle, end, 0.15)
  audio.shot(dist, audio.panFor(ally.root.position, camera.position))
  ally.fireAnimation()
  if (hit) {
    const killed = target.damage(72, dir, aim, 'torso', 5)
    if (killed) {
      addKillFeed(ally.name, target.name)
      game.kills += 0
    }
  } else {
    const groundY = terrainHeight(end.x, end.z)
    effects.impact(end.x, Math.max(groundY + 0.05, end.y), end.z, new THREE.Vector3(0, 1, 0), 'dirt', 0.6)
  }
}

function damagePlayer(amount, dir, fromPos = null) {
  if (player.dead || game.over) return
  player.health = Math.max(0, player.health - amount)
  player.lastDamageTime = game.time
  player.flinch = 1
  effects.shake = Math.min(1.2, effects.shake + 0.34)
  audio.hurt()
  damageFlash.classList.add('hit')
  setTimeout(() => damageFlash.classList.remove('hit'), 150)
  if (fromPos) {
    const away = new THREE.Vector3(player.root.position.x - fromPos.x, 0, player.root.position.z - fromPos.z)
    player.root.position.addScaledVector(away.normalize(), 0.12)
  }
  if (player.health <= 0) killPlayer(dir)
}

function killPlayer(dir) {
  if (player.dead) return
  game.over = true
  game.victory = false
  player.die(dir, 9, 'torso')
  player.aiming = false
  slowmo.classList.add('on')
  effects.shake = 1.1
  setTimeout(() => {
    if (!game.endShown) showEnd(false)
  }, 2400)
  if (document.pointerLockElement) document.exitPointerLock()
}

function showEnd(victory) {
  if (game.endShown) return
  game.endShown = true
  endScreen.classList.remove('hidden')
  endScreen.classList.toggle('victory', victory)
  $('#end-eyebrow').textContent = victory ? 'THE FRENCH ARE BROKEN' : 'THE LINE IS BROKEN'
  $('#end-title').textContent = victory ? 'THE ORCHARD HELD' : 'YOU FELL'
  $('#end-copy').textContent = victory
    ? 'The tricolour falls back beyond the ridge. The 95th still holds the orchard. For now, the road to Brussels is safe.'
    : 'The orchard is lost. The French colours rise over La Haye Sainte, and the line breaks around you.'
  $('#end-kills').textContent = String(game.kills)
  $('#end-headshots').textContent = String(game.headshots)
  $('#end-wave').textContent = ['I', 'II', 'III'][Math.min(2, game.wave - 1)]
  hud.classList.add('hidden')
  if (document.pointerLockElement) document.exitPointerLock()
}

function playerRay() {
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize()
  const spreadBase = player.aiming ? 0.0032 : 0.021
  const spread = spreadBase * (player.speed > 0.2 ? 1.8 : 1) * (player.crouched ? 0.72 : 1)
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
  const a = Math.random() * TAU
  const r = Math.sqrt(Math.random()) * spread
  dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize()
  return dir
}

function raySphere(origin, dir, sphere) {
  const oc = sphere.point.clone().sub(origin)
  const tca = oc.dot(dir)
  if (tca < 0) return null
  const d2 = oc.lengthSq() - tca * tca
  const r2 = sphere.radius * sphere.radius
  if (d2 > r2) return null
  const thc = Math.sqrt(r2 - d2)
  const t = tca - thc
  return t > 0.2 ? t : null
}

function groundRay(origin, dir) {
  let t = 0
  const step = 0.55
  while (t < 160) {
    t += step
    const x = origin.x + dir.x * t
    const y = origin.y + dir.y * t
    const z = origin.z + dir.z * t
    if (y < terrainHeight(x, z)) {
      let lo = Math.max(0, t - step)
      let hi = t
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2
        const my = origin.y + dir.y * mid
        if (my < terrainHeight(origin.x + dir.x * mid, origin.z + dir.z * mid)) hi = mid
        else lo = mid
      }
      return hi
    }
    if (t > 20 && y < -5) break
  }
  return null
}

function playerFire() {
  if (!game.started || game.paused || game.over || player.dead) return
  if (player.reloadTimer > 0) { audio.reloadClick(0.8); return }
  if (player.ammo <= 0) { startReload(); return }
  if (player.meleeTimer > 0) return
  if (!player.aiming) player.aimHold = 0.28
  const origin = camera.position.clone()
  const dir = playerRay()
  let nearest = null
  let nearestT = Infinity
  let hitPart = 'torso'
  for (const enemy of game.enemies) {
    if (enemy.dead) continue
    for (const sphere of enemy.hitSpheres()) {
      const t = raySphere(origin, dir, sphere)
      if (t !== null && t < nearestT) {
        nearestT = t
        nearest = enemy
        hitPart = sphere.part
      }
    }
  }
  const gt = groundRay(origin, dir)
  if (gt !== null && gt < nearestT) {
    nearest = null
    nearestT = gt
  }
  const end = origin.clone().addScaledVector(dir, Math.min(nearestT, 150))
  const muzzle = player.muzzleWorld()
  effects.muzzle(muzzle.x, muzzle.y, muzzle.z, dir, 1.25)
  audio.shot(0, 0)
  player.fireAnimation()
  player.recoilKick = Math.min(0.085, player.recoilKick + 0.034)
  effects.shake = Math.min(1, effects.shake + 0.1)
  player.ammo = 0
  if (nearest) {
    const dmg = hitPart === 'head' ? 160 : hitPart === 'legs' ? 58 : 100
    const killed = nearest.damage(dmg, dir, end, hitPart, hitPart === 'head' ? 8 : 5.5)
    effects.tracer(muzzle, end, 0.4)
    if (killed) {
      game.kills++
      if (hitPart === 'head') game.headshots++
      addKillFeed('You', nearest.name, hitPart === 'head')
      showHitmarker(true, hitPart === 'head' ? 'HEADSHOT' : 'KILL')
      audio.hitMarker()
    } else {
      showHitmarker(false, hitPart === 'head' ? 'HEADSHOT' : 'HIT')
      audio.hitMarker()
    }
  } else {
    effects.tracer(muzzle, end, 0.3)
    effects.impact(end.x, end.y, end.z, new THREE.Vector3(0, 1, 0), 'dirt', 0.8)
  }
}

function startReload() {
  if (player.reloadTimer > 0 || player.ammo >= player.maxAmmo || player.dead) return
  player.reloadTimer = player.reloadTime
  player.reloadProgress = 0
  player.aiming = false
  audio.reloadClick(1.1)
  setTimeout(() => audio.reloadClick(0.9), 600)
  setTimeout(() => audio.reloadClick(1.25), 1350)
  setTimeout(() => audio.reloadClick(0.8), 2150)
}

function performMelee() {
  if (!game.started || game.paused || game.over || player.dead || player.meleeCooldown > 0) return
  player.meleeCooldown = 0.9
  player.meleeTimer = 0.52
  player.meleeProgress = 0
  player.aiming = false
  audio.reloadClick(0.6)
  let best = null
  let bestD = 2.9
  const forward = new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing))
  for (const e of game.enemies) {
    if (e.dead) continue
    const to = new THREE.Vector3().subVectors(e.root.position, player.root.position)
    const d = to.length()
    const dot = to.clone().normalize().dot(forward)
    if (d < bestD && dot > 0.2) { bestD = d; best = e }
  }
  if (best) {
    setTimeout(() => {
      if (best.dead) return
      const hit = chestPoint(best)
      const dir = hit.clone().sub(player.root.position).normalize()
      const killed = best.damage(160, dir, hit, 'torso', 7)
      effects.blood(hit.x, hit.y, hit.z, dir, 1.2)
      if (killed) {
        game.kills++
        addKillFeed('You', best.name)
        showHitmarker(true, 'BAYONET')
      }
    }, 150)
  }
}

function updatePlayer(dt) {
  if (player.dead) { player.update(dt); return }
  const forward = new THREE.Vector3(-Math.sin(yawState.yaw), 0, -Math.cos(yawState.yaw))
  const right = new THREE.Vector3(Math.cos(yawState.yaw), 0, -Math.sin(yawState.yaw))
  const move = new THREE.Vector3()
  if (keys.KeyW) move.add(forward)
  if (keys.KeyS) move.sub(forward)
  if (keys.KeyD) move.add(right)
  if (keys.KeyA) move.sub(right)
  move.x += input.touchX
  move.z += input.touchY
  if (move.lengthSq() > 1) move.normalize()

  const sprinting = (keys.ShiftLeft || keys.ShiftRight) && !player.aiming && !player.crouched
  const targetSpeed = player.crouched ? 1.55 : player.aiming ? 1.7 : sprinting ? 5.2 : 3.05
  const moving = move.lengthSq() > 0.001
  player.speed = moving ? targetSpeed : 0
  if (moving) {
    const step = move.multiplyScalar(targetSpeed * dt)
    player.root.position.x += step.x
    player.root.position.z += step.z
    player.root.position.x = clamp(player.root.position.x, -46, 46)
    player.root.position.z = clamp(player.root.position.z, -48, 22)
    world.resolveCollisions(player.root.position, 0.34)
    player.root.position.y = terrainHeight(player.root.position.x, player.root.position.z)
    if (!player.aiming && player.reloadTimer <= 0) {
      player.setFacing(Math.atan2(move.x, move.z), false)
    }
  }

  if (player.aiming || player.aimHold > 0) {
    player.setFacing(yawState.yaw + Math.PI, false)
  }
  player.aimHold = Math.max(0, player.aimHold - dt)
  player.aiming = (input.aim || keys.RightMouse || input.touchAim) && player.reloadTimer <= 0
  player.crouched = input.crouch
  player.aimPitch = yawState.pitch + player.recoilKick
  player.recoilKick = damp(player.recoilKick, 0, 8, dt)

  if (player.reloadTimer > 0) {
    player.reloadTimer -= dt
    player.reloadProgress = 1 - clamp(player.reloadTimer / player.reloadTime, 0, 1)
    if (player.reloadTimer <= 0) {
      player.reloadTimer = 0
      player.reloadProgress = 1
      player.ammo = player.maxAmmo
      player.mode = 'idle'
      showHitmarker(false, 'LOADED')
    }
  }
  player.meleeTimer = Math.max(0, player.meleeTimer - dt)
  player.meleeCooldown = Math.max(0, player.meleeCooldown - dt)

  if (player.reloadTimer > 0) player.mode = 'reload'
  else if (player.meleeTimer > 0) player.mode = 'melee'
  else if (player.aiming) player.mode = 'aim'
  else if (player.speed > 0.15) player.mode = 'march'
  else player.mode = 'idle'

  player.update(dt)

  if (game.time - player.lastDamageTime > 7 && player.health < 100 && player.health > 0) {
    player.health = Math.min(100, player.health + dt * 5.2)
  }
}

function updateAllies(dt) {
  for (const ally of game.allies) {
    if (ally.dead) { ally.update(dt); continue }
    ally.ai.reload = Math.max(0, ally.ai.reload - dt)
    ally.ai.meleeCooldown = Math.max(0, ally.ai.meleeCooldown - dt)
    const target = nearestEnemyTo(ally.root.position)
    if (!target) {
      ally.aiming = false
      ally.speed = 0
      ally.mode = 'idle'
    } else if (ally.ai.crew) {
      ally.aiming = false
      ally.speed = 0
      ally.mode = 'idle'
    } else {
      const d = Math.hypot(target.root.position.x - ally.root.position.x, target.root.position.z - ally.root.position.z)
      if (d < 2.3 && ally.ai.meleeCooldown <= 0) {
        ally.ai.meleeCooldown = 1.8
        ally.meleeTimer = 0.6
        ally.meleeProgress = 0
        ally.aiming = false
        ally.mode = 'melee'
        setTimeout(() => {
          if (ally.dead || target.dead) return
          const hit = chestPoint(target)
          const dir = hit.clone().sub(ally.root.position).normalize()
          const killed = target.damage(100, dir, hit, 'torso', 5)
          if (killed) addKillFeed(ally.name, target.name)
        }, 180)
      } else if (ally.ai.reload > 0) {
        ally.aiming = false
        ally.speed = 0
        ally.mode = 'reload'
        ally.reloadProgress = 1 - ally.ai.reload / ally.ai.reloadTime
      } else {
        ally.aiming = true
        ally.speed = 0
        ally.mode = 'aim'
        ally.setAimAt(chestPoint(target))
      }
    }
    ally.meleeTimer = Math.max(0, ally.meleeTimer - dt)
    ally.update(dt)
  }
}

function updateEnemies(dt) {
  for (const enemy of game.enemies) {
    if (enemy.dead) { enemy.update(dt); continue }
    const ai = enemy.ai
    ai.timer -= dt
    ai.targetClock -= dt
    ai.meleeCooldown = Math.max(0, ai.meleeCooldown - dt)
    if (ai.targetClock <= 0) {
      ai.target = chooseEnemyTarget(enemy)
      ai.targetClock = rand(0.7, 1.4)
    }
    const target = ai.target
    if (!target || target.dead) {
      ai.target = chooseEnemyTarget(enemy)
    }
    const tgt = ai.target

    if (game.charge && ai.state !== 'melee') {
      ai.state = 'charge'
    }

    if (ai.state === 'advance') {
      const dx = ai.advancePos.x - enemy.root.position.x
      const dz = ai.advancePos.z - enemy.root.position.z
      const dist = Math.hypot(dx, dz)
      if (dist > 1.0) {
        const sep = new THREE.Vector3()
        for (const other of game.enemies) {
          if (other === enemy || other.dead) continue
          const ox = enemy.root.position.x - other.root.position.x
          const oz = enemy.root.position.z - other.root.position.z
          const od = Math.hypot(ox, oz)
          if (od < 1.7 && od > 0.001) sep.add(new THREE.Vector3(ox / od, 0, oz / od).multiplyScalar((1.7 - od) / 1.7))
        }
        const dir = new THREE.Vector3(dx, 0, dz).normalize().addScaledVector(sep, 0.75).normalize()
        const speed = ai.speed * (1 + (game.wave - 1) * 0.08)
        enemy.root.position.x += dir.x * speed * dt
        enemy.root.position.z += dir.z * speed * dt
        enemy.root.position.y = terrainHeight(enemy.root.position.x, enemy.root.position.z)
        enemy.speed = speed
        enemy.setFacing(Math.atan2(dir.x, dir.z), false)
        enemy.aiming = false
        enemy.mode = 'march'
      } else {
        ai.state = 'ready'
        ai.timer = rand(0.5, 2)
        enemy.speed = 0
      }
      enemy.update(dt)
      continue
    }

    if (ai.state === 'ready') {
      enemy.speed = 0
      enemy.aiming = true
      enemy.mode = 'aim'
      if (tgt) enemy.setAimAt(chestPoint(tgt))
      enemy.update(dt)
      continue
    }

    if (ai.state === 'firing') {
      enemy.aiming = true
      enemy.mode = 'aim'
      if (tgt) enemy.setAimAt(chestPoint(tgt))
      ai.fireIn -= dt
      if (ai.fireIn <= 0) {
        if (tgt && !tgt.dead) enemyFire(enemy, tgt)
        ai.state = 'reload'
        ai.reload = ai.reloadTime
        enemy.aiming = false
      }
      enemy.update(dt)
      continue
    }

    if (ai.state === 'reload') {
      enemy.speed = 0
      enemy.aiming = false
      enemy.mode = 'reload'
      ai.reload -= dt
      enemy.reloadProgress = 1 - clamp(ai.reload / ai.reloadTime, 0, 1)
      if (ai.reload <= 0) {
        ai.state = 'ready'
        ai.timer = rand(0.5, 2.5)
      }
      enemy.update(dt)
      continue
    }

    if (ai.state === 'charge') {
      if (!tgt || tgt.dead) {
        ai.state = 'ready'
        enemy.update(dt)
        continue
      }
      const dx = tgt.root.position.x - enemy.root.position.x
      const dz = tgt.root.position.z - enemy.root.position.z
      const dist = Math.hypot(dx, dz)
      if (dist > 1.85) {
        const sep = new THREE.Vector3()
        for (const other of game.enemies) {
          if (other === enemy || other.dead) continue
          const ox = enemy.root.position.x - other.root.position.x
          const oz = enemy.root.position.z - other.root.position.z
          const od = Math.hypot(ox, oz)
          if (od < 1.4 && od > 0.001) sep.add(new THREE.Vector3(ox / od, 0, oz / od))
        }
        const dir = new THREE.Vector3(dx, 0, dz).normalize().addScaledVector(sep, 0.5).normalize()
        const speed = 4.15
        enemy.root.position.x += dir.x * speed * dt
        enemy.root.position.z += dir.z * speed * dt
        enemy.root.position.y = terrainHeight(enemy.root.position.x, enemy.root.position.z)
        enemy.speed = speed
        enemy.setFacing(Math.atan2(dir.x, dir.z), false)
        enemy.aiming = false
        enemy.mode = 'march'
      } else {
        enemy.speed = 0
        if (ai.meleeCooldown <= 0) {
          ai.meleeCooldown = 1.35
          enemy.mode = 'melee'
          enemy.meleeProgress = 0
          const dir = new THREE.Vector3(tgt.root.position.x - enemy.root.position.x, 0, tgt.root.position.z - enemy.root.position.z).normalize()
          if (tgt === player) damagePlayer(rand(38, 54), dir, enemy.root.position)
          else {
            const killed = tgt.damage(100, dir, chestPoint(tgt), 'torso', 5)
            if (killed) addKillFeed(enemy.name, tgt.name)
          }
        }
      }
      enemy.update(dt)
    }
  }
}

function enemyVolley() {
  const ready = game.enemies.filter(e => !e.dead && e.ai && (e.ai.state === 'ready' || e.ai.state === 'advance'))
  let n = 0
  for (const e of ready) {
    if (!e.ai.target || e.ai.target.dead) e.ai.target = chooseEnemyTarget(e)
    if (!e.ai.target) continue
    e.ai.state = 'firing'
    e.ai.fireIn = n * 0.07 + rand(0, 0.12)
    n++
  }
  if (n > 0) {
    const d = Math.hypot(player.root.position.x, player.root.position.z)
    audio.distantVolley()
    if (Math.random() < 0.45) say('', 'Here it comes! Steady now!', 2.0)
  }
}

function allyVolley() {
  let n = 0
  for (const ally of game.allies) {
    if (ally.dead || ally.ai?.crew || ally.ai.reload > 0) continue
    const target = nearestEnemyTo(ally.root.position, 52)
    if (!target) continue
    allyFire(ally, target)
    ally.ai.reload = ally.ai.reloadTime + rand(0, 0.6)
    ally.ai.reloadTime = rand(4.1, 5.6)
    n++
  }
  return n
}

function updateGame(dt) {
  game.time += dt
  game.waveTime += dt
  game.messageCooldown = Math.max(0, game.messageCooldown - dt)

  if (game.over) {
    if (game.endShown) return
    // Keep the battlefield breathing while the camera lingers on the fallen.
    for (const s of game.allies) s.update(dt * 0.25)
    for (const s of game.enemies) s.update(dt * 0.25)
    return
  }

  if (!game.started) return

  game.enemyVolleyTimer -= dt
  game.allyVolleyTimer -= dt
  if (game.enemyVolleyTimer <= 0 && game.enemies.some(e => !e.dead)) {
    enemyVolley()
    game.enemyVolleyTimer = rand(7.2, 10.2) - (game.wave - 1) * 0.5
  }
  if (game.allyVolleyTimer <= 0 && game.enemies.some(e => !e.dead)) {
    allyVolley()
    game.allyVolleyTimer = rand(6.2, 8.4)
  }

  if (!game.charge && game.waveTime > game.chargeAt) {
    game.charge = true
    setOrder('FIX BAYONETS', 'THEY ARE CHARGING', 4.2)
    say('CAPT. HALE', 'Bayonets! Hold fast! Do not give them the wall!', 4.2)
    for (const e of game.enemies) {
      if (!e.dead && e.ai && e.ai.state !== 'melee') e.ai.state = 'charge'
    }
  }

  if (game.waveState === 'active') {
    const alive = game.enemies.filter(e => !e.dead)
    if (alive.length === 0) {
      game.waveState = 'intermission'
      game.interTimer = game.wave >= 3 ? 3.5 : 5.2
      if (game.wave >= 3) {
        setOrder('THE FRENCH FALL BACK', 'THE ORCHARD IS HELD', 4.8)
        say('CAPT. HALE', 'They are breaking! By God, we held them. Hold the line!', 5.2)
        game.victory = true
        setTimeout(() => { if (!game.endShown) { game.over = true; showEnd(true) } }, 4800)
      } else {
        setOrder('THE FRENCH FALL BACK', 'HOLD THE ORCHARD', 4.5)
        say('CAPT. HALE', 'They are falling back! Reload, dress the line, they will come again.', 5.0)
      }
    }
  } else if (game.waveState === 'intermission') {
    game.interTimer -= dt
    if (game.interTimer <= 0 && !game.victory) {
      startWave(game.wave + 1)
    }
  }

  game.alliedCannonTimer -= dt
  game.enemyCannonTimer -= dt
  if (game.alliedCannonTimer <= 0) {
    fireAlliedCannon()
    game.alliedCannonTimer = rand(10, 15)
  }
  if (game.enemyCannonTimer <= 0) {
    fireEnemyCannon()
    game.enemyCannonTimer = rand(15, 23)
  }

  updatePlayer(dt)
  updateAllies(dt)
  updateEnemies(dt)
  updateCannonballs(dt)
}

function fireAlliedCannon() {
  if (game.over) return
  const cannon = world.cannons[0]
  const muzzle = world.cannonMuzzle(cannon)
  const alive = game.enemies.filter(e => !e.dead)
  if (!alive.length) return
  const targetEnemy = pick(alive)
  const end = new THREE.Vector3(targetEnemy.root.position.x + rand(-2, 2), terrainHeight(targetEnemy.root.position.x, targetEnemy.root.position.z) + 0.25, targetEnemy.root.position.z + rand(-2, 2))
  spawnCannonball(muzzle, end, 'allied')
  world.fireCannon(cannon)
  effects.muzzle(muzzle.x, muzzle.y, muzzle.z, end.clone().sub(muzzle).normalize(), 3.1)
  for (let i = 0; i < 18; i++) effects.battleSmoke(muzzle.x + rand(-0.7, 0.7), muzzle.y + rand(0, 1.1), muzzle.z + rand(-0.7, 0.7))
  for (let i = 0; i < 8; i++) effects.soft.spawn({
    x: muzzle.x + rand(-1.1, 1.1), y: muzzle.y + rand(-0.3, 0.2), z: muzzle.z + rand(-1.1, 1.1),
    vx: rand(-0.5, 0.9), vy: rand(0.1, 0.4), vz: rand(-0.9, 0.3),
    life: rand(3.5, 7), size0: rand(0.6, 1.2), size1: rand(2.4, 4.6),
    alpha: 0.2, r: 0.62, g: 0.6, b: 0.56, drag: 0.7, rise: 0.12, wind: 0.16,
  })
  audio.cannon(muzzle.distanceTo(camera.position), audio.panFor(cannon.group.position, camera.position))
  effects.shake = Math.min(1.2, effects.shake + 0.2)
}

function fireEnemyCannon() {
  if (game.over) return
  const cannon = world.cannons[1]
  const muzzle = world.cannonMuzzle(cannon)
  const base = player.dead ? new THREE.Vector3(0, 0, 2) : player.root.position
  const end = new THREE.Vector3(base.x + rand(-5, 5), 0, base.z + rand(-4, 4))
  end.y = terrainHeight(end.x, end.z) + 0.2
  spawnCannonball(muzzle, end, 'enemy')
  world.fireCannon(cannon)
  effects.muzzle(muzzle.x, muzzle.y, muzzle.z, end.clone().sub(muzzle).normalize(), 3.0)
  for (let i = 0; i < 10; i++) effects.battleSmoke(muzzle.x + rand(-0.6, 0.6), muzzle.y + rand(0, 0.9), muzzle.z + rand(-0.6, 0.6))
  audio.cannon(muzzle.distanceTo(camera.position), audio.panFor(cannon.group.position, camera.position))
}

const cannonballGeo = new THREE.SphereGeometry(0.13, 8, 6)
const cannonballMat = new THREE.MeshStandardMaterial({ color: 0x17181a, metalness: 0.7, roughness: 0.5 })
function spawnCannonball(start, end, team) {
  const mesh = new THREE.Mesh(cannonballGeo, cannonballMat)
  mesh.position.copy(start)
  mesh.castShadow = true
  scene.add(mesh)
  const dist = start.distanceTo(end)
  game.cannonballs.push({
    mesh, start: start.clone(), end: end.clone(), team, t: 0,
    duration: clamp(dist / 46, 0.65, 1.8), arc: 4 + dist * 0.1, trail: 0,
  })
}

function updateCannonballs(dt) {
  for (let i = game.cannonballs.length - 1; i >= 0; i--) {
    const b = game.cannonballs[i]
    b.t += dt / b.duration
    const t = clamp(b.t, 0, 1)
    b.mesh.position.lerpVectors(b.start, b.end, t)
    b.mesh.position.y += Math.sin(t * Math.PI) * b.arc
    b.trail -= dt
    if (b.trail <= 0) {
      b.trail = 0.045
      effects.soft.spawn({
        x: b.mesh.position.x + rand(-0.08, 0.08), y: b.mesh.position.y, z: b.mesh.position.z + rand(-0.08, 0.08),
        vx: rand(-0.1, 0.1), vy: rand(0.05, 0.2), vz: rand(-0.1, 0.1),
        life: rand(0.4, 0.9), size0: rand(0.06, 0.12), size1: rand(0.4, 0.7),
        alpha: 0.22, r: 0.58, g: 0.57, b: 0.55, drag: 0.7, rise: 0.1, wind: 0.05,
      })
    }
    if (t >= 1) {
      explodeCannonball(b)
      scene.remove(b.mesh)
      game.cannonballs.splice(i, 1)
    }
  }
}

function explodeCannonball(b) {
  const p = b.end
  effects.explosion(p.x, p.y, p.z, b.team === 'allied' ? 1.2 : 0.95)
  const distToPlayer = player.dead ? 999 : player.root.position.distanceTo(p)
  if (b.team === 'enemy' && distToPlayer < 6) {
    damagePlayer(rand(18, 42) * (1 - distToPlayer / 8), new THREE.Vector3(0, 0, 0), p)
  }
  if (b.team === 'allied') {
    for (const e of game.enemies) {
      if (e.dead) continue
      const d = e.root.position.distanceTo(p)
      if (d < 3.9) {
        const dir = new THREE.Vector3(e.root.position.x - p.x, 0.5, e.root.position.z - p.z).normalize()
        const killed = e.damage(160, dir, chestPoint(e), 'torso', 10)
        if (killed) addKillFeed('9-pounder', e.name)
      }
    }
  } else {
    for (const a of game.allies) {
      if (a.dead) continue
      const d = a.root.position.distanceTo(p)
      if (d < 4.2) {
        const dir = new THREE.Vector3(a.root.position.x - p.x, 0.5, a.root.position.z - p.z).normalize()
        a.damage(160, dir, chestPoint(a), 'torso', 8)
      }
    }
  }
  audio.cannon(p.distanceTo(camera.position), audio.panFor(p, camera.position))
}

const keys = {}
const input = {
  aim: false,
  crouch: false,
  touchAim: false,
  touchX: 0,
  touchY: 0,
}

function setupInput() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return
    keys[e.code] = true
    if (e.code === 'KeyR') startReload()
    if (e.code === 'KeyC') input.crouch = !input.crouch
    if (e.code === 'KeyF') performMelee()
    if (e.code === 'KeyM') {
      const muted = audio.toggleMute()
      const el = $('#mute-indicator')
      el.textContent = muted ? 'SOUND OFF' : 'SOUND ON'
      el.classList.add('show')
      setTimeout(() => el.classList.remove('show'), 1200)
    }
    if (e.code === 'Escape' && game.started && !game.over && !document.pointerLockElement) {
      setPaused(!game.paused)
    }
  })
  window.addEventListener('keyup', (e) => { keys[e.code] = false })

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (!game.started || game.paused || game.over) return
    if (!document.pointerLockElement && !isTouch) {
      renderer.domElement.requestPointerLock?.()
      return
    }
    if (e.button === 0) playerFire()
    if (e.button === 2) input.aim = true
  })
  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) input.aim = false
  })
  window.addEventListener('contextmenu', (e) => e.preventDefault())
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== renderer.domElement) return
    yawState.yaw -= e.movementX * 0.00185
    yawState.pitch = clamp(yawState.pitch - e.movementY * 0.0017, -0.72, 0.82)
  })
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === renderer.domElement) {
      game.hasLocked = true
      if (game.paused) setPaused(false)
    } else if (game.hasLocked && game.started && !game.over && !isTouch) {
      setPaused(true)
    }
  })
  window.addEventListener('resize', onResize)
}

function setupTouch() {
  if (!isTouch) return
  touchUI.classList.remove('hidden')
  const joy = $('#joystick')
  const knob = $('#joystick-knob')
  let joyId = null
  const joyCenter = { x: 0, y: 0 }
  joy.addEventListener('pointerdown', (e) => {
    joyId = e.pointerId
    const rect = joy.getBoundingClientRect()
    joyCenter.x = rect.left + rect.width / 2
    joyCenter.y = rect.top + rect.height / 2
    joy.setPointerCapture(e.pointerId)
  })
  joy.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyId) return
    let dx = e.clientX - joyCenter.x
    let dy = e.clientY - joyCenter.y
    const max = 45
    const d = Math.hypot(dx, dy)
    if (d > max) { dx = dx / d * max; dy = dy / d * max }
    knob.style.transform = `translate(${dx}px, ${dy}px)`
    input.touchX = dx / max
    input.touchY = dy / max
  })
  const endJoy = (e) => {
    if (e.pointerId !== joyId) return
    joyId = null
    knob.style.transform = ''
    input.touchX = input.touchY = 0
  }
  joy.addEventListener('pointerup', endJoy)
  joy.addEventListener('pointercancel', endJoy)

  const look = $('#look-zone')
  let lookId = null
  let lastX = 0, lastY = 0
  look.addEventListener('pointerdown', (e) => {
    lookId = e.pointerId
    lastX = e.clientX
    lastY = e.clientY
    look.setPointerCapture(e.pointerId)
  })
  look.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    yawState.yaw -= dx * 0.005
    yawState.pitch = clamp(yawState.pitch - dy * 0.0045, -0.72, 0.82)
  })
  const endLook = (e) => { if (e.pointerId === lookId) lookId = null }
  look.addEventListener('pointerup', endLook)
  look.addEventListener('pointercancel', endLook)

  $('#touch-fire').addEventListener('pointerdown', (e) => { e.preventDefault(); playerFire() })
  $('#touch-reload').addEventListener('pointerdown', (e) => { e.preventDefault(); startReload() })
  $('#touch-aim').addEventListener('pointerdown', (e) => {
    e.preventDefault()
    input.touchAim = !input.touchAim
    $('#touch-aim').classList.toggle('active', input.touchAim)
  })
  $('#touch-crouch').addEventListener('pointerdown', (e) => {
    e.preventDefault()
    input.crouch = !input.crouch
    $('#touch-crouch').classList.toggle('active', input.crouch)
  })
}

function onResize() {
  const w = window.innerWidth
  const h = window.innerHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  composer.setSize(w, h)
  grade.uniforms.uResolution.value.set(w, h)
  bloom.setSize(w, h)
  smaa.setSize(w, h)
}

function setPaused(paused) {
  if (game.over) return
  game.paused = paused
  pauseScreen.classList.toggle('hidden', !paused)
  if (!paused) {
    audio.start()
    if (!isTouch) renderer.domElement.requestPointerLock?.()
  } else if (document.pointerLockElement) {
    document.exitPointerLock()
  }
}

function updateCamera(dt) {
  const aimTarget = player.aiming ? 1 : 0
  cameraState.aimBlend = damp(cameraState.aimBlend, aimTarget, 7, dt)
  const aim = cameraState.aimBlend
  const shake = effects.shake
  const shakeX = (Math.random() - 0.5) * shake * 0.24
  const shakeY = (Math.random() - 0.5) * shake * 0.2

  if (!game.started) {
    const t = game.time
    const radius = 25
    camera.position.set(Math.sin(t * 0.055 + 1.2) * radius, 7.2 + Math.sin(t * 0.16) * 0.45, 11 + Math.cos(t * 0.055 + 1.2) * radius)
    camera.lookAt(0, 1.4, -15)
    camera.fov = damp(camera.fov, 56, 2, dt)
    camera.updateProjectionMatrix()
    return
  }

  if (player.dead) {
    cameraState.deathAngle += dt * 0.22
    const body = player.root.position
    const r = 5.6
    const target = new THREE.Vector3(
      body.x + Math.sin(cameraState.deathAngle) * r,
      body.y + 2.4 + Math.sin(cameraState.deathAngle * 0.7) * 0.4,
      body.z + Math.cos(cameraState.deathAngle) * r
    )
    camera.position.lerp(target, 1 - Math.exp(-1.7 * dt))
    camera.lookAt(body.x, body.y + 0.7, body.z)
    camera.fov = damp(camera.fov, 57, 3, dt)
    camera.updateProjectionMatrix()
    return
  }

  const forward = new THREE.Vector3(-Math.sin(yawState.yaw), 0, -Math.cos(yawState.yaw))
  const right = new THREE.Vector3(Math.cos(yawState.yaw), 0, -Math.sin(yawState.yaw))
  const crouchOffset = player.crouched ? -0.42 : 0
  const aspectScale = clamp(camera.aspect / 1.55, 0.55, 1)
  const back = lerp(4.85, 2.85, aim) * (camera.aspect < 1 ? 1.12 : 1)
  const up = lerp(2.5, 2.02, aim) + crouchOffset
  const shoulder = lerp(1.38, 0.82, aim) * aspectScale
  const desired = new THREE.Vector3().copy(player.root.position)
  desired.addScaledVector(right, shoulder)
  desired.addScaledVector(forward, -back)
  desired.y += up
  desired.x += shakeX
  desired.y += shakeY
  const ground = terrainHeight(desired.x, desired.z)
  if (desired.y < ground + 0.5) desired.y = ground + 0.5
  camera.position.lerp(desired, 1 - Math.exp(-13 * dt))

  const pitch = yawState.pitch + player.recoilKick * 0.4
  const dir = new THREE.Vector3(
    -Math.sin(yawState.yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yawState.yaw) * Math.cos(pitch)
  )
  const look = camera.position.clone().addScaledVector(dir, 35)
  camera.lookAt(look)
  camera.rotation.z += (Math.random() - 0.5) * shake * 0.014
  camera.fov = damp(camera.fov, lerp(64, 49, aim), 8, dt)
  camera.updateProjectionMatrix()
}

function updateHUD(dt) {
  const health = Math.max(0, player.health)
  $('#health-fill').style.width = `${health}%`
  $('#health-delay').style.width = `${health}%`
  $('#health-num').textContent = String(Math.ceil(health))
  $('#ammo-count').textContent = player.reloadTimer > 0 ? '—' : String(player.ammo)
  $('#reload-fill').style.width = `${player.reloadTimer > 0 ? player.reloadProgress * 100 : player.ammo > 0 ? 100 : 0}%`
  const stateText = player.reloadTimer > 0 ? 'RAMMING CHARGE' : player.ammo > 0 ? 'MUZZLE LOADED' : 'PRESS R TO RELOAD'
  $('#ammo-state').textContent = stateText
  $('#men-count').textContent = String(game.allies.filter(a => !a.dead).length + (player.dead ? 0 : 1))
  $('#enemy-count').textContent = String(game.enemies.filter(e => !e.dead).length)
  $('#wave-label').textContent = `WAVE ${['I', 'II', 'III'][Math.min(2, game.wave - 1)]} OF III`

  const stance = player.crouched ? 'CROUCHED · LOW PROFILE' : player.aiming ? 'AIMING · STEADY' : player.speed > 3.4 ? 'RUNNING' : player.speed > 0.1 ? 'MARCHING' : 'STANDING · IN THE OPEN'
  $('#stance').textContent = stance

  const spread = player.aiming ? (player.speed > 0.2 ? 10 : 4.5) : 12
  $('#crosshair').style.setProperty('--spread', `${spread}px`)
  $('#crosshair').classList.toggle('aim', player.aiming)

  if (game.hitMarkerTimer > 0) {
    game.hitMarkerTimer -= dt
    if (game.hitMarkerTimer <= 0) $('#hitmarker').classList.remove('show')
  }
  if (game.hitTextTimer > 0) {
    game.hitTextTimer -= dt
    if (game.hitTextTimer <= 0) $('#hit-text').classList.remove('show')
  }
  if (game.subtitleTimer > 0) {
    game.subtitleTimer -= dt
    if (game.subtitleTimer <= 0) $('#subtitle').classList.remove('show')
  }
  if (game.orderTimer > 0) {
    game.orderTimer -= dt
    if (game.orderTimer <= 0) $('#order-banner').classList.remove('show')
  }
  if (game.started && game.controlsFade < 14) {
    game.controlsFade += dt
    if (game.controlsFade > 9) $('#controls-hint').classList.add('fade')
  }
  const needle = $('#compass-needle')
  const objective = $('#compass-objective')
  const angle = ((yawState.yaw % TAU) + TAU) % TAU
  const pos = 50 + Math.sin(angle) * 26
  needle.style.left = `${pos}%`
  objective.style.left = `${pos}%`
}

function startGame() {
  if (game.started) return
  game.started = true
  game.startAt = game.time
  audio.start()
  startScreen.classList.add('hidden')
  hud.classList.remove('hidden')
  if (isTouch) touchUI.classList.remove('hidden')
  game.wave = 1
  game.waveState = 'active'
  game.waveTime = 0
  game.enemyVolleyTimer = 0.95
  game.allyVolleyTimer = 1.55
  game.alliedCannonTimer = 0.4
  game.enemyCannonTimer = 12
  setOrder('THE FRENCH ARE FORMING', 'HOLD THE LINE', 5.2)
  say('CAPT. HALE', 'Steady, 95th. Wait for the word. Make every shot count.', 5.2)
  if (!isTouch) {
    const req = renderer.domElement.requestPointerLock?.()
    if (req && req.catch) req.catch(() => {})
  }
}

function setupUI() {
  $('#start-button').addEventListener('click', startGame)
  $('#resume-button').addEventListener('click', () => setPaused(false))
  $('#restart-button').addEventListener('click', () => location.reload())
  $('#again-button').addEventListener('click', () => location.reload())
  $('#pause-screen').addEventListener('click', (e) => {
    if (e.target.id === 'pause-screen') setPaused(false)
  })
}

function animate() {
  const raw = clock.getDelta()
  const dt = Math.min(raw, 0.05)
  game.time += game.started && !game.paused && !game.over ? 0 : dt * 0.35
  const worldTime = game.time

  if (game.started && !game.paused) {
    updateGame(dt)
  } else if (!game.started) {
    // Let the pre-battle tableau breathe.
    for (const s of game.allies) s.update(dt * 0.45)
    for (const s of game.enemies) s.update(dt * 0.45)
    player.update(dt * 0.45)
  }

  world.update(dt, worldTime)
  effects.update(dt)
  updateCamera(dt)
  if (game.started) updateHUD(dt)
  grade.uniforms.uTime.value = worldTime
  grade.uniforms.uDamage.value = damp(grade.uniforms.uDamage.value, player.health < 45 ? 1 : 0, 3, dt)
  composer.render()
  requestAnimationFrame(animate)
}

spawnAllies(8)
startWave(1, true)
player.root.position.set(0, terrainHeight(0, 6.5), 6.5)
player.setFacing(Math.PI, true)
for (const e of game.enemies) {
  if (e.ai.state === 'ready') {
    const tgt = chooseEnemyTarget(e)
    if (tgt) { e.ai.target = tgt; e.setAimAt(chestPoint(tgt)); }
  }
}
setupUI()
setupInput()
setupTouch()
effects.seedBattlefield()
window.addEventListener('load', () => {
  setTimeout(() => loadingScreen.classList.add('done'), 420)
})
setTimeout(() => loadingScreen.classList.add('done'), 2200)
animate()

// A small read-only handle is useful for browser smoke tests and for players
// who want to inspect the simulation from the console.
window.__fieldsOfHonour = {
  game, player, world, effects, camera, scene, renderer,
  // Development hooks for smoke tests; not surfaced in the UI.
  damagePlayer, killPlayer, showEnd,
}

// The first frame can take a moment on software renderers; the loading veil
// is deliberately independent of the simulation clock.
