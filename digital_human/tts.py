"""文字转语音：基于 edge-tts，免费、无需 API key、中文音色自然。"""

import asyncio

import edge_tts

# 默认中文女声主播音色
DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"


async def _synthesize(text: str, voice: str, out_path: str, rate: str, volume: str) -> None:
    communicate = edge_tts.Communicate(text, voice, rate=rate, volume=volume)
    await communicate.save(out_path)


def text_to_speech(
    text: str,
    out_path,
    voice: str = DEFAULT_VOICE,
    rate: str = "+0%",
    volume: str = "+0%",
):
    """把文字合成为语音并保存为 mp3，返回输出路径。

    这一步会访问微软在线 TTS 服务，需要联网。
    rate/volume 用 edge-tts 的相对写法，例如 "+10%" / "-10%"。
    """
    text = (text or "").strip()
    if not text:
        raise ValueError("播报文字不能为空")
    asyncio.run(_synthesize(text, voice, str(out_path), rate, volume))
    return out_path
