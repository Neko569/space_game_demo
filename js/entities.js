/* ============================================================
 * entities.js — 游戏实体
 * 玩家飞船 / 小行星 / 敌人(含种族AI) / 子弹 / 虫洞 / 空间站 / 拾取物 / 粒子
 * 实体通过全局 Game 对象读写世界状态与列表。
 * ============================================================ */

class Player {
  constructor() {
    this.x = CONFIG.WORLD / 2;
    this.y = CONFIG.WORLD / 2;
    this.vx = 0; this.vy = 0;
    this.angle = -Math.PI / 2;     // 朝"上"
    this.hp = CONFIG.START_HP;
    this.fuel = CONFIG.START_FUEL;
    this.cargo = { mineral: 0, energy: 0, rare: 0 };
    this.up = { engine: 0, hull: 0, cargo: 0, fuel: 0, shield: 0 };
    this.maxShield = 0; this.shieldRegen = 0; this.shieldRegenDelay = 3.0; this.shieldDelay = 0;
    // this.shield 在 recompute() 中于首次构建时充满
    this.loadout = [ WeaponGen.make(1) ];   // 起始配发一把手枪
    this.equipIdx = 0;
    this.ammo = this.loadout[0].magSize;
    this.reloadTimer = 0;
    this.thrusting = false;
    this.fireTimer = 0;
    this.invuln = 0;               // 受击无敌帧
    this.radius = 14;
    // 职业 / 等级 / 技能
    this.classId = 'ranger';
    this.level = 1;
    this.xp = 0;
    this.skillPoints = 0;
    this.spentPoints = {};
    this.activeCd = 0;
    this.droneT = 0;       // 维修无人机剩余
    this.overloadT = 0;    // 元素过载剩余
    this.recompute();
  }

  // —— 由升级等级派生的属性 ——
  recompute() {
    this.maxHp = 100 + this.up.hull * 40;
    this.maxFuel = 140 + this.up.fuel * 40;
    this.maxSpeed = 240 + this.up.engine * 55;
    this.thrust = 380 + this.up.engine * 80;
    this.turn = 3.4;
    // 武器威力来自拾取的程序化枪械（见 loadout），不再由升级决定
    this.cargoCap = 50 + this.up.cargo * 30;
    this.maxShield = 40 + this.up.shield * 25;       // 护盾能量上限
    this.shieldRegen = 9 + this.up.shield * 3;        // 每秒回充量
    this.shieldRegenDelay = 3.0;                       // 受击后延迟回充时间
    // 职业：被动 + 技能树叠加（重算前重置临时乘数）
    this._magMul = 1; this._reloadMul = 1; this._dmgMul = 1;
    this._elementMul = 1; this._dotMul = 1; this._cdMul = 1;
    const cls = CLASS_BY_ID[this.classId];
    if (cls) {
      if (cls.passive.shieldRegenMul) this.shieldRegen *= cls.passive.shieldRegenMul;
      if (cls.passive.magMul) this._magMul *= cls.passive.magMul;
      if (cls.passive.elementMul) this._elementMul *= cls.passive.elementMul;
    }
    if (typeof applySkills === 'function') applySkills(this);
    if (this.shield === undefined) this.shield = this.maxShield;
  }

  totalCargo() { return this.cargo.mineral + this.cargo.energy + this.cargo.rare; }
  cargoFull() { return this.totalCargo() >= this.cargoCap; }

  addResource(type, amt) {
    const room = this.cargoCap - this.totalCargo();
    const add = Math.min(amt, Math.max(0, room));
    this.cargo[type] += add;
    return add; // 实际装入量
  }

  update(dt) {
    // 旋转
    if (Input.isDown('a', 'arrowleft')) this.angle -= this.turn * dt;
    if (Input.isDown('d', 'arrowright')) this.angle += this.turn * dt;

    // 推进（消耗燃料）
    this.thrusting = false;
    const fx = Math.sin(this.angle), fy = -Math.cos(this.angle);
    if (Input.isDown('w', 'arrowup') && this.fuel > 0) {
      this.vx += fx * this.thrust * dt;
      this.vy += fy * this.thrust * dt;
      this.fuel = Math.max(0, this.fuel - 2.5 * dt);
      this.thrusting = true;
    }
    if (Input.isDown('s', 'arrowdown')) { // 反向制动
      this.vx -= fx * this.thrust * 0.5 * dt;
      this.vy -= fy * this.thrust * 0.5 * dt;
    }

    // 阻尼 + 限速
    const damp = Math.pow(0.86, dt * 60);
    this.vx *= damp; this.vy *= damp;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > this.maxSpeed) { this.vx = this.vx / sp * this.maxSpeed; this.vy = this.vy / sp * this.maxSpeed; }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 世界边界（软反弹）
    const m = 20;
    if (this.x < m) { this.x = m; this.vx = Math.abs(this.vx) * 0.4; }
    if (this.x > CONFIG.WORLD - m) { this.x = CONFIG.WORLD - m; this.vx = -Math.abs(this.vx) * 0.4; }
    if (this.y < m) { this.y = m; this.vy = Math.abs(this.vy) * 0.4; }
    if (this.y > CONFIG.WORLD - m) { this.y = CONFIG.WORLD - m; this.vy = -Math.abs(this.vy) * 0.4; }

    // 射击 + 换弹（武器属性来自装备栏）
    this.fireTimer -= dt;
    const w = this.curWeapon();
    const cd = w ? w.fireRate : 0.5;
    if (Input.isDown(' ') && this.fireTimer <= 0 && this.reloadTimer <= 0 && this.ammo > 0) {
      this.shoot();
      this.fireTimer = cd;
    }
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0 && w) this.ammo = w.magSize;
    } else if (this.ammo <= 0 && w) {
      this.reloadTimer = w.reload;   // 弹尽自动换弹
    }
    if (this.invuln > 0) this.invuln -= dt;
    // 护盾自动回充（受击后先等待 shieldRegenDelay 秒）
    if (this.shieldDelay > 0) this.shieldDelay -= dt;
    else if (this.shield < this.maxShield) this.shield = Math.min(this.maxShield, this.shield + this.shieldRegen * dt);
    // 主动技能 CD / 持续效果
    if (this.activeCd > 0) this.activeCd -= dt;
    if (this.droneT > 0) { this.droneT -= dt; this.hp = Math.min(this.maxHp, this.hp + 18 * dt); }
    if (this.overloadT > 0) this.overloadT -= dt;
  }

  // 当前装备的武器
  curWeapon() { return this.loadout.length ? this.loadout[this.equipIdx] : null; }

  equip(idx) {
    if (idx < 0 || idx >= this.loadout.length || idx === this.equipIdx) return;
    this.equipIdx = idx;
    this.reloadTimer = 0;
    this.ammo = this.loadout[idx].magSize;
    if (typeof Game !== 'undefined') { Game.sfx('buy'); Game.updateWeaponTag(); }
  }
  cycleWeapon() {
    if (this.loadout.length > 1) this.equip((this.equipIdx + 1) % this.loadout.length);
  }
  reload() {
    const w = this.curWeapon();
    if (w && this.ammo < w.magSize && this.reloadTimer <= 0) this.reloadTimer = w.reload;
  }

  shoot() {
    const w = this.curWeapon();
    if (!w) return;
    const fx = Math.sin(this.angle), fy = -Math.cos(this.angle);
    const bx = this.x + fx * 16, by = this.y + fy * 16;
    const n = w.projectiles, span = w.spread, half = span / 2;
    const dmgMul = this._dmgMul || 1;
    const elMul = (this._elementMul || 1);
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? (Utils.rand(-span, span) * 0.5)
        : -half + span * i / (n - 1) + Utils.rand(-0.02, 0.02);
      const ca = Math.cos(off), sa = Math.sin(off);
      const rx = fx * ca - fy * sa, ry = fx * sa + fy * ca;
      let dmg = w.bulletDmg * dmgMul;
      let el = w.element;
      // 元素过载：随机附加元素
      if (this.overloadT > 0) {
        el = Utils.choice(['fire', 'shock', 'corrosive', 'cryo']);
        dmg *= elMul;
      } else if (el !== 'none') {
        dmg *= elMul;
      }
      const b = new Bullet(bx, by, rx * w.bulletSpeed + this.vx, ry * w.bulletSpeed + this.vy,
        dmg, 'player', w.color, el);
      Game.bullets.push(b);
    }
    this.ammo--;
    if (this.ammo <= 0) this.reloadTimer = w.reload * (this._reloadMul || 1);
    Game.sfx('shoot');
  }

  hit(dmg) {
    if (this.invuln > 0) return;
    // 护盾优先吸收伤害
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
    }
    if (dmg > 0) {
      this.hp -= dmg;
      if (typeof Game !== 'undefined' && Game.dmgWindow !== undefined) Game.dmgWindow += dmg;
    }
    this.shieldDelay = this.shieldRegenDelay;                 // 受击后暂停回充
    this.invuln = 0.6;
    Game.shake(6);
    Game.flash(this.shield > 0 ? '#5ad7ff' : '#ff4d4d');      // 护盾吸收显青色，破盾受伤显红色
    if (this.hp <= 0) { this.hp = 0; Game.onPlayerDeath(); }
  }

  draw(ctx) {
    const s = Sprites.PX;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.imageSmoothingEnabled = false;
    // 引擎火焰（位于机体下方局部坐标）
    if (this.thrusting) {
      const len = 5 + Math.random() * 5;
      ctx.fillStyle = '#ff9b2f';
      ctx.fillRect(-2 * s, 8 * s, 4 * s, len * s);
      ctx.fillStyle = '#ffe27a';
      ctx.fillRect(-1 * s, 8 * s, 2 * s, len * 0.6 * s);
    }
    ctx.drawImage(Sprites.ships.human, -8 * s, -8 * s, 16 * s, 16 * s);
    ctx.restore();
    // 受击闪烁
    if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0) {
      ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
}

class Asteroid {
  constructor(x, y, r, type) {
    this.x = x; this.y = y;
    this.vx = Utils.rand(-12, 12); this.vy = Utils.rand(-12, 12);
    this.r = r;
    this.type = type;
    this.amount = Math.round((r / 10) * Utils.rand(28, 45));
    this.maxAmount = this.amount;
    this.sprite = Utils.choice(Sprites.asteroids);
    this.spin = Utils.rand(-0.4, 0.4);
    this.angle = Utils.rand(0, Math.PI * 2);
    this.radius = r;
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.angle += this.spin * dt;
    if (this.x < 0 || this.x > CONFIG.WORLD) this.vx *= -1;
    if (this.y < 0 || this.y > CONFIG.WORLD) this.vy *= -1;
  }
  draw(ctx) {
    Sprites.drawSprite(ctx, this.sprite, this.x, this.y, this.angle);
    // 资源类型光晕
    const col = CONFIG.RESOURCE_COLORS[this.type];
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(performance.now() / 300 + this.x);
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 4, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

class Enemy {
  constructor(x, y, race) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.race = race;
    const D = (typeof Game !== 'undefined' && Game.diff) || 1;
    this.hp = race.hp; this.maxHp = race.hp;
    this.dmg = race.dmg * D;            // 难度越高，单发伤害越高
    this.fireRate = race.fireRate / D;  // 难度越高，开火越频繁
    this.angle = Utils.rand(0, Math.PI * 2);
    this.fireTimer = Utils.rand(0, this.fireRate);
    this.radius = 13;
    this.dead = false;
    this.captured = false;
    this.dots = [];        // 活动持续伤害效果 {dmg, t, element}
    this.slowT = 0;        // 冰冻减速剩余时间
  }

  update(dt) {
    // 元素 DoT 结算
    if (this.dots.length) {
      for (let i = this.dots.length - 1; i >= 0; i--) {
        const dot = this.dots[i];
        this.hp -= dot.dmg * dt;
        dot.t -= dt;
        if (dot.t <= 0) this.dots.splice(i, 1);
      }
      if (this.hp <= 0 && !this.dead) { this.dead = true; Game.onEnemyDeath(this); return; }
    }
    if (this.slowT > 0) this.slowT -= dt;
    const slowMul = this.slowT > 0 ? (1 - CONFIG.ELEMENTS.cryo.slow) : 1;

    const p = Game.player;
    const d = Utils.dist(this.x, this.y, p.x, p.y);
    const toAng = Utils.angleTo(this.x, this.y, p.x, p.y);
    const maxSp = 150 * this.race.speed * slowMul;
    let desired = toAng;     // 期望朝向
    let accel = 240 * this.race.speed * slowMul;

    switch (this.race.behavior) {
      case 'swarm':
        if (d < 80) desired = toAng + Math.PI; // 太近则绕开
        break;
      case 'kite':
        if (d < 240) desired = toAng + Math.PI;       // 太近后撤
        else if (d > 340) desired = toAng;            // 太远接近
        else desired = toAng + Math.PI / 2;           // 横向走位
        accel *= 0.9;
        break;
      case 'tank':
        if (d < 120) desired = toAng + Math.PI;
        accel *= 0.8;
        break;
      case 'trader':
        desired = toAng + Math.PI;  // 永远远离玩家
        accel *= 1.1;
        break;
    }

    // 转向 + 加速
    const da = Utils.normAngle(desired - Math.atan2(this.vy, this.vx));
    const moveAng = (this.vx === 0 && this.vy === 0) ? desired : Math.atan2(this.vy, this.vx) + Utils.normAngle(desired - Math.atan2(this.vy, this.vx)) * Math.min(1, dt * 3);
    this.vx += Math.cos(moveAng) * accel * dt;
    this.vy += Math.sin(moveAng) * accel * dt;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > maxSp) { this.vx = this.vx / sp * maxSp; this.vy = this.vy / sp * maxSp; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.x < 10 || this.x > CONFIG.WORLD - 10) this.vx *= -1;
    if (this.y < 10 || this.y > CONFIG.WORLD - 10) this.vy *= -1;

    // 朝向玩家（用于绘制）
    this.angle = toAng + Math.PI / 2;

    // 开火（仅在玩家视野内才会射击，避免"视野外被打"）
    const cam = Game.cam;
    const onScreen = this.x > cam.x - 30 && this.x < cam.x + CONFIG.WIDTH + 30 &&
                     this.y > cam.y - 30 && this.y < cam.y + CONFIG.HEIGHT + 30;
    if (this.race.dmg > 0 && d < 520 && onScreen) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = this.fireRate;
        const fx = Math.cos(toAng), fy = Math.sin(toAng);
        Game.bullets.push(new Bullet(this.x + fx * 14, this.y + fy * 14,
          fx * 320 + this.vx * 0.3, fy * 320 + this.vy * 0.3, this.dmg, 'enemy', this.race.color));
        Game.sfx('enemy');
      }
    }
  }

  hit(dmg, element, chain) {
    element = element || 'none';
    const mods = this.race.elementMods || {};
    const mod = mods[element] !== undefined ? mods[element] : 1;
    let real = dmg * mod;
    // 电击对护盾加成（敌人无护盾，转为小幅连锁：对附近同族造成衰减伤害，仅跳一次）
    if (element === 'shock' && mod >= 1 && !chain) {
      let near = null, nd = 90;
      for (const e of Game.enemies) {
        if (e === this || e.dead) continue;
        const dd = Utils.dist(this.x, this.y, e.x, e.y);
        if (dd < nd) { nd = dd; near = e; }
      }
      if (near) near.hit(dmg * 0.3, 'shock', true);
    }
    this.hp -= real;
    // 火/腐蚀附加 DoT
    const E = CONFIG.ELEMENTS[element];
    if (E && E.dot > 0 && E.dotTime > 0) {
      this.dots.push({ dmg: E.dot * mod, t: E.dotTime, element });
    }
    // 冰冻减速
    if (element === 'cryo') this.slowT = 2.5;
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      Game.onEnemyDeath(this);
    }
  }

  draw(ctx) {
    Sprites.drawSprite(ctx, Sprites.ships[this.race.id], this.x, this.y, this.angle);
    // 血条
    if (this.hp < this.maxHp) {
      const w = 26, h = 3;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(this.x - w / 2, this.y - 22, w, h);
      ctx.fillStyle = this.race.color;
      ctx.fillRect(this.x - w / 2, this.y - 22, w * (this.hp / this.maxHp), h);
    }
  }
}

class Bullet {
  constructor(x, y, vx, vy, dmg, owner, color, element) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.dmg = dmg; this.owner = owner;
    this.color = color || (owner === 'player' ? '#9be7ff' : '#ff7a6b');
    this.element = element || 'none';
    this.life = 1.6; this.radius = 3;
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt;
  }
  draw(ctx) {
    ctx.save();
    ctx.shadowColor = this.color; ctx.shadowBlur = 6;
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - 2, this.y - 2, 4, 4);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(8,8,14,0.85)';
    ctx.strokeRect(this.x - 2, this.y - 2, 4, 4);
    ctx.restore();
  }
}

class Pickup {
  constructor(x, y, type, amount) {
    this.x = x; this.y = y;
    this.vx = Utils.rand(-30, 30); this.vy = Utils.rand(-30, 30);
    this.type = type; this.amount = amount;
    this.weapon = (type === 'weapon') ? amount : null;
    this.life = 22; this.radius = 9;
    this.spin = Utils.rand(0, Math.PI * 2);
  }
  update(dt) {
    // 靠近玩家时磁吸
    const p = Game.player;
    const d = Utils.dist(this.x, this.y, p.x, p.y);
    if (d < 180) {
      const a = Utils.angleTo(this.x, this.y, p.x, p.y);
      const pull = (1 - d / 180) * 340;
      this.vx += Math.cos(a) * pull * dt;
      this.vy += Math.sin(a) * pull * dt;
    }
    this.vx *= Math.pow(0.9, dt * 60); this.vy *= Math.pow(0.9, dt * 60);
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.spin += dt * 2;
    this.life -= dt;
  }
  draw(ctx) {
    if (this.type === 'weapon' && this.weapon) {
      const col = this.weapon.color;
      ctx.save();
      ctx.translate(this.x, this.y); ctx.rotate(this.spin);
      ctx.shadowColor = col; ctx.shadowBlur = 12;
      ctx.fillStyle = col;
      ctx.fillRect(-7, -5, 14, 10);
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(8,8,14,0.85)';
      ctx.strokeRect(-7, -5, 14, 10);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(-3, -2, 6, 4);
      ctx.restore();
      return;
    }
    if (this.type === 'fuel') {
      ctx.save();
      ctx.translate(this.x, this.y); ctx.rotate(this.spin);
      ctx.fillStyle = '#6dffb0'; ctx.shadowColor = '#6dffb0'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(8,8,14,0.85)'; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(-1.5, -1.5, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    const col = CONFIG.RESOURCE_COLORS[this.type];
    ctx.save();
    ctx.translate(this.x, this.y); ctx.rotate(this.spin);
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(5, 0); ctx.lineTo(0, 6); ctx.lineTo(-5, 0); ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(8,8,14,0.8)'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(2, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

class Wormhole {
  constructor(x, y) {
    this.x = x; this.y = y; this.radius = 46;
    this.spin = 0; this.hue = Utils.randInt(0, 360);
  }
  update(dt) { this.spin += dt * 1.2; }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    for (let i = 0; i < 5; i++) {
      const r = this.radius - i * 7;
      const a = this.spin + i * 0.5;
      ctx.strokeStyle = `hsla(${(this.hue + i * 18) % 360},80%,${60 - i * 4}%,${0.8 - i * 0.13})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.62, a, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = `hsla(${this.hue},90%,70%,0.25)`;
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

class Station {
  constructor(x, y) { this.x = x; this.y = y; this.radius = 26; this.spin = 0; }
  update(dt) { this.spin += dt * 0.4; }
  draw(ctx) {
    Sprites.drawSprite(ctx, Sprites.station, this.x, this.y, this.spin * 0.3);
    // 停靠提示环
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.3 * Math.sin(performance.now() / 400);
    ctx.strokeStyle = '#3fa9ff'; ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 10, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

class Particle {
  constructor(x, y, vx, vy, color, life, size) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.color = color; this.life = life; this.maxLife = life; this.size = size || 3;
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vx *= 0.94; this.vy *= 0.94;
    this.life -= dt;
  }
  draw(ctx) {
    ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
    ctx.fillStyle = this.color;
    const s = this.size * Sprites.PX;
    ctx.fillRect(this.x - s / 2, this.y - s / 2, s, s);
    ctx.globalAlpha = 1;
  }
}
