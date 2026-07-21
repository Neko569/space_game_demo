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
    this.up = { engine: 0, hull: 0, weapon: 0, cargo: 0, fuel: 0, shield: 0 };
    this.maxShield = 0; this.shieldRegen = 0; this.shieldRegenDelay = 3.0; this.shieldDelay = 0;
    // this.shield 在 recompute() 中于首次构建时充满
    this.thrusting = false;
    this.fireTimer = 0;
    this.weapon = 0;               // 0=主炮 1=散射炮
    this.invuln = 0;               // 受击无敌帧
    this.radius = 14;
    this.recompute();
  }

  // —— 由升级等级派生的属性 ——
  recompute() {
    this.maxHp = 100 + this.up.hull * 40;
    this.maxFuel = 140 + this.up.fuel * 40;
    this.maxSpeed = 240 + this.up.engine * 55;
    this.thrust = 380 + this.up.engine * 80;
    this.turn = 3.4;
    this.bulletDmg = 10 + this.up.weapon * 7;
    this.fireCD = Math.max(0.12, 0.4 - this.up.weapon * 0.06);
    this.spreadCD = Math.max(0.3, 0.78 - this.up.weapon * 0.07);   // 散射炮射击间隔
    this.spreadCount = 3 + Math.min(2, Math.floor(this.up.weapon / 3)); // 散射弹数随武器等级增长(3~5)
    this.cargoCap = 50 + this.up.cargo * 30;
    this.maxShield = 40 + this.up.shield * 25;       // 护盾能量上限
    this.shieldRegen = 9 + this.up.shield * 3;        // 每秒回充量
    this.shieldRegenDelay = 3.0;                       // 受击后延迟回充时间
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

    // 射击（不同武器使用各自冷却）
    this.fireTimer -= dt;
    const cd = this.weapon === 1 ? this.spreadCD : this.fireCD;
    if (Input.isDown(' ') && this.fireTimer <= 0) {
      this.shoot();
      this.fireTimer = cd;
    }
    if (this.invuln > 0) this.invuln -= dt;
    // 护盾自动回充（受击后先等待 shieldRegenDelay 秒）
    if (this.shieldDelay > 0) this.shieldDelay -= dt;
    else if (this.shield < this.maxShield) this.shield = Math.min(this.maxShield, this.shield + this.shieldRegen * dt);
  }

  shoot() {
    const fx = Math.sin(this.angle), fy = -Math.cos(this.angle);
    const bx = this.x + fx * 16, by = this.y + fy * 16;
    if (this.weapon === 1) {
      // 散射炮：以船头为中心呈扇形发射多发
      const n = this.spreadCount, span = 0.52, half = span / 2;
      for (let i = 0; i < n; i++) {
        const off = n === 1 ? 0 : -half + span * i / (n - 1);
        const ca = Math.cos(off), sa = Math.sin(off);
        const rx = fx * ca - fy * sa, ry = fx * sa + fy * ca;
        Game.bullets.push(new Bullet(bx, by, rx * 540 + this.vx, ry * 540 + this.vy, this.bulletDmg, 'player'));
      }
    } else {
      Game.bullets.push(new Bullet(bx, by, fx * 560 + this.vx, fy * 560 + this.vy, this.bulletDmg, 'player'));
    }
    Game.sfx('shoot');
  }

  switchWeapon() { this.selectWeapon(this.weapon === 0 ? 1 : 0); }
  selectWeapon(w) {
    if (this.weapon === w) return;
    this.weapon = w;
    Game.sfx('buy');
    Game.msg('切换武器：' + (w === 0 ? '主炮' : '散射炮'));
    Game.updateWeaponTag();
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
  }

  update(dt) {
    const p = Game.player;
    const d = Utils.dist(this.x, this.y, p.x, p.y);
    const toAng = Utils.angleTo(this.x, this.y, p.x, p.y);
    const maxSp = 150 * this.race.speed;
    let desired = toAng;     // 期望朝向
    let accel = 240 * this.race.speed;

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

  hit(dmg) {
    this.hp -= dmg;
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
  constructor(x, y, vx, vy, dmg, owner, color) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.dmg = dmg; this.owner = owner;
    this.color = color || (owner === 'player' ? '#9be7ff' : '#ff7a6b');
    this.life = 1.6; this.radius = 3;
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt;
  }
  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.save(); ctx.shadowColor = this.color; ctx.shadowBlur = 6;
    ctx.fillRect(this.x - 2, this.y - 2, 4, 4);
    ctx.restore();
  }
}

class Pickup {
  constructor(x, y, type, amount) {
    this.x = x; this.y = y;
    this.vx = Utils.rand(-30, 30); this.vy = Utils.rand(-30, 30);
    this.type = type; this.amount = amount;
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
    if (this.type === 'fuel') {
      ctx.save();
      ctx.translate(this.x, this.y); ctx.rotate(this.spin);
      ctx.fillStyle = '#6dffb0'; ctx.shadowColor = '#6dffb0'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
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
