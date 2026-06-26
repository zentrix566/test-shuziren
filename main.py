"""命令行入口：文字 -> 会说话的数字人 mp4。"""

import argparse
import tempfile
from datetime import datetime
from pathlib import Path

from digital_human.tts import DEFAULT_VOICE, text_to_speech
from digital_human.video import build_video

DEFAULT_TEXT = "大家好，我是你的数字人主播，很高兴见到你。"

# 生成的视频统一放到这个目录，避免散落在项目各处
OUTPUT_DIR = Path("output")


def parse_size(value: str):
    width, height = value.lower().split("x")
    return int(width), int(height)


def resolve_text(args) -> str:
    if args.file:
        return Path(args.file).read_text(encoding="utf-8")
    if args.text:
        return args.text
    return DEFAULT_TEXT


def default_output_name() -> Path:
    """没有指定 --out 时，在 output/ 目录下用时间戳生成文件名，避免覆盖之前的视频。"""
    return OUTPUT_DIR / f"shuziren_{datetime.now():%Y%m%d_%H%M%S}.mp4"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="语音播报数字人：输入文字，输出一个会说话的卡通主播 mp4。"
    )
    parser.add_argument("-t", "--text", help="要播报的文字（与 -f 二选一）")
    parser.add_argument("-f", "--file", help="从 UTF-8 文本文件读取要播报的文字")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help="edge-tts 音色名")
    parser.add_argument(
        "-o", "--out", help="输出 mp4 路径（默认按时间戳自动命名）"
    )
    parser.add_argument("--fps", type=int, default=25, help="视频帧率")
    parser.add_argument(
        "--size", type=parse_size, default=(720, 720), help="画面尺寸，例如 720x720"
    )
    parser.add_argument("--rate", default="+0%", help="语速调整，例如 +10% / -10%")
    args = parser.parse_args()

    text = resolve_text(args)
    out_path = Path(args.out) if args.out else default_output_name()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp_dir:
        speech_path = Path(tmp_dir) / "speech.mp3"
        print("[1/2] 正在合成语音（需要联网）...")
        text_to_speech(text, speech_path, voice=args.voice, rate=args.rate)
        print("[2/2] 正在渲染画面并合成视频 ...")
        build_video(speech_path, out_path, size=args.size, fps=args.fps)

    print(f"完成 ✅ 已生成：{out_path}")


if __name__ == "__main__":
    main()
