# 星渊探险 · Star Abyss

开放宇宙 · 资源收集 · 飞船升级 · 虫洞跳跃 · 星际种族战斗 —— 纯前端像素风太空探险游戏。

## ▶ 运行
直接用浏览器打开 `index.html` 即可游玩，**无需构建、无需服务器、零外部依赖**。

## 🎮 操作
| 按键 | 动作 |
|------|------|
| `W` / `↑` | 推进（消耗燃料） |
| `S` / `↓` | 减速制动 |
| `A` `D` / `←` `→` | 转向 |
| `空格` | 开火 |
| `E` | 靠近空间站时停靠（维修 / 补给 / 升级） |
| `M` | 静音 |

## 👾 星际种族
- **人类联邦**（你）：均衡可靠
- **扎尔虫族**：群涌战术，快而脆弱
- **晶灵族**：远程风筝，护盾厚重
- **铁卫机械**：钢铁洪流，皮糙肉厚
- **游商族**：中立逃跑，追上缴获稀有金属

## ☁ 部署到 GitHub Pages
本仓库已包含 `.nojekyll`，推送后到仓库 **Settings → Pages → Source** 选择 `main` 分支 `/root` 即可；
或直接用 `gh` 启用：
```bash
gh api repos/<你>/star-abyss/pages -X POST -f source='{"branch":"main","path":"/"}'
```

## 📁 结构
```
index.html          入口
css/style.css       深空 UI
js/utils.js         配置 / 数学 / 输入
js/sprites.js       像素精灵预渲染
js/races.js         种族定义
js/entities.js      飞船/小行星/敌人AI/子弹/虫洞/粒子
js/world.js         种子化程序化星系生成
js/game.js          主循环 / 碰撞 / HUD / 升级
```
