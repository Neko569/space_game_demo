/* ============================================================
 * utils.js — 全局配置、数学工具、输入管理
 * 经典脚本（非 ES module），可直接 file:// 打开
 * ============================================================ */

// ---- 全局配置 ----
const CONFIG = {
  WIDTH: 960,
  HEIGHT: 600,
  WORLD: 3600,          // 单个星系世界尺寸（正方形，边界限制）
  PIXEL: 3,             // 像素精灵放大倍数（精灵本身为小尺寸网格）
  STAR_COUNT: 240,      // 背景星点数量
  RESOURCE_TYPES: ['mineral', 'energy', 'rare'],
  RESOURCE_NAMES: { mineral: '矿物', energy: '能量晶体', rare: '稀有金属' },
  // 资源配色（HUD/拾取物）
  RESOURCE_COLORS: { mineral: '#9fb4c7', energy: '#5ad7ff', rare: '#ffcf5a' },
  START_FUEL: 100,
  START_HP: 100,
};

// ---- 数学/工具 ----
const Utils = {
  rand(min, max) { return Math.random() * (max - min) + min; },
  randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },
  choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); },
  lerp(a, b, t) { return a + (b - a) * t; },
  dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); },
  dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; },
  angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); },
  // 角度归一化到 [-PI, PI]
  normAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  },
};

// ---- 输入管理 ----
const Input = {
  keys: {},
  pressed: {},   // 本帧刚按下（边沿触发）
  init() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys[k]) this.pressed[k] = true;
      this.keys[k] = true;
      // 阻止空格/方向键滚动页面
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
  },
  isDown(...ks) { return ks.some(k => this.keys[k]); },
  justPressed(...ks) { return ks.some(k => this.pressed[k]); },
  // 每帧末尾清理边沿状态
  endFrame() { this.pressed = {}; },
};
