# 语音播报数字人 (test-shuziren)

输入一段中文文字，自动生成一个**会说话的卡通主播 mp4 视频**：人物嘴型随语音音量开合，并会自然眨眼。整条链路在没有独立显卡的电脑上也能秒级跑完。

## 主要功能

- 文字转语音：基于微软 Edge 在线 TTS（`edge-tts`），免费、无需 API key，中文音色自然
- 近似口型驱动：分析语音逐帧音量包络，驱动卡通主播张合嘴巴
- 程序化绘制主播脸：无需任何图片素材，含眨眼、腮红、领带等细节
- 一键合成 mp4：自动把画面与语音拼成带声音的视频

> 说明：口型是"随音量开合"的**近似效果**，不是逐音素精确口型——这是无独显最小 demo 的合理取舍。合成语音这一步需要联网。

## 运行方式

### 1. 创建并激活虚拟环境

创建项目本地虚拟环境 `env/`：

```bash
python -m venv env
```

激活虚拟环境（按你用的终端选一条）：

```powershell
.\env\Scripts\Activate.ps1
```

```cmd
env\Scripts\activate.bat
```

```bash
source env/Scripts/activate
```

> 上面三条分别对应 PowerShell、CMD、Git Bash。激活成功后命令行前面会出现 `(env)`。
> 若 PowerShell 提示禁止运行脚本，先执行一次 `Set-ExecutionPolicy -Scope Process -Bypass`。
> 也可以不激活，直接用 `.\env\Scripts\python.exe main.py ...`。

### 2. 安装依赖

一条命令装齐所有依赖：

```bash
pip install -r requirements.txt
```

### 3. 生成数字人视频

用默认文案直接生成（输出到 `output/` 目录，按时间戳自动命名）：

```bash
python main.py
```

指定自己的文字与音色：

```bash
python main.py -t "今天天气不错，欢迎收看本期播报" --voice zh-CN-XiaoxiaoNeural
```

> 生成的视频统一放在 `output/` 目录下，文件名形如 `shuziren_20260626_153356.mp4`，每次运行都是新文件，不会互相覆盖。

## 常用命令

从文件读取要播报的文字（UTF-8，推荐稿件较长时用）：

```bash
python main.py -f script.txt
```

自定义输出路径（不传 `-o` 时按时间戳放进 `output/`）：

```bash
python main.py -f script.txt -o output/今日播报.mp4
```

调整画面尺寸与帧率：

```bash
python main.py --size 720x720 --fps 25
```

调整语速（相对值）：

```bash
python main.py -t "稍微说快一点" --rate +15%
```

查看可用的中文音色（需先装好依赖）：

```bash
edge-tts --list-voices
```

### 参数速查

| 短 | 长 | 作用 |
|---|---|---|
| `-t` | `--text` | 直接传要播报的文字 |
| `-f` | `--file` | 从文本文件读取文字（与 `-t` 二选一） |
| `-o` | `--out` | 指定输出路径（不传则在 `output/` 用时间戳命名） |
|  | `--voice` | edge-tts 音色名，默认 `zh-CN-XiaoxiaoNeural` |
|  | `--rate` | 语速调整，如 `+10%` / `-10%` |
|  | `--fps` | 视频帧率，默认 25 |
|  | `--size` | 画面尺寸，如 `720x720` |

## 目录结构

```
test-shuziren/
├── digital_human/        # 核心代码包
│   ├── tts.py            # 文字转语音（edge-tts）
│   ├── audio.py          # 音频能量包络分析，驱动嘴型
│   ├── face.py           # 程序化绘制会动的卡通主播脸
│   └── video.py          # 帧序列 + 音频 -> mp4
├── main.py               # 命令行入口
├── script.txt            # 示例稿件（配合 -f 使用）
├── output/               # 生成的视频统一放这里（不提交）
├── requirements.txt      # 依赖清单（已锁版本）
└── env/                  # 本地虚拟环境（不提交）
```

## 后续可扩展

- 用 `--image` 驱动真人照片，配合 Wav2Lip 生成逼真真实口型
- 做成实时播放窗口或网页端

## 作者

zentrix566

## 许可证

本项目使用 [MIT License](LICENSE)。
