/* ============================================================
 * races.js — 星际种族定义
 * 每个种族拥有独特配色、飞船属性、AI 行为与掉落资源，
 * 构成"各具特色"的宇宙生态。玩家自身为 human（人类联邦）。
 * ============================================================ */

const RACES = [
  {
    id: 'human', name: '人类联邦', short: '联邦',
    color: '#4f9dff', cockpit: '#cfeeff',
    behavior: 'balanced',
    hp: 30, speed: 1.0, dmg: 9, fireRate: 0.5, drop: 'mineral',
    aggression: 0.5,
    desc: '你所属的星际联邦。战舰均衡可靠，是探索深空的基石。',
  },
  {
    id: 'zar', name: '扎尔虫族', short: '虫族',
    color: '#7ed957', cockpit: '#d6ffb0',
    behavior: 'swarm',
    hp: 14, speed: 1.6, dmg: 5, fireRate: 0.32, drop: 'energy',
    aggression: 0.95,
    desc: '群居掠食者。单体脆弱、移动极快、火力密集，靠数量淹没敌人。',
  },
  {
    id: 'lumen', name: '晶灵族', short: '晶灵',
    color: '#b06bff', cockpit: '#e8c9ff',
    behavior: 'kite',
    hp: 24, speed: 1.15, dmg: 13, fireRate: 0.7, drop: 'energy',
    aggression: 0.6,
    desc: '纯能量生命体。护盾厚重、远程压制凶猛，擅长风筝走位。',
  },
  {
    id: 'iron', name: '铁卫机械', short: '铁卫',
    color: '#ff6b5a', cockpit: '#ffd0c8',
    behavior: 'tank',
    hp: 50, speed: 0.7, dmg: 15, fireRate: 0.95, drop: 'rare',
    aggression: 0.55,
    desc: '远古战争机械。皮糙肉厚、火力凶猛，但转身笨重、速度迟缓。',
  },
  {
    id: 'nomad', name: '游商族', short: '游商',
    color: '#ffd24a', cockpit: '#fff3c4',
    behavior: 'trader',
    hp: 32, speed: 1.25, dmg: 0, fireRate: 0, drop: 'rare',
    aggression: 0,
    desc: '中立游商。见到你就逃，追上可缴获大量稀有资源，从不主动攻击。',
  },
];

const RACE_BY_ID = {};
for (const r of RACES) RACE_BY_ID[r.id] = r;

// 可作为星系"主导种族"的敌对/中立种族（排除玩家自身）
const HOSTILE_RACES = RACES.filter(r => r.id !== 'human');
