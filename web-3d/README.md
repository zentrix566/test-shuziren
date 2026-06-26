# Web 3D 数字人 (web-3d)

在网页里渲染一个 **3D 人物（VRM 模型）**：输入文字，浏览器自带语音朗读，角色实时开口、眨眼。使用 WebGL 渲染，**没有独立显卡也能跑**。

## 主要功能

- three.js 实时渲染 VRM 3D 角色，自然站姿 + 呼吸/摇摆/眨眼，「挥手打招呼」动作
- **豆包（火山引擎）神经语音**：输入文字 → 后端调豆包 TTS → 角色用**真实音量**驱动口型，更自然更准
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

本地预览构建产物：

```bash
npm run preview
```

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
web-3d/
├── index.html            # 页面与 UI
├── server.mjs            # 豆包 TTS 中转后端（读 .env 里的 Key）
├── .env.example          # 环境变量模板（复制为 .env 填写）
├── src/
│   ├── main.ts           # 入口：UI 绑定、加载模型、拖拽换装
│   ├── viewer.ts         # three 场景/相机/灯光/渲染循环、驱动 VRM、姿势与动作
│   ├── lipsync.ts        # 豆包语音 + 真实音量口型；浏览器语音兜底
│   └── style.css         # 界面样式
├── public/models/        # 内置示例 VRM（不提交）
├── scripts/fetch-model.mjs
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 作者

zentrix566

## 许可证

本项目使用仓库根目录的 [MIT License](../LICENSE)。VRM 模型文件版权归各自作者，请遵循其许可证。
