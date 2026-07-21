/* ============================================================
 * game.js — 主循环 / 状态机 / 相机 / 碰撞 / 虫洞 / 停靠升级 / HUD
 * ============================================================ */

const UPGRADES = [
  { key: 'engine', name: '引擎',     desc: '提升最高速度与推力',     cost: { mineral: 15, energy: 8 } },
  { key: 'hull',   name: '船体装甲', desc: '提升最大生命值',         cost: { mineral: 18, rare: 4 } },
  { key: 'weapon', name: '武器系统', desc: '提升伤害与射速',         cost: { energy: 18, rare: 6 } },
  { key: 'cargo',  name: '货舱扩容', desc: '提升资源携带上限',       cost: { mineral: 22, energy: 12 } },
  { key: 'fuel',   name: '燃料舱',   desc: '提升最大燃料储备',       cost: { mineral: 12, energy: 14 } },
];

const Game = {
  canvas: null, ctx: null,
  player: null,
  asteroids: [], enemies: [], bullets: [], pickups: [], wormholes: [], particles: [],
  stars: [], nebula: [], station: null,
  systemName: '', systemRace: null, systemIndex: 0, systemSeed: 12345,
  cam: { x: 0, y: 0 }, shakeT: 0, shakeMag: 0, flashColor: null, flashT: 0,
  state: 'start',                // start | playing | docked | dead
  jumpCD: 0, spawnTimer: 0,
  messages: [], kills: 0,
  warehouse: { mineral: 0, energy: 0, rare: 0 },   // 空间站仓库（无限容量，跨星系保留）
  audio: null, muted: false,
  last: 0,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    Input.init();
    Sprites.build(RACES);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.setupTouch();
    this.bindUI();
    document.getElementById('startBtn').onclick = () => { this.initAudio(); this.startGame(); };
    requestAnimationFrame((t) => this.loop(t));
  },

  // 根据屏幕分辨率自适应画布（支持手机竖屏/横屏）
  resize() {
    const stage = document.getElementById('stage');
    const cw = Math.max(320, stage.clientWidth || window.innerWidth);
    const ch = Math.max(240, stage.clientHeight || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(ch * dpr);
    this.canvas.style.width = cw + 'px';
    this.canvas.style.height = ch + 'px';
    this.dpr = dpr;
    CONFIG.WIDTH = cw; CONFIG.HEIGHT = ch;
  },

  bindUI() {
    document.getElementById('restartBtn').onclick = () => this.startGame();
    document.getElementById('closeDockBtn').onclick = () => this.closeDock();
    document.getElementById('muteBtn').onclick = () => { this.muted = !this.muted; document.getElementById('muteBtn').textContent = this.muted ? '🔇' : '🔊'; };
    document.getElementById('discardBtn').onclick = () => this.toggleDiscard();
    document.getElementById('closeDiscardBtn').onclick = () => this.closeDiscard();
    document.getElementById('discardAllBtn').onclick = () => this.dumpAll();
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'escape') { if (document.getElementById('discardPanel').style.display === 'block') this.closeDiscard(); else if (this.state === 'docked') this.closeDock(); return; }
      if (k === 'e' && this.state === 'docked') this.closeDock();
      if (k === 'x' && this.state === 'playing') { this.toggleDiscard(); return; }
      if (k === 'm') { this.muted = !this.muted; document.getElementById('muteBtn').textContent = this.muted ? '🔇' : '🔊'; }
      if (k === 'q' && this.player) this.player.switchWeapon();
      else if (k === '1' && this.player) this.player.selectWeapon(0);
      else if (k === '2' && this.player) this.player.selectWeapon(1);
    });
  },

  // 虚拟摇杆 + 开火（手机端自动启用）
  setupTouch() {
    const show = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.innerWidth < 820;
    if (show) document.body.classList.add('touchui');
    const stage = document.getElementById('stage');
    const joyBase = document.getElementById('joyBase');
    const joyKnob = document.getElementById('joyKnob');
    const BASE_R = 58, KNOB_R = 26, MAX_OFF = BASE_R - KNOB_R;
    this.joy = { id: null, cx: 0, cy: 0, dx: 0, dy: 0, rl: 0, rt: 0 };

    // 每帧根据摇杆方向重算转向/推进，避免手指静止后持续过转
    this.applyJoy = () => {
      const j = this.joy;
      if (j.id === null) return;
      const mag = Math.hypot(j.dx, j.dy);
      Input.keys['w'] = mag > MAX_OFF * 0.5;
      if (mag < 6) { Input.keys['a'] = false; Input.keys['d'] = false; return; }
      const target = Math.atan2(j.dx, -j.dy);
      const pl = this.player; if (!pl) return;
      let diff = target - pl.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const dead = 0.10;
      if (diff > dead) { Input.keys['d'] = true; Input.keys['a'] = false; }
      else if (diff < -dead) { Input.keys['a'] = true; Input.keys['d'] = false; }
      else { Input.keys['a'] = false; Input.keys['d'] = false; }
    };

    const joyEnd = () => {
      this.joy.id = null;
      joyBase.style.display = 'none';
      Input.keys['w'] = false; Input.keys['a'] = false; Input.keys['d'] = false;
    };
    const joyStart = (x, y, id) => {
      const rect = stage.getBoundingClientRect();
      this.joy.rl = rect.left; this.joy.rt = rect.top;
      this.joy.cx = x - rect.left; this.joy.cy = y - rect.top;
      this.joy.dx = 0; this.joy.dy = 0; this.joy.id = id;
      joyBase.style.display = 'block';
      joyBase.style.left = (this.joy.cx - BASE_R) + 'px';
      joyBase.style.top = (this.joy.cy - BASE_R) + 'px';
      joyKnob.style.transform = 'translate(0px,0px)';
      try { stage.setPointerCapture(id); } catch (e) {}
      this.applyJoy();
    };
    const joyMove = (x, y) => {
      if (this.state !== 'playing') { joyEnd(); return; }
      this.joy.dx = x - this.joy.rl - this.joy.cx;
      this.joy.dy = y - this.joy.rt - this.joy.cy;
      const mag = Math.hypot(this.joy.dx, this.joy.dy);
      const off = Math.min(mag, MAX_OFF);
      const nx = mag > 0 ? this.joy.dx / mag : 0, ny = mag > 0 ? this.joy.dy / mag : 0;
      joyKnob.style.transform = 'translate(' + (nx * off) + 'px,' + (ny * off) + 'px)';
      this.applyJoy();
    };

    stage.addEventListener('pointerdown', (e) => {
      if (this.state !== 'playing') return;
      if (e.target.id === 'btnFire' || e.target.id === 'btnDock' || e.target.id === 'btnWeapon' || e.target.id === 'discardBtn') return;
      if (e.target.closest && e.target.closest('#discardPanel')) return;
      const rect = stage.getBoundingClientRect();
      if (e.clientX - rect.left < rect.width / 2) {
        e.preventDefault();
        joyStart(e.clientX, e.clientY, e.pointerId);
      }
    });
    stage.addEventListener('pointermove', (e) => {
      if (this.joy.id === e.pointerId) { e.preventDefault(); joyMove(e.clientX, e.clientY); }
    });
    const onUp = (e) => { if (this.joy.id === e.pointerId) joyEnd(); };
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('pointerleave', onUp);

    // 右侧开火：按住持续射击
    const fire = document.getElementById('btnFire');
    const fd = (e) => { e.preventDefault(); Input.keys[' '] = true; };
    const fu = (e) => { e.preventDefault(); Input.keys[' '] = false; };
    fire.addEventListener('pointerdown', fd); fire.addEventListener('pointerup', fu);
    fire.addEventListener('pointercancel', fu); fire.addEventListener('pointerleave', fu);

    // 切换武器
    const wbtn = document.getElementById('btnWeapon');
    if (wbtn) {
      wbtn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (Game.player) Game.player.switchWeapon(); });
    }

    // 停靠：靠近空间站时显示，点按停靠
    const dock = document.getElementById('btnDock');
    if (dock) {
      const dd = (e) => { e.preventDefault(); Input.keys['e'] = true; Input.pressed['e'] = true; };
      const du = (e) => { e.preventDefault(); Input.keys['e'] = false; };
      dock.addEventListener('pointerdown', dd);
      dock.addEventListener('pointerup', du);
      dock.addEventListener('pointercancel', du);
      dock.addEventListener('pointerleave', du);
    }
  },

  initAudio() {
    try { this.audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.audio = null; }
  },
  beep(freq, dur, type, vol) {
    if (!this.audio || this.muted) return;
    try {
      const o = this.audio.createOscillator(), g = this.audio.createGain();
      o.type = type || 'square'; o.frequency.value = freq; g.gain.value = vol || 0.04;
      o.connect(g); g.connect(this.audio.destination); o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, this.audio.currentTime + dur);
      o.stop(this.audio.currentTime + dur);
    } catch (e) { }
  },
  sfx(t) {
    if (t === 'shoot') this.beep(880, 0.06, 'square', 0.025);
    else if (t === 'enemy') this.beep(300, 0.07, 'sawtooth', 0.015);
    else if (t === 'explode') this.beep(120, 0.2, 'triangle', 0.05);
    else if (t === 'pickup') this.beep(1200, 0.05, 'sine', 0.02);
    else if (t === 'jump') this.beep(520, 0.4, 'sine', 0.05);
    else if (t === 'buy') this.beep(700, 0.1, 'square', 0.03);
  },

  startGame() {
    this.systemIndex = 0; this.systemSeed = 12345; this.kills = 0;
    this.messages = [];
    this.closeDiscard();
    this.player = new Player();
    this.player.invuln = 3.0;                 // 开局 3 秒无敌，降低初期压力
    this.player.cargo = { mineral: 24, energy: 14, rare: 1 }; // 起步资源，便于早期升级
    this.warehouse = { mineral: 0, energy: 0, rare: 0 };       // 仓库清空，开始新一轮
    this.loadSystem(true);
    this.state = 'playing';
    document.getElementById('startScreen').style.display = 'none';
    document.getElementById('deathPanel').style.display = 'none';
    document.getElementById('dockPanel').style.display = 'none';
    this.msg('欢迎来到深空，指挥官。采集资源、升级飞船，穿越虫洞探索未知星系。');
  },

  loadSystem(isFirst) {
    const data = WorldGen.build(this.systemSeed + this.systemIndex * 7919, isFirst);
    this.asteroids = data.asteroids;
    this.enemies = data.enemies;
    this.wormholes = data.wormholes;
    this.station = data.station;
    this.stars = data.stars;
    this.nebula = data.nebula;
    this.systemName = data.name;
    this.systemRace = data.race;
    this.bullets = []; this.pickups = []; this.particles = [];
    // 玩家归位、补满（跃迁视为安全过渡）
    this.player.x = CONFIG.WORLD / 2; this.player.y = CONFIG.WORLD / 2;
    this.player.vx = 0; this.player.vy = 0; this.player.angle = -Math.PI / 2;
    this.player.hp = this.player.maxHp; this.player.fuel = this.player.maxFuel;
    this.jumpCD = 1.0; this.spawnTimer = 18;
  },

  // —— 主循环 ——
  loop(ts) {
    const dt = Math.min(0.05, (ts - this.last) / 1000 || 0);
    this.last = ts;
    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'docked') { this.updateParticles(dt); }
    this.render();
    Input.endFrame();
    requestAnimationFrame((t) => this.loop(t));
  },

  update(dt) {
    const p = this.player;
    if (this.joy && this.joy.id !== null) this.applyJoy();
    p.update(dt);
    this.asteroids.forEach(a => a.update(dt));
    this.enemies.forEach(e => e.update(dt));
    this.bullets.forEach(b => b.update(dt));
    this.pickups.forEach(o => o.update(dt));
    this.wormholes.forEach(w => w.update(dt));
    if (this.station) this.station.update(dt);
    this.updateParticles(dt);

    this.collisions(dt);

    // 敌人刷新（维持开放世界的压力，节奏更缓和）
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemies.length < 10) {
      this.spawnTimer = Utils.rand(22, 32);
      const ang = Utils.rand(0, Math.PI * 2);
      const ex = Utils.clamp(p.x + Math.cos(ang) * 900, 60, CONFIG.WORLD - 60);
      const ey = Utils.clamp(p.y + Math.sin(ang) * 900, 60, CONFIG.WORLD - 60);
      this.enemies.push(new Enemy(ex, ey, this.systemRace));
    }

    // 相机（视口大于世界时居中）
    let tx = p.x - CONFIG.WIDTH / 2;
    let ty = p.y - CONFIG.HEIGHT / 2;
    if (CONFIG.WIDTH >= CONFIG.WORLD) tx = (CONFIG.WORLD - CONFIG.WIDTH) / 2;
    else tx = Utils.clamp(tx, 0, CONFIG.WORLD - CONFIG.WIDTH);
    if (CONFIG.HEIGHT >= CONFIG.WORLD) ty = (CONFIG.WORLD - CONFIG.HEIGHT) / 2;
    else ty = Utils.clamp(ty, 0, CONFIG.WORLD - CONFIG.HEIGHT);
    this.cam.x = Utils.lerp(this.cam.x, tx, 0.12);
    this.cam.y = Utils.lerp(this.cam.y, ty, 0.12);

    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.jumpCD > 0) this.jumpCD -= dt;

    // 清理
    this.bullets = this.bullets.filter(b => b.life > 0);
    this.pickups = this.pickups.filter(o => o.life > 0 && !o.taken);
    this.asteroids = this.asteroids.filter(a => a.amount > 0);
    this.enemies = this.enemies.filter(e => !e.dead);
    this.particles = this.particles.filter(pt => pt.life > 0);
    this.messages = this.messages.filter(m => (m.t -= dt) > 0);

    // 停靠提示
    let nearStation = this.station && Utils.dist(p.x, p.y, this.station.x, this.station.y) < this.station.radius + 36;
    const prompt = document.getElementById('prompt');
    const dockBtn = document.getElementById('btnDock');
    if (nearStation) {
      prompt.style.display = 'block';
      prompt.textContent = document.body.classList.contains('touchui')
        ? '点击 ⚓ 停靠空间站（维修 / 补给 / 升级）'
        : '按 [E] 停靠空间站（维修 / 补给 / 升级）';
      if (dockBtn && document.body.classList.contains('touchui')) dockBtn.style.display = 'block';
      if (Input.justPressed('e')) this.openDock();
    } else {
      prompt.style.display = 'none';
      if (dockBtn) dockBtn.style.display = 'none';
    }

    this.updateHUD();
  },

  collisions(dt) {
    const p = this.player;
    // 玩家子弹
    for (const b of this.bullets) {
      if (b.owner !== 'player') continue;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (Utils.dist(b.x, b.y, e.x, e.y) < e.radius + b.radius) {
          e.hit(b.dmg); b.life = 0; this.hitSpark(b.x, b.y, '#fff'); break;
        }
      }
      if (b.life <= 0) continue;
      for (const a of this.asteroids) {
        if (Utils.dist(b.x, b.y, a.x, a.y) < a.radius + b.radius) {
          a.amount -= 14; b.life = 0; this.hitSpark(b.x, b.y, '#ccc');
          if (a.amount <= 0) this.breakAsteroid(a);
          break;
        }
      }
    }
    // 敌方子弹
    for (const b of this.bullets) {
      if (b.owner !== 'enemy') continue;
      if (Utils.dist(b.x, b.y, p.x, p.y) < p.radius + b.radius) {
        p.hit(b.dmg); b.life = 0;
      }
    }
    // 玩家采矿
    for (const a of this.asteroids) {
      const d = Utils.dist(p.x, p.y, a.x, a.y);
      if (d < p.radius + a.radius) {
        const mined = Math.min(a.amount, 30 * dt, this.player.cargoCap - this.player.totalCargo());
        if (mined > 0) { a.amount -= mined; this.player.addResource(a.type, mined); }
        // 轻微分离，避免卡入
        const ov = (p.radius + a.radius) - d;
        if (ov > 0 && d > 0.01) {
          const nx = (p.x - a.x) / d, ny = (p.y - a.y) / d;
          p.x += nx * ov; p.y += ny * ov;
        }
        if (a.amount <= 0) this.breakAsteroid(a);
      }
    }
    // 拾取
    for (const o of this.pickups) {
      if (o.taken) continue;
      if (Utils.dist(p.x, p.y, o.x, o.y) < p.radius + o.radius) {
        if (o.type === 'fuel') {
          const before = this.player.fuel;
          this.player.fuel = Math.min(this.player.maxFuel, this.player.fuel + o.amount);
          if (this.player.fuel > before) { o.taken = true; this.sfx('pickup'); this.msg(`补充燃料 +${Math.round(this.player.fuel - before)}`); }
        } else {
          const got = this.player.addResource(o.type, o.amount);
          if (got > 0) { o.taken = true; this.sfx('pickup');
            if (o.type === 'rare') this.msg(`获得稀有金属 ×${Math.round(got)}`); }
        }
      }
    }
    // 撞击敌舰
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Utils.dist(p.x, p.y, e.x, e.y);
      if (d < p.radius + e.radius) {
        p.hit(e.race.dmg * 0.4 + 4);
        e.hit(8);
        const nx = (e.x - p.x) / (d || 1), ny = (e.y - p.y) / (d || 1);
        e.vx += nx * 120; e.vy += ny * 120;
      }
      // 游商俘虏：靠近即缴获
      if (e.race.behavior === 'trader' && d < 64) {
        e.dead = true;
        for (let i = 0; i < 5; i++) this.pickups.push(new Pickup(e.x, e.y, 'rare', Utils.rand(6, 12)));
        this.explode(e.x, e.y, e.race.color, 14);
        this.msg('追上游商族，缴获一批稀有金属！');
      }
    }
    // 虫洞跃迁
    for (const w of this.wormholes) {
      if (this.jumpCD <= 0 && Utils.dist(p.x, p.y, w.x, w.y) < w.radius * 0.5) {
        this.jump();
      }
    }
  },

  jump() {
    this.systemIndex++;
    this.systemSeed = (this.systemSeed * 1103515245 + 12345) & 0x7fffffff;
    this.sfx('jump');
    this.flash('#9be7ff'); this.shake(10);
    this.loadSystem(false);
    this.msg(`虫洞跃迁成功 —— 抵达 ${this.systemName}（主导种族：${this.systemRace.name}）`);
  },

  breakAsteroid(a) {
    const n = Utils.randInt(2, 3);
    for (let i = 0; i < n; i++) this.pickups.push(new Pickup(a.x, a.y, a.type, Math.max(2, a.maxAmount / n)));
    this.explode(a.x, a.y, '#9a8d78', 8);
  },

  onEnemyDeath(e) {
    this.kills++;
    this.explode(e.x, e.y, e.race.color, 18);
    this.sfx('explode');
    const n = e.race.behavior === 'tank' ? 4 : (e.race.behavior === 'trader' ? 5 : 3);
    for (let i = 0; i < n; i++) this.pickups.push(new Pickup(e.x, e.y, e.race.drop, Utils.rand(4, 9)));
    if (e.race.behavior === 'tank' && Math.random() < 0.6)
      this.pickups.push(new Pickup(e.x, e.y, 'rare', Utils.rand(5, 12)));
    // 燃料补给（重甲/游商必掉，其余小概率）
    if (e.race.behavior === 'tank' || e.race.behavior === 'trader')
      this.pickups.push(new Pickup(e.x, e.y, 'fuel', Utils.rand(25, 40)));
    else if (Math.random() < 0.25)
      this.pickups.push(new Pickup(e.x, e.y, 'fuel', Utils.rand(15, 25)));
    this.msg(`击毁${e.race.name}战舰，掉落${CONFIG.RESOURCE_NAMES[e.race.drop]}。`);
  },

  onPlayerDeath() {
    this.state = 'dead';
    this.closeDiscard();
    this.explode(this.player.x, this.player.y, '#ff5a5a', 40);
    this.sfx('explode');
    document.getElementById('deathStats').textContent =
      `抵达星系：${this.systemIndex + 1} 个　击毁敌舰：${this.kills} 艘`;
    document.getElementById('deathPanel').style.display = 'flex';
  },

  // —— 空间站 / 升级 ——
  openDock() {
    this.state = 'docked';
    this.closeDiscard();
    this.player.hp = this.player.maxHp;
    this.player.fuel = this.player.maxFuel;
    this.msg('已停靠空间站：船体维修完毕，燃料补满。');
    this.renderDock();
    document.getElementById('dockPanel').style.display = 'flex';
    document.getElementById('prompt').style.display = 'none';
  },
  closeDock() {
    this.state = 'playing';
    document.getElementById('dockPanel').style.display = 'none';
  },
  costFor(key, level) {
    const base = UPGRADES.find(u => u.key === key).cost;
    const f = 1 + level * 0.6;
    const out = {};
    for (const k in base) out[k] = Math.round(base[k] * f);
    return out;
  },
  canAfford(cost) {
    for (const k in cost) if (this.player.cargo[k] < cost[k]) return false;
    return true;
  },
  buyUpgrade(key) {
    const lvl = this.player.up[key];
    const cost = this.costFor(key, lvl);
    if (!this.canAfford(cost)) { this.msg('资源不足，无法升级。'); return; }
    for (const k in cost) this.player.cargo[k] -= cost[k];
    this.player.up[key] = lvl + 1;
    this.player.recompute();
    this.player.hp = this.player.maxHp; this.player.fuel = this.player.maxFuel;
    this.sfx('buy');
    this.msg(`升级完成：${UPGRADES.find(u => u.key === key).name} → Lv.${lvl + 1}`);
    this.renderDock();
  },
  renderDock() {
    const box = document.getElementById('upgradeList');
    box.innerHTML = '';
    for (const u of UPGRADES) {
      const lvl = this.player.up[u.key];
      const cost = this.costFor(u.key, lvl);
      const afford = this.canAfford(cost);
      const costStr = Object.entries(cost).map(([k, v]) =>
        `<span style="color:${CONFIG.RESOURCE_COLORS[k]}">${CONFIG.RESOURCE_NAMES[k]} ${v}</span>`).join('　');
      const row = document.createElement('div');
      row.className = 'up-row' + (afford ? '' : ' disabled');
      row.innerHTML = `
        <div class="up-info"><b>${u.name}</b> <span class="lv">Lv.${lvl}</span><br>
          <small>${u.desc}</small><br><span class="cost">${costStr}</span></div>
        <button class="up-btn">升级</button>`;
      row.querySelector('.up-btn').onclick = () => this.buyUpgrade(u.key);
      box.appendChild(row);
    }
    this.renderWarehouse();
    this.updateHUD();
  },

  // —— 仓库：存入 / 取出 / 丢弃 ——
  renderWarehouse() {
    const box = document.getElementById('warehouseList');
    if (!box) return;
    box.innerHTML = '';
    for (const t of CONFIG.RESOURCE_TYPES) {
      const row = document.createElement('div');
      row.className = 'wh-row';
      const ship = Math.floor(this.player.cargo[t]);
      const wh = Math.floor(this.warehouse[t]);
      row.innerHTML = `
        <span class="wh-name" style="color:${CONFIG.RESOURCE_COLORS[t]}">${CONFIG.RESOURCE_NAMES[t]}</span>
        <span class="wh-amt">船 <b>${ship}</b> · 仓 <b>${wh}</b></span>
        <span class="wh-btns">
          <button class="wh-btn dep">存入</button>
          <button class="wh-btn wit">取出</button>
          <button class="wh-btn dis">丢弃</button>
        </span>`;
      row.querySelector('.dep').onclick = () => this.deposit(t);
      row.querySelector('.wit').onclick = () => this.withdraw(t);
      row.querySelector('.dis').onclick = () => this.discard(t);
      box.appendChild(row);
    }
  },
  deposit(type) {
    const amt = this.player.cargo[type];
    if (amt <= 0) { this.msg('货舱里没有' + CONFIG.RESOURCE_NAMES[type] + '。'); return; }
    this.warehouse[type] += amt;
    this.player.cargo[type] = 0;
    this.sfx('buy');
    this.msg(`已存入仓库：${CONFIG.RESOURCE_NAMES[type]} ×${amt}`);
    this.renderWarehouse(); this.updateHUD();
  },
  withdraw(type) {
    const room = this.player.cargoCap - this.player.totalCargo();
    if (room <= 0) { this.msg('货舱已满，无法取出。'); return; }
    const amt = Math.min(this.warehouse[type], room);
    if (amt <= 0) { this.msg('仓库里没有' + CONFIG.RESOURCE_NAMES[type] + '。'); return; }
    this.player.cargo[type] += amt;
    this.warehouse[type] -= amt;
    this.sfx('buy');
    this.msg(`已从仓库取出：${CONFIG.RESOURCE_NAMES[type]} ×${amt}`);
    this.renderWarehouse(); this.updateHUD();
  },
  discard(type) {
    const amt = this.player.cargo[type];
    if (amt <= 0) { this.msg('货舱里没有' + CONFIG.RESOURCE_NAMES[type] + '。'); return; }
    this.player.cargo[type] = 0;
    this.sfx('buy');
    this.msg(`已丢弃：${CONFIG.RESOURCE_NAMES[type]} ×${amt}`);
    this.renderWarehouse(); this.renderDiscard(); this.updateHUD();
  },

  // —— 飞行中就地丢弃 ——
  openDiscard() {
    if (this.state !== 'playing') return;
    this.renderDiscard();
    document.getElementById('discardPanel').style.display = 'block';
  },
  closeDiscard() {
    document.getElementById('discardPanel').style.display = 'none';
  },
  toggleDiscard() {
    if (this.state !== 'playing') return;
    const el = document.getElementById('discardPanel');
    if (el.style.display === 'block') this.closeDiscard();
    else this.openDiscard();
  },
  renderDiscard() {
    const box = document.getElementById('discardList');
    if (!box) return;
    box.innerHTML = '';
    for (const t of CONFIG.RESOURCE_TYPES) {
      const amt = Math.floor(this.player.cargo[t]);
      const row = document.createElement('div');
      row.className = 'disc-row';
      row.innerHTML = `
        <span class="dn" style="color:${CONFIG.RESOURCE_COLORS[t]}">${CONFIG.RESOURCE_NAMES[t]}</span>
        <span class="da">货舱 <b>${amt}</b></span>
        <button class="wh-btn dis" ${amt <= 0 ? 'disabled style="opacity:.4"' : ''}>丢弃</button>`;
      const btn = row.querySelector('.wh-btn');
      if (amt > 0) btn.onclick = () => this.discard(t);
      box.appendChild(row);
    }
  },
  dumpAll() {
    let total = 0;
    for (const t of CONFIG.RESOURCE_TYPES) { total += this.player.cargo[t]; this.player.cargo[t] = 0; }
    if (total <= 0) { this.msg('货舱已经是空的。'); return; }
    this.sfx('buy');
    this.msg(`已丢弃全部资源 ×${Math.floor(total)}`);
    this.renderDiscard(); this.updateHUD();
  },

  // —— 特效 ——
  explode(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Utils.rand(0, Math.PI * 2), sp = Utils.rand(40, 200);
      this.particles.push(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, color, Utils.rand(0.3, 0.8), Utils.rand(2, 4)));
    }
  },
  hitSpark(x, y, color) {
    for (let i = 0; i < 4; i++) {
      const a = Utils.rand(0, Math.PI * 2), sp = Utils.rand(30, 90);
      this.particles.push(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, color, Utils.rand(0.15, 0.35), 2));
    }
  },
  updateParticles(dt) { this.particles.forEach(p => p.update(dt)); },
  shake(m) { this.shakeT = 0.3; this.shakeMag = m; },
  flash(c) { this.flashColor = c; this.flashT = 0.25; },
  msg(t) { this.messages.push({ text: t, t: 5 }); if (this.messages.length > 6) this.messages.shift(); },

  // —— HUD ——
  updateHUD() {
    const p = this.player; if (!p) return;
    document.getElementById('sysName').textContent = this.systemName;
    document.getElementById('sysRace').textContent = '主导种族：' + this.systemRace.name;
    document.getElementById('hpFill').style.width = (p.hp / p.maxHp * 100) + '%';
    document.getElementById('hpText').textContent = `船体 ${Math.ceil(p.hp)}/${p.maxHp}`;
    document.getElementById('fuelFill').style.width = (p.fuel / p.maxFuel * 100) + '%';
    document.getElementById('fuelText').textContent = `燃料 ${Math.ceil(p.fuel)}/${p.maxFuel}`;
    const wh = this.warehouse ? this.warehouse.mineral + this.warehouse.energy + this.warehouse.rare : 0;
    document.getElementById('cargoText').textContent =
      `货舱 ${p.totalCargo()}/${p.cargoCap}　矿物${Math.floor(p.cargo.mineral)} 能量${Math.floor(p.cargo.energy)} 稀有${Math.floor(p.cargo.rare)}　仓库${wh}`;
    document.getElementById('statKills').textContent = '击毁 ' + this.kills;
    document.getElementById('statSys').textContent = '星系 ' + (this.systemIndex + 1);
    // 日志
    const log = document.getElementById('log');
    log.innerHTML = this.messages.map(m =>
      `<div style="opacity:${Utils.clamp(m.t / 5, 0.2, 1)}">▸ ${m.text}</div>`).join('');
    this.updateWeaponTag();
  },

  // 武器指示（HUD 文本 + 移动端切换键图标）
  updateWeaponTag() {
    const w = this.player ? this.player.weapon : 0;
    const name = w === 1 ? '散射炮' : '主炮';
    const el = document.getElementById('weaponText');
    if (el) el.textContent = '武器 ' + name;
    const wb = document.getElementById('btnWeapon');
    if (wb) wb.textContent = w === 1 ? '🔱' : '🔫';
  },

  // —— 渲染 ——
  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr || 1, 0, 0, this.dpr || 1, 0, 0);
    ctx.fillStyle = '#05060e';
    ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);

    if (this.state === 'start') return;

    let sx = 0, sy = 0;
    if (this.shakeT > 0) { sx = Utils.rand(-1, 1) * this.shakeMag; sy = Utils.rand(-1, 1) * this.shakeMag; }
    const camX = this.cam.x - sx, camY = this.cam.y - sy;

    ctx.save();
    ctx.translate(-camX, -camY);

    // 星云
    for (const n of this.nebula) {
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      g.addColorStop(0, `hsla(${n.hue},70%,55%,${n.a})`);
      g.addColorStop(1, 'hsla(0,0%,0%,0)');
      ctx.fillStyle = g;
      ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }
    // 星点
    for (const s of this.stars) {
      ctx.globalAlpha = s.b; ctx.fillStyle = '#cfe3ff';
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    this.asteroids.forEach(a => a.draw(ctx));
    this.pickups.forEach(o => o.draw(ctx));
    if (this.station) this.station.draw(ctx);
    this.wormholes.forEach(w => w.draw(ctx));
    this.enemies.forEach(e => e.draw(ctx));
    this.bullets.forEach(b => b.draw(ctx));
    if (this.state !== 'dead') this.player.draw(ctx);
    this.particles.forEach(p => p.draw(ctx));

    ctx.restore();

    // 闪屏
    if (this.flashT > 0) {
      ctx.globalAlpha = Utils.clamp(this.flashT / 0.25, 0, 1) * 0.5;
      ctx.fillStyle = this.flashColor; ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
      ctx.globalAlpha = 1;
    }

    this.drawMinimap();
  },

  drawMinimap() {
    const mm = document.getElementById('minimap');
    const c = mm.getContext('2d');
    const S = mm.width;
    const k = S / CONFIG.WORLD;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = 'rgba(8,12,24,0.85)'; c.fillRect(0, 0, S, S);
    c.strokeStyle = 'rgba(120,150,200,0.4)'; c.strokeRect(0.5, 0.5, S - 1, S - 1);
    for (const a of this.asteroids) { c.fillStyle = 'rgba(150,160,175,0.5)'; c.fillRect(a.x * k - 1, a.y * k - 1, 2, 2); }
    for (const w of this.wormholes) { c.fillStyle = '#5ad7ff'; c.beginPath(); c.arc(w.x * k, w.y * k, 3, 0, Math.PI * 2); c.fill(); }
    if (this.station) { c.fillStyle = '#3fa9ff'; c.fillRect(this.station.x * k - 2, this.station.y * k - 2, 4, 4); }
    for (const e of this.enemies) { c.fillStyle = e.race.color; c.fillRect(e.x * k - 1, e.y * k - 1, 2, 2); }
    // 玩家
    c.fillStyle = '#fff'; c.beginPath(); c.arc(this.player.x * k, this.player.y * k, 2.5, 0, Math.PI * 2); c.fill();
  },
};

window.addEventListener('load', () => Game.init());
