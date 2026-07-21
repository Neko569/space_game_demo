/* ============================================================
 * classes.js — 职业 / 技能树 / 主动技能（无主星渊风格）
 * 每个职业：1 被动（常驻）+ 1 主动技能（CD）+ 3 系天赋树。
 * 技能点由升级获得，分配到节点后即时生效。
 * ============================================================ */

const CLASSES = [
  {
    id: 'ranger', name: '游侠', color: '#ff9b2f', icon: '🛡',
    desc: '均衡型拾荒者。被动：护盾回充加速；主动：纳米护盾爆发（瞬时回满护盾）。',
    passive: { shieldRegenMul: 1.5 },
    active: { id: 'shieldBurst', name: '护盾爆发', cd: 18, desc: '瞬间回满护盾能量' },
    trees: [
      { name: '坚韧', nodes: [
        { id: 'hp1', name: '船体强化', desc: '+30 最大生命', cost: 1 },
        { id: 'hp2', name: '复合装甲', desc: '+60 最大生命', cost: 2, req: 'hp1' },
        { id: 'shd1', name: '护盾扩容', desc: '+25 最大护盾', cost: 1 },
        { id: 'shd2', name: '相位护盾', desc: '+50 最大护盾', cost: 2, req: 'shd1' },
      ]},
      { name: '机动', nodes: [
        { id: 'spd1', name: '推进强化', desc: '+40 最高速度', cost: 1 },
        { id: 'spd2', name: '矢量喷口', desc: '+80 最高速度', cost: 2, req: 'spd1' },
        { id: 'fuel1', name: '燃料优化', desc: '+40 最大燃料', cost: 1 },
      ]},
      { name: '战斗', nodes: [
        { id: 'dmg1', name: '武器校准', desc: '+10% 伤害', cost: 1 },
        { id: 'dmg2', name: '过载射击', desc: '+25% 伤害', cost: 2, req: 'dmg1' },
        { id: 'cd1', name: '技能冷却', desc: '-20% 主动冷却', cost: 2 },
      ]},
    ],
  },
  {
    id: 'engineer', name: '工程师', color: '#5ad7ff', icon: '🔧',
    desc: '科技型支援者。被动：弹药容量加成；主动：部署维修无人机（持续回血 6 秒）。',
    passive: { magMul: 1.4 },
    active: { id: 'drone', name: '维修无人机', cd: 22, desc: '6 秒内持续恢复生命' },
    trees: [
      { name: '科技', nodes: [
        { id: 'mag1', name: '弹匣扩展', desc: '+25% 弹匣', cost: 1 },
        { id: 'mag2', name: '供弹系统', desc: '+50% 弹匣', cost: 2, req: 'mag1' },
        { id: 'rld1', name: '快速装填', desc: '-25% 换弹时间', cost: 1 },
      ]},
      { name: '生存', nodes: [
        { id: 'hp1', name: '船体强化', desc: '+30 最大生命', cost: 1 },
        { id: 'hp2', name: '复合装甲', desc: '+60 最大生命', cost: 2, req: 'hp1' },
        { id: 'shd1', name: '护盾扩容', desc: '+25 最大护盾', cost: 1 },
      ]},
      { name: '战斗', nodes: [
        { id: 'dmg1', name: '武器校准', desc: '+10% 伤害', cost: 1 },
        { id: 'dmg2', name: '过载射击', desc: '+25% 伤害', cost: 2, req: 'dmg1' },
        { id: 'cd1', name: '技能冷却', desc: '-20% 主动冷却', cost: 2 },
      ]},
    ],
  },
  {
    id: 'mystic', name: '秘术师', color: '#c07bff', icon: '🔮',
    desc: '元素型输出者。被动：元素伤害加成；主动：元素过载（8 秒内所有伤害附带随机元素）。',
    passive: { elementMul: 1.3 },
    active: { id: 'overload', name: '元素过载', cd: 25, desc: '8 秒内攻击附带随机元素效果' },
    trees: [
      { name: '元素', nodes: [
        { id: 'el1', name: '元素亲和', desc: '+15% 元素伤害', cost: 1 },
        { id: 'el2', name: '元素掌控', desc: '+30% 元素伤害', cost: 2, req: 'el1' },
        { id: 'dot1', name: '持续灼烧', desc: '+50% DoT 时长', cost: 2 },
      ]},
      { name: '生存', nodes: [
        { id: 'hp1', name: '船体强化', desc: '+30 最大生命', cost: 1 },
        { id: 'shd1', name: '护盾扩容', desc: '+25 最大护盾', cost: 1 },
        { id: 'shd2', name: '相位护盾', desc: '+50 最大护盾', cost: 2, req: 'shd1' },
      ]},
      { name: '战斗', nodes: [
        { id: 'dmg1', name: '武器校准', desc: '+10% 伤害', cost: 1 },
        { id: 'dmg2', name: '过载射击', desc: '+25% 伤害', cost: 2, req: 'dmg1' },
        { id: 'cd1', name: '技能冷却', desc: '-20% 主动冷却', cost: 2 },
      ]},
    ],
  },
];

const CLASS_BY_ID = {};
for (const c of CLASSES) CLASS_BY_ID[c.id] = c;

// 经验曲线：升到下一级所需 = base * level^growth
function xpForLevel(lvl) {
  return Math.round(CONFIG.XPCURVE.base * Math.pow(lvl, CONFIG.XPCURVE.growth));
}

// 应用技能点到玩家属性（每次分配/重算时调用）
function applySkills(player) {
  const cls = CLASS_BY_ID[player.classId];
  if (!cls) return;
  const sp = player.spentPoints || {};
  // 重置派生属性基础值，再叠加
  // （由 recompute 先算基础，这里只叠加增量）
  if (sp.hp1) player.maxHp += 30;
  if (sp.hp2) player.maxHp += 60;
  if (sp.shd1) player.maxShield += 25;
  if (sp.shd2) player.maxShield += 50;
  if (sp.spd1) player.maxSpeed += 40;
  if (sp.spd2) player.maxSpeed += 80;
  if (sp.fuel1) player.maxFuel += 40;
  if (sp.mag1) player._magMul = (player._magMul || 1) + 0.25;
  if (sp.mag2) player._magMul = (player._magMul || 1) + 0.50;
  if (sp.rld1) player._reloadMul = (player._reloadMul || 1) * 0.75;
  if (sp.el1) player._elementMul = (player._elementMul || 1) + 0.15;
  if (sp.el2) player._elementMul = (player._elementMul || 1) + 0.30;
  if (sp.dot1) player._dotMul = (player._dotMul || 1) + 0.5;
  if (sp.dmg1) player._dmgMul = (player._dmgMul || 1) + 0.10;
  if (sp.dmg2) player._dmgMul = (player._dmgMul || 1) + 0.25;
  if (sp.cd1) player._cdMul = (player._cdMul || 1) * 0.80;
}

// 主动技能效果
function triggerActive(player) {
  const cls = CLASS_BY_ID[player.classId];
  if (!cls || player.activeCd > 0) return false;
  const cdMul = player._cdMul || 1;
  player.activeCd = cls.active.cd * cdMul;
  const a = cls.active.id;
  if (a === 'shieldBurst') {
    player.shield = player.maxShield;
    Game.flash('#5ad7ff'); Game.msg('护盾爆发：能量回满！');
  } else if (a === 'drone') {
    player.droneT = 6.0;
    Game.msg('维修无人机已部署，持续修复 6 秒。');
  } else if (a === 'overload') {
    player.overloadT = 8.0;
    Game.msg('元素过载：8 秒内攻击附带随机元素！');
  }
  Game.sfx('buy');
  return true;
}
