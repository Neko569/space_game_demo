/* ============================================================
 * weapons.js — 程序化武器生成（无主星渊风格）
 * 部件（厂商/元素/稀有度/等级）随机组合 → 属性 + 随机命名。
 * ============================================================ */

// 枪型基础模板
const WEAPON_BASES = [
  { id: 'pistol',   name: '手枪',   damage: 9,  fireRate: 0.32, mag: 12, reload: 1.1, proj: 1, spread: 0.045, speed: 560 },
  { id: 'smg',      name: '冲锋枪', damage: 5,  fireRate: 0.09, mag: 30, reload: 1.4, proj: 1, spread: 0.13,  speed: 540 },
  { id: 'rifle',    name: '步枪',   damage: 14, fireRate: 0.18, mag: 22, reload: 1.5, proj: 1, spread: 0.05,  speed: 620 },
  { id: 'shotgun',  name: '霰弹枪', damage: 4,  fireRate: 0.70, mag: 6,  reload: 1.6, proj: 7, spread: 0.34,  speed: 500 },
  { id: 'sniper',   name: '狙击枪', damage: 42, fireRate: 1.10, mag: 5,  reload: 1.8, proj: 1, spread: 0.012, speed: 820 },
  { id: 'launcher', name: '火箭筒', damage: 30, fireRate: 1.30, mag: 3,  reload: 2.2, proj: 1, spread: 0.02,  speed: 420 },
];

const WeaponGen = {
  // 按等级/难度加权抽取稀有度
  rollRarity(level, diff) {
    const lvl = Math.max(1, level || 1);
    const boost = (lvl - 1) * 0.04 + (diff ? (diff - 0.55) * 0.12 : 0);
    const weights = CONFIG.RARITIES.map((r, i) =>
      r.weight * (i === 0 ? 1 : Math.pow(1 + boost, i)));
    const total = weights.reduce((a, b) => a + b, 0);
    let x = Math.random() * total;
    for (let i = 0; i < CONFIG.RARITIES.length; i++) {
      x -= weights[i];
      if (x <= 0) return CONFIG.RARITIES[i].id;
    }
    return 'common';
  },

  // 抽取元素（越稀有越可能有元素；弗拉德厂商偏爱元素；opts.force 可强制偏好）
  rollElement(rarityId, man, force) {
    if (force && Math.random() < 0.6) return force;   // 60% 概率落到偏好元素
    const idx = CONFIG.RARITIES.findIndex(r => r.id === rarityId);
    const noneW = Utils.clamp(0.42 - idx * 0.06, 0.12, 0.5);
    const elems = ['none', 'fire', 'shock', 'corrosive', 'cryo'];
    const w = elems.map(e => e === 'none' ? noneW
      : (1 - noneW) / 4 * (man.bias === 'elemental' ? 1.7 : 1) * (e === force ? 2.2 : 1));
    const total = w.reduce((a, b) => a + b, 0);
    let x = Math.random() * total;
    for (let i = 0; i < elems.length; i++) { x -= w[i]; if (x <= 0) return elems[i]; }
    return 'none';
  },

  name(man, element, base, rar) {
    const adj = { none: '', fire: '烈焰', shock: '电涌', corrosive: '腐蚀', cryo: '极寒' }[element];
    const suffixPool = ['黄蜂', '毒蜂', '审判', '风暴', '利刃', '回声', '破晓', '余烬', '寒鸦', '雷神', '游隼', '断罪'];
    let n = man.name + (adj ? ' ' + adj : '') + ' ' + base.name;
    if (rar.id !== 'common') n += '·' + Utils.choice(suffixPool);
    return n;
  },

  // 生成一把武器
  make(level, opts) {
    opts = opts || {};
    const base = Utils.choice(WEAPON_BASES);
    const man = Utils.choice(CONFIG.MANUFACTURERS);
    const rarityId = this.rollRarity(level, opts.diff);
    const element = this.rollElement(rarityId, man, opts.element);
    const rar = CONFIG.RARITIES.find(r => r.id === rarityId);
    const lvl = Math.max(1, level || 1);
    const lscale = 1 + (lvl - 1) * 0.12;

    let damage = base.damage, fireRate = base.fireRate, mag = base.mag, spread = base.spread, reload = base.reload;
    switch (man.bias) {
      case 'damage':    damage *= 1.15; break;
      case 'firerate':  fireRate *= 0.85; break;
      case 'accuracy':  spread *= 0.6; break;
      case 'magazine':  mag = Math.round(mag * 1.4); break;
      case 'tech':      reload *= 0.8; break;
      case 'elemental': damage *= 1.05; break;
    }
    const m = rar.mult;
    damage *= m;
    fireRate /= Math.sqrt(m);
    mag = Math.round(mag * (0.8 + 0.2 * m));
    damage *= lscale;

    const projectiles = base.proj;
    const bulletDmg = damage;
    const perShot = damage * projectiles;
    const dps = perShot / fireRate;

    return {
      base: base.id, baseName: base.name, manufacturer: man.id, element, rarity: rarityId, level: lvl,
      damage, fireRate, magSize: mag, reload, projectiles, spread, bulletSpeed: base.speed,
      bulletDmg, dps, name: this.name(man, element, base, rar), color: rar.color,
    };
  },
};
