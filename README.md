# Web 3D 数字人 · 卖货直播间 (test-shuziren)

在网页里渲染一个 **3D 人物（VRM 模型）**，并把它包装成一个**暖色调的带货直播间**：输入文字或一键讲解商品，角色实时开口、眨眼、跟随鼠标注视、做表情和手势。使用 WebGL 渲染，**没有独立显卡也能跑**。

## 主要功能

- three.js 实时渲染 VRM 3D 角色，自然站姿 + 呼吸/摇摆/重心转移/眨眼
- **眼睛与头部跟随鼠标**：移动鼠标，角色会看着你；鼠标静止后眼神自然游移
- **情绪表情**：😊笑 / 😮惊讶 / 😠生气 / 😢难过 / 😌放松 一键切换；朗读时还会按文本自动判断情绪
- **动作手势**：挥手 / 点头 / 摇头 / 思考 / 鞠躬，一键触发
- **VRMA 动画**：内置一个演示动作，也可把任意 `.vrma` 动画文件拖进窗口播放全身动作
- **卖货直播间**：暖色渐变背景 + 灯光氛围；商品卡（图/名/卖点/原价划线/到手价/库存）、限时抢购倒计时、「立即抢购」下单提示、多商品切换；直播徽章/在线人数/点赞飘心/滚动弹幕等氛围效果
- **一键讲解**：点商品卡上的「🎤 讲解这件」，主播会挥手并笑着朗读该商品话术
- **豆包（火山引擎）神经语音**：输入文字 → 后端调豆包 TTS → 角色用**真实音量 + 频谱粗估的多种嘴型**驱动口型，更自然更准
- 兜底语音：未配置豆包 Key 时自动改用浏览器自带 Web Speech API
- 把任意 `.vrm` 文件拖进窗口即可替换形象

> 豆包语音需要一个本地中转后端（避免 API Key 暴露在前端），见下方「配置豆包语音」。

## 运行方式

### 1. 安装依赖

```bash
npm install
```

### 2. 下载内置示例模型（首次必做）

```bash
npm run fetch-model
```

会把示例 VRM 下载到 `public/models/avatar.vrm`（约 10 MB，因体积与版权不提交进仓库）。

### 2.1 下载内置示例动作（可选）

```bash
npm run fetch-anim
```

会把一个官方演示用的 `.vrma` 动作下载到 `public/anims/demo.vrma`，对应面板上的「🎬 演示动作」按钮。不下载也不影响其它功能，按钮会自动禁用。想要更多动作，直接把任意 `.vrma` 文件**拖进窗口**即可播放（见下方「动作与动画」）。

### 3. 配置豆包语音

复制环境变量模板并填入你的 Key：

```bash
cp .env.example .env
```

然后编辑 `.env`，至少填写 `DOUBAO_API_KEY`（其余有默认值）：

```
DOUBAO_API_KEY=你的专属APIKey
DOUBAO_SPEAKER=zh_female_gaolengyujie_uranus_bigtts
```

> `.env` 已被 `.gitignore` 忽略，不会提交。换音色改 `DOUBAO_SPEAKER` 即可。
> 若暂时不配置，朗读会自动退回浏览器自带语音。
> 注意：音色需先在火山控制台为你的账号**开通**，否则会报 `55000000`（resource 与 speaker 不匹配）。下拉默认只放了已验证可用的「女声·VV」，开通更多音色后可用 `DOUBAO_SPEAKERS` 追加。

### 4. 同时启动前端与中转后端（推荐）

```bash
npm run dev:all
```

会同时跑 Vite（前端，默认 http://localhost:5173 ）和 TTS 中转后端（默认 8787 端口）。

也可以分两个终端各自启动：

```bash
npm run server   # 启动 TTS 中转后端
npm run dev       # 启动前端
```

### 5. 构建生产产物（输出到 dist/）

```bash
npm run build
```

> 注意：构建产物只含前端静态文件。线上要用豆包语音，需要单独把 `server.mjs` 部署为后端服务，并把前端的 `/api` 指向它。

## 常用命令

重新下载内置示例模型：

```bash
npm run fetch-model
```

下载内置示例动作：

```bash
npm run fetch-anim
```

本地预览构建产物：

```bash
npm run preview
```

## 表情、动作与动画

- **情绪表情**：面板上 5 个表情按钮可手动切换（再点一次回到中性）；朗读时若未手动设过表情，会按文本里的标点/关键词自动判断情绪。
- **手势**：挥手 / 点头 / 摇头 / 思考 / 鞠躬，点一下播放一次，叠加在自然待机姿势之上。
- **注视**：移动鼠标，角色的眼睛和头部会跟着看向你；鼠标静止几秒后眼神自动小幅游移，更像真人。
- **VRMA 动画**：支持 [VRM 标准动画格式 `.vrma`](https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_vrm_animation-1.0)。
  - 内置演示动作：先 `npm run fetch-anim`，再点面板「🎬 演示动作」。
  - 用自己的动作：把任意 `.vrma` 文件**拖进窗口**即可立即播放。可在 [VRoid Hub](https://hub.vroid.com)、[Booth](https://booth.pm)（搜 `VRMA`）等处获取免费/付费动作，注意遵循作者授权。

## 卖货直播间

打开页面默认就是一个带货直播间：

- **商品卡（左下角）**：展示商品图、名称、卖点标签、原价划线 + 到手价、库存，配「🎤 讲解这件」与「立即抢购」按钮，以及限时抢购倒计时。
- **一键讲解**：点「🎤 讲解这件」，主播会挥手并笑着朗读该商品话术（走豆包/浏览器语音）。
- **切换商品**：点商品卡顶部的缩略图切换不同商品。
- **下单**：点「立即抢购」弹出抢购成功提示并飘心，库存随之减少。
- **直播氛围**：顶部「直播中」徽章、在线人数、点赞数，右下角点赞飘心，上方滚动弹幕。
- **主播控制台**：右上角面板（点 ⚙ 折叠/展开），可手动朗读任意文字、选音色、调表情和手势。

> 内置示例商品在 `src/products.ts`，编辑该文件即可换成自己的商品（名称、价格、卖点、库存、带货话术）。商品图用 emoji 占位，换真实图片改 `emoji`/`color` 字段即可。

## 音色（99 种都能用）

有两种方式使用音色：

1. **下拉选择**：下拉里的列表来自 `speakers.json`，可自行编辑（改完重启 `npm run server` 生效）。从火山控制台「音色列表」把你**已开通**的音色加进去即可：

   ```json
   { "speakers": [
     { "id": "zh_female_gaolengyujie_uranus_bigtts", "label": "女声 · 高冷御姐" }
   ] }
   ```

2. **手动输入**：面板上的「或粘贴音色 ID」输入框，粘贴任意音色 ID（如 `zh_female_gaolengyujie_uranus_bigtts`）即可立即试用——**填了输入框就以它为准，覆盖下拉**。适合快速试遍全部音色。

> 注意：音色必须先在火山控制台为你的账号**开通**，未开通的调用会报 `55000000`（resource 与 speaker 不匹配）。

## 模型说明

- 内置示例模型放在 `public/models/avatar.vrm`，启动时默认加载。
- 想用自己的角色：用 [VRoid Studio](https://vroid.com/studio) 免费捏一个并导出 `.vrm`，直接拖进网页即可；也可替换掉 `public/models/avatar.vrm`。

## 目录结构

```
test-shuziren/
├── index.html            # 页面与 UI
├── server.mjs            # 豆包 TTS 中转后端（读 .env 里的 Key）
├── .env.example          # 环境变量模板（复制为 .env 填写）
├── src/
│   ├── main.ts           # 入口：UI 绑定、加载模型、鼠标注视、表情/手势/动画、卖货接线、拖拽换装
│   ├── viewer.ts         # three 场景/相机/灯光/渲染循环、驱动 VRM、姿势/注视/表情/手势、VRMA 动画混合
│   ├── lipsync.ts        # 豆包语音 + 真实音量/频谱多嘴型口型；浏览器语音兜底
│   ├── products.ts       # 内置示例商品数据与类型（换自己的商品改这里）
│   ├── sales.ts          # 卖货直播间控制器：商品卡/切换/倒计时/下单/直播氛围
│   └── style.css         # 界面样式（含暖色背景与带货 UI）
├── public/models/        # 内置示例 VRM（不提交）
├── public/anims/         # 内置示例动作 .vrma（不提交）
├── scripts/fetch-model.mjs
├── scripts/fetch-anim.mjs
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 作者

zentrix566

## 许可证

本项目使用 [MIT License](LICENSE)。VRM 模型文件版权归各自作者，请遵循其许可证。
