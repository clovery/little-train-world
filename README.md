# 小小火车站 · Vite + TypeScript + Phaser

适合亲子共玩的二维绘本火车网站。9 辆火车、5 类风景、4 条预设旅程和可点选拼接的自定义路线。所有插画均包含在项目中，无需后端或 API 密钥。

## 运行

使用 Node.js 22.18+（或更新的受支持版本）。

```bash
npm ci
npm run dev
```

打开终端显示的本地地址。手机和平板可在同一网络中使用开发服务器输出的 Network 地址。

```bash
npm run typecheck   # TypeScript 类型检查
npm test            # 路段连续性、边界和可见范围测试
npm run build       # 生成 dist/
npm run preview     # 本地预览生产构建
```

源码包同时附带已构建的 dist/。只试玩无需安装 Node 依赖：

```bash
python3 -m http.server 8080 --directory dist --bind 127.0.0.1
```

访问 http://localhost:8080 。不要用 file:// 直接打开 HTML。

## 功能

- 火车：蒸汽火车、高速列车、货运火车、地铁、有轨电车、卧铺列车、山地列车、经典客车、铁路工程车。
- 风景：田野小镇、森林瀑布、蓝色海岸、雪山世界、金色沙漠。
- 4 条预设路线；自定义路线支持 2–8 段，添加、撤回、打乱顺序。
- 平滑启动和减速、三档游玩速度、鸣笛、9 辆火车的车门动画、蒸汽机车车轮与蒸汽动画。
- 白天与夜晚切换、车灯、中文语音科普、静音、到站重开。
- 场景隐藏或打开路线拼接面板时暂停；发车前自动关门，行驶时禁止开门。

不同列车在本游戏中都使用同一条示意铁路，速度是游玩速度，不代表真实运营速度；山地路线为简化缓坡，不模拟真实车辆动力学。科普列车为类型示意插画，不代表特定车型。

## 工程结构

- `src/main.ts`：网页按钮、选车、路线拼接、语音与 Phaser 状态连接。
- `src/data/catalog.ts`：列车和风景目录、科普文案、预设路线。
- `src/game/TrainScene.ts`：Phaser 场景、分块渲染、轨道、列车动画和驾驶状态。
- `src/game/route.ts`：纯 TypeScript 路段生成、坡度和可见范围计算。
- `src/game/audio.ts`：Web Audio 鸣笛与 SpeechSynthesis 语音。
- `src/style.css`：响应式网页界面。
- `public/assets/`：图片资源，独立于构建产物。
- `tests/route.test.ts`：路段拼接测试。
- `vite.config.ts`：Vite 构建配置，Phaser 单独拆分。

## 地形如何拼接

每块地形长 1200 个逻辑单位，背景右侧延伸 140 单位；下一块背景的左侧透明度从 0 过渡到 1，让两种风景交叠。铁路使用独立的纹理条带，按地形高度采样渲染。

相邻路段共享同一个边界高度，使用 smoothstep 插值，连接点的坡度为 0。列车读取同一高度和坡度函数，因此车轮接地点与轨道同步。当前是二维插画分块拼接加简化高度曲线，不是三维地形网格，也不包含可穿行的桥梁或隧道实体。

只维护可见范围内的背景对象，驶出范围就销毁；轨道使用固定数量的可复用片段，不随旅程增长而无限创建对象。场景支持 Phaser 自动选择 WebGL 或 Canvas。

## 扩展

添加列车：将透明 PNG 放进 `public/assets/`，在 `catalog.ts` 扩展 `TrainId` 和 `trains`。车门素材使用同名 `door-<id>.png`，位置用相对于整张火车图的归一化比例声明；没有车门素材时可省略 `door`。

添加风景：放入 `biome-<id>.webp`（推荐 1200×600），扩展 `BiomeId` 与 `biomes`。底部约 20% 保持开阔，为独立轨道留出位置。再把新风景加入 `journeys`，或从拼接面板选择。

语音由浏览器及操作系统提供，中文音色是否可用取决于设备。没有语音时依然显示文字。场景使用生成插画，不依赖远程图片服务。

## 引擎选择

本项目使用 Phaser 3.90：Scene、Camera/Scale、纹理、输入、帧循环都在同一套框架中，适合这类二维互动游戏。Vite 负责开发和构建，TypeScript 负责类型。

PixiJS 适合更自由的二维渲染，但需要自行组织更多游戏逻辑；Three.js/Babylon.js 更适合真正的三维列车和世界；Godot 适合需要编辑器、二维/三维场景制作及独立游戏导出的项目。当前以网页与 TypeScript 为目标，Phaser 更直接。

参考：
- https://phaser.io/news/2024/01/phaser-vite-typescript-template
- https://docs.phaser.io/
- https://pixijs.com/8.x/guides/getting-started/intro

## 验证范围

已运行 TypeScript 检查、地形拼接自动测试及 Vite 生产构建，并检查本地资源完整性。未进行浏览器端视觉或端到端测试。
