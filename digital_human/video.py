"""视频合成：把逐帧画面与语音音频拼成最终的 mp4。"""

import numpy as np
from moviepy import AudioFileClip, ImageSequenceClip

from .audio import envelope_from_audio
from .face import FaceRenderer


def _blink_value(frame_index: int, fps: int) -> float:
    """每隔几秒做一次快速眨眼，返回该帧的闭眼程度 0..1。"""
    period = max(1, int(fps * 3.5))
    phase = frame_index % period
    blink_frames = max(2, int(fps * 0.12))
    if phase < blink_frames:
        # 前半闭眼、后半睁眼，形成一次完整眨眼
        half = blink_frames / 2
        if phase < half:
            return (phase + 1) / half
        return max(0.0, 1.0 - (phase - half) / half)
    return 0.0


def build_video(audio_path, out_path, size=(720, 720), fps: int = 25):
    """读取音频，逐帧渲染会说话的脸，并与音频合成为 mp4，返回输出路径。"""
    envelope, _duration = envelope_from_audio(audio_path, fps)
    renderer = FaceRenderer(size)

    frames = [
        renderer.render(mouth_open=float(level), blink=_blink_value(i, fps))
        for i, level in enumerate(envelope)
    ]

    video = ImageSequenceClip(frames, fps=fps)
    audio = AudioFileClip(str(audio_path))
    video = video.with_audio(audio)
    try:
        video.write_videofile(
            str(out_path),
            fps=fps,
            codec="libx264",
            audio_codec="aac",
            logger=None,
        )
    finally:
        video.close()
        audio.close()
    return out_path
