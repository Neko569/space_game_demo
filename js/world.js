/* ============================================================
 * world.js — 程序化星系生成（种子化，可复现）
 * 每个星系包含：名称、主导种族、小行星带、敌舰、虫洞、空间站、星空与星云。
 * ============================================================ */

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const WorldGen = {
  nameParts: {
    p: ['泽', '赫', '卡', '诺', '瑞', '奥', '赛', '维', '图', '伦', '艾', '西', '星', '幽', '焰'],
    c: ['塔', '拉', '恩', '洛', '维', '斯', '昂', '尔', '克', '修', '纳', '迦'],
    s: ['星系', '星域', '深空', '座', '带', '环', '渊', '界', '海'],
  },
  genName(rng) {
    const P = this.nameParts;
    const n = Utils.choice(P.p) + Utils.choice(P.c) + (rng() < 0.5 ? Utils.choice(P.c) : '') + Utils.choice(P.s);
    const tag = Utils.choice(['', '', ' α', ' β', ' γ', ' IX', ' VII']);
    return n + tag;
  },

  build(seed, isFirst) {
    const rng = mulberry32(seed);
    const w = CONFIG.WORLD;
    const cr = () => rng();                 // 0..1 随机
    const ri = (a, b) => Math.floor(cr() * (b - a + 1)) + a;
    const rf = (a, b) => cr() * (b - a) + a;

    // 主导种族
    const race = isFirst ? RACE_BY_ID.zar : Utils.choice(HOSTILE_RACES);
    const name = this.genName(rng) + (isFirst ? '（母港附近）' : '');

    // 星空背景
    const stars = [];
    for (let i = 0; i < CONFIG.STAR_COUNT; i++) {
      stars.push({ x: cr() * w, y: cr() * w, s: rf(0.5, 1.8), b: rf(0.3, 1) });
    }
    // 星云（带种族色调）
    const nebula = [];
    const nebCount = ri(2, 3);
    for (let i = 0; i < nebCount; i++) {
      nebula.push({
        x: cr() * w, y: cr() * w, r: rf(300, 600),
        hue: ri(0, 360), a: rf(0.05, 0.12),
      });
    }

    // 小行星带（资源类型偏向该种族掉落物）
    const asteroids = [];
    const astCount = ri(15, 23);
    const others = CONFIG.RESOURCE_TYPES.filter(t => t !== race.drop);
    for (let i = 0; i < astCount; i++) {
      const r = rf(12, 32);
      const x = rf(60, w - 60), y = rf(60, w - 60);
      const type = cr() < 0.5 ? race.drop : Utils.choice(others);
      asteroids.push(new Asteroid(x, y, r, type));
    }

    // 敌舰（避开中心出生点）
    const enemies = [];
    const baseCount = isFirst ? 3 : Math.round(ri(6, 10) * (0.7 + race.aggression * 0.4));
    for (let i = 0; i < baseCount; i++) {
      let x, y, tries = 0;
      do {
        x = rf(80, w - 80); y = rf(80, w - 80); tries++;
      } while (Utils.dist(x, y, w / 2, w / 2) < 560 && tries < 30);
      enemies.push(new Enemy(x, y, race));
    }

    // 虫洞（1~2 个，远离出生点）
    const wormholes = [];
    const whCount = isFirst ? 1 : ri(1, 2);
    for (let i = 0; i < whCount; i++) {
      let x, y, tries = 0;
      do { x = rf(200, w - 200); y = rf(200, w - 200); tries++; }
      while (Utils.dist(x, y, w / 2, w / 2) < 700 && tries < 30);
      wormholes.push(new Wormhole(x, y));
    }

    // 空间站（玩家可停靠，靠近出生点便于早期升级）
    let sx, sy, tries = 0;
    do { sx = rf(200, w - 200); sy = rf(200, w - 200); tries++; }
    while (Utils.dist(sx, sy, w / 2, w / 2) < 320 && tries < 40);
    const station = new Station(sx, sy);

    return { seed, name, race, stars, nebula, asteroids, enemies, wormholes, station };
  },
};
