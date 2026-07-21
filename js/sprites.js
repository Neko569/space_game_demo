/* ============================================================
 * sprites.js — 像素精灵预渲染（飞船/小行星/空间站）+ 绘制工具
 * 所有精灵在低分辨率 offscreen canvas 上用 fillRect "画像素"，
 * 主画布关闭 imageSmoothing 保证放大后保持锐利像素感。
 * ============================================================ */

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const Sprites = {
  ships: {},       // race.id -> canvas（原生 16x16）
  asteroids: [],   // 预渲染的若干小行星变体
  station: null,
  PX: CONFIG.PIXEL,

  build(races) {
    // 飞船：玩家与各敌对种族（共用形状，按种族配色着色）+ Cell-shaded 描边
    for (const r of races) {
      this.ships[r.id] = this.outline(this.makeShip(r.color, r.cockpit));
    }
    // 小行星变体
    this.asteroids = [];
    const tones = ['#8a7d6b', '#7d8694', '#9c8f7a', '#6f7a6a', '#8d7a86'];
    for (let i = 0; i < 7; i++) {
      this.asteroids.push(this.outline(this.makeAsteroid(Utils.rand(14, 34), Utils.choice(tones))));
    }
    this.station = this.outline(this.makeStation());
  },

  // Cell-shaded：在精灵不透明像素外缘描黑边（漫画风）
  outline(src, color = '#0a0a12', w = 1) {
    const S = src.width, T = src.height;
    const c = newCanvas(S, T);
    const x = c.getContext('2d');
    const sd = src.getContext('2d').getImageData(0, 0, S, T).data;
    const op = (px, py) => (px < 0 || py < 0 || px >= S || py >= T) ? false
      : sd[(py * S + px) * 4 + 3] > 40;
    x.drawImage(src, 0, 0);
    x.fillStyle = color;
    for (let py = 0; py < T; py++) {
      for (let px = 0; px < S; px++) {
        if (op(px, py)) continue;
        let near = false;
        for (let dy = -w; dy <= w && !near; dy++)
          for (let dx = -w; dx <= w && !near; dx++)
            if ((dx || dy) && op(px + dx, py + dy)) { near = true; break; }
        if (near) x.fillRect(px, py, 1, 1);
      }
    }
    return c;
  },

  // 朝"上"的飞船（16x16 网格，单位=1px）
  makeShip(body, cockpit) {
    const S = 16;
    const c = newCanvas(S, S);
    const x = c.getContext('2d');
    const gun = '#7d8794';
    // 机体
    x.fillStyle = body;
    x.fillRect(6, 2, 4, 12);   // 主舰体
    x.fillRect(7, 0, 2, 2);    // 机鼻
    x.fillRect(2, 9, 4, 3);    // 左翼
    x.fillRect(10, 9, 4, 3);   // 右翼
    x.fillRect(1, 10, 1, 2);   // 左翼尖
    x.fillRect(14, 10, 1, 2);  // 右翼尖
    x.fillRect(6, 14, 1, 1);   // 引擎左
    x.fillRect(9, 14, 1, 1);   // 引擎右
    // 座舱
    x.fillStyle = cockpit;
    x.fillRect(7, 4, 2, 4);
    // 机炮
    x.fillStyle = gun;
    x.fillRect(2, 11, 1, 3);
    x.fillRect(13, 11, 1, 3);
    // 高光
    x.fillStyle = 'rgba(255,255,255,0.35)';
    x.fillRect(6, 2, 1, 9);
    return c;
  },

  makeAsteroid(r, color) {
    const size = Math.ceil(r * 2 + 6);
    const c = newCanvas(size, size);
    const x = c.getContext('2d');
    const cx = size / 2, cy = size / 2;
    const pts = 11;
    // 不规则多边形主体
    x.beginPath();
    for (let i = 0; i < pts; i++) {
      const ang = (i / pts) * Math.PI * 2;
      const rr = r + Utils.rand(-r * 0.28, r * 0.28);
      const px = cx + Math.cos(ang) * rr;
      const py = cy + Math.sin(ang) * rr;
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.closePath();
    x.fillStyle = color;
    x.fill();
    // 边缘暗化
    x.lineWidth = 1.5;
    x.strokeStyle = 'rgba(0,0,0,0.35)';
    x.stroke();
    // 陨石坑
    x.fillStyle = 'rgba(0,0,0,0.22)';
    const craters = Utils.randInt(2, 4);
    for (let i = 0; i < craters; i++) {
      const a = Utils.rand(0, Math.PI * 2), d = Utils.rand(0, r * 0.5);
      const cr = Utils.rand(1.5, r * 0.22);
      x.beginPath();
      x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, cr, 0, Math.PI * 2);
      x.fill();
    }
    // 高光点
    x.fillStyle = 'rgba(255,255,255,0.18)';
    x.beginPath();
    x.arc(cx - r * 0.35, cy - r * 0.35, r * 0.18, 0, Math.PI * 2);
    x.fill();
    return c;
  },

  makeStation() {
    const S = 34;
    const c = newCanvas(S, S);
    const x = c.getContext('2d');
    const cx = S / 2, cy = S / 2;
    // 外环
    x.strokeStyle = '#9fb0c4';
    x.lineWidth = 3;
    x.beginPath(); x.arc(cx, cy, 15, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = '#5d6b7d';
    x.lineWidth = 1;
    x.beginPath(); x.arc(cx, cy, 12, 0, Math.PI * 2); x.stroke();
    // 中央枢纽
    x.fillStyle = '#cdd8e6';
    x.fillRect(cx - 5, cy - 5, 10, 10);
    x.fillStyle = '#3fa9ff';
    x.fillRect(cx - 2, cy - 2, 4, 4);
    // 对接臂
    x.fillStyle = '#9fb0c4';
    x.fillRect(cx - 1, cy - 15, 2, 4);
    x.fillRect(cx - 1, cy + 11, 2, 4);
    x.fillRect(cx - 15, cy - 1, 4, 2);
    x.fillRect(cx + 11, cy - 1, 4, 2);
    return c;
  },

  // 绘制一枚已预渲染精灵（带旋转与缩放）
  drawSprite(ctx, canvas, x, y, angle, scaleMul = 1) {
    const s = this.PX * scaleMul;
    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, -canvas.width / 2 * s, -canvas.height / 2 * s,
      canvas.width * s, canvas.height * s);
    ctx.restore();
  },
};
