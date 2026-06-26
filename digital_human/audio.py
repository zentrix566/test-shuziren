"""音频包络分析：把语音的逐帧音量算成 0..1 的曲线，用来驱动嘴型开合。"""

import numpy as np
from moviepy import AudioFileClip

# 分析用的采样率，对近似口型足够，且更省内存
ANALYSIS_SAMPLE_RATE = 16000


def _smooth(values: np.ndarray, factor: float) -> np.ndarray:
    """一阶指数平滑，避免嘴型在相邻帧之间剧烈抖动。"""
    if factor <= 0:
        return values
    out = values.copy()
    for i in range(1, len(out)):
        out[i] = factor * out[i - 1] + (1.0 - factor) * out[i]
    return out


def envelope_from_audio(audio_path, fps: int, smooth: float = 0.35):
    """读取音频，按视频帧率算出每帧的音量包络。

    返回 (envelope, duration)：
    - envelope 是长度约为 duration*fps 的 0..1 数组，值越大表示该帧嘴张得越大
    - duration 是音频时长（秒）
    """
    clip = AudioFileClip(str(audio_path))
    try:
        duration = float(clip.duration)
        samples = clip.to_soundarray(fps=ANALYSIS_SAMPLE_RATE)
    finally:
        clip.close()

    if samples.ndim > 1:
        samples = samples.mean(axis=1)  # 立体声合并为单声道

    n_frames = max(1, int(round(duration * fps)))
    samples_per_frame = max(1, len(samples) // n_frames)

    env = np.zeros(n_frames, dtype=np.float32)
    for i in range(n_frames):
        start = i * samples_per_frame
        chunk = samples[start : start + samples_per_frame]
        if len(chunk):
            env[i] = float(np.sqrt(np.mean(np.square(chunk))))  # 该帧的 RMS 能量

    peak = float(env.max())
    if peak > 1e-6:
        env = env / peak

    # 做一点非线性提升，让小音量也能看出张嘴；再平滑掉抖动
    env = np.power(env, 0.6)
    env = _smooth(env, smooth)
    return env, duration
