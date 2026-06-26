"""卡通主播脸渲染：用 Pillow 程序化画一张会说话、会眨眼的脸，零素材即可运行。"""

import numpy as np
from PIL import Image, ImageDraw

# 配色
COLOR_SKIN = (247, 220, 193)
COLOR_SKIN_SHADOW = (228, 196, 168)
COLOR_HAIR = (58, 44, 40)
COLOR_EYE_WHITE = (252, 252, 252)
COLOR_PUPIL = (54, 46, 44)
COLOR_BROW = (70, 52, 46)
COLOR_MOUTH = (146, 58, 60)
COLOR_MOUTH_INNER = (92, 34, 38)
COLOR_TONGUE = (196, 104, 104)
COLOR_SUIT = (44, 56, 84)
COLOR_SHIRT = (236, 238, 243)
COLOR_TIE = (176, 64, 72)


class FaceRenderer:
    """按给定尺寸渲染主播脸。背景与五官比例只算一次，每帧只重画嘴和眼。"""

    def __init__(self, size=(720, 720)):
        self.w, self.h = size
        self.cx = self.w / 2
        self.face_cy = self.h * 0.42
        self.face_rx = self.w * 0.23
        self.face_ry = self.h * 0.28
        self._bg = self._build_static_layer()

    def _build_static_layer(self) -> Image.Image:
        """背景、肩膀、头、头发、鼻子等不随帧变化的部分。"""
        img = Image.new("RGB", (self.w, self.h), COLOR_SUIT)
        draw = ImageDraw.Draw(img)

        # 竖向渐变的演播室背景
        for y in range(self.h):
            t = y / self.h
            draw.line(
                [(0, y), (self.w, y)],
                fill=(int(30 + 18 * t), int(42 + 22 * t), int(66 + 30 * t)),
            )

        cx = self.cx
        # 西装肩膀
        suit_top = self.h * 0.78
        draw.ellipse(
            [cx - self.w * 0.42, suit_top, cx + self.w * 0.42, self.h * 1.25],
            fill=COLOR_SUIT,
        )
        # 衬衫领口
        draw.polygon(
            [
                (cx - self.w * 0.10, suit_top),
                (cx + self.w * 0.10, suit_top),
                (cx, self.h * 0.95),
            ],
            fill=COLOR_SHIRT,
        )
        # 领带
        draw.polygon(
            [
                (cx - self.w * 0.022, suit_top + self.h * 0.01),
                (cx + self.w * 0.022, suit_top + self.h * 0.01),
                (cx + self.w * 0.04, self.h * 0.98),
                (cx - self.w * 0.04, self.h * 0.98),
            ],
            fill=COLOR_TIE,
        )

        # 脖子
        draw.rectangle(
            [cx - self.w * 0.07, self.face_cy + self.face_ry * 0.55,
             cx + self.w * 0.07, suit_top + self.h * 0.02],
            fill=COLOR_SKIN_SHADOW,
        )

        # 头发底层（比脸略大的圆）
        draw.ellipse(
            [cx - self.face_rx * 1.18, self.face_cy - self.face_ry * 1.18,
             cx + self.face_rx * 1.18, self.face_cy + self.face_ry * 0.6],
            fill=COLOR_HAIR,
        )

        # 脸
        self._ellipse(draw, cx, self.face_cy, self.face_rx, self.face_ry, COLOR_SKIN)

        # 刘海
        draw.chord(
            [cx - self.face_rx * 1.02, self.face_cy - self.face_ry * 1.05,
             cx + self.face_rx * 1.02, self.face_cy + self.face_ry * 0.2],
            180, 360, fill=COLOR_HAIR,
        )

        # 鼻子
        nose_y = self.face_cy + self.face_ry * 0.18
        draw.line(
            [(cx, self.face_cy - self.face_ry * 0.05), (cx, nose_y)],
            fill=COLOR_SKIN_SHADOW, width=max(2, int(self.w * 0.006)),
        )
        draw.arc(
            [cx - self.face_rx * 0.12, nose_y - self.face_ry * 0.08,
             cx + self.face_rx * 0.12, nose_y + self.face_ry * 0.06],
            0, 180, fill=COLOR_SKIN_SHADOW, width=max(2, int(self.w * 0.004)),
        )

        # 腮红
        for sign in (-1, 1):
            draw.ellipse(
                [cx + sign * self.face_rx * 0.55 - self.face_rx * 0.13,
                 self.face_cy + self.face_ry * 0.12,
                 cx + sign * self.face_rx * 0.55 + self.face_rx * 0.13,
                 self.face_cy + self.face_ry * 0.28],
                fill=(244, 198, 186),
            )
        return img

    @staticmethod
    def _ellipse(draw, cx, cy, rx, ry, fill):
        draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=fill)

    def render(self, mouth_open: float = 0.0, blink: float = 0.0) -> np.ndarray:
        """渲染一帧。mouth_open、blink 均为 0..1，返回 HxWx3 的 uint8 数组。"""
        mouth_open = float(np.clip(mouth_open, 0.0, 1.0))
        blink = float(np.clip(blink, 0.0, 1.0))

        img = self._bg.copy()
        draw = ImageDraw.Draw(img)
        cx = self.cx

        # 眉毛
        brow_y = self.face_cy - self.face_ry * 0.34
        eye_dx = self.face_rx * 0.45
        brow_w = self.face_rx * 0.30
        for sign in (-1, 1):
            ex = cx + sign * eye_dx
            draw.line(
                [(ex - brow_w, brow_y), (ex + brow_w, brow_y - self.face_ry * 0.03)],
                fill=COLOR_BROW, width=max(2, int(self.w * 0.008)),
            )

        # 眼睛（blink 越大眼睛越闭）
        eye_y = self.face_cy - self.face_ry * 0.14
        eye_rx = self.face_rx * 0.24
        eye_ry = self.face_ry * 0.16 * (1.0 - 0.92 * blink)
        for sign in (-1, 1):
            ex = cx + sign * eye_dx
            if eye_ry < self.face_ry * 0.03:
                # 几乎闭眼，画一条弧线
                draw.arc(
                    [ex - eye_rx, eye_y - eye_rx * 0.5, ex + eye_rx, eye_y + eye_rx * 0.5],
                    0, 180, fill=COLOR_BROW, width=max(2, int(self.w * 0.006)),
                )
            else:
                draw.ellipse(
                    [ex - eye_rx, eye_y - eye_ry, ex + eye_rx, eye_y + eye_ry],
                    fill=COLOR_EYE_WHITE, outline=(180, 180, 180),
                )
                pr = min(eye_rx, eye_ry) * 0.7
                draw.ellipse([ex - pr, eye_y - pr, ex + pr, eye_y + pr], fill=COLOR_PUPIL)
                # 眼睛高光
                draw.ellipse(
                    [ex - pr * 0.2, eye_y - pr * 0.5, ex + pr * 0.3, eye_y - pr * 0.1],
                    fill=(245, 245, 245),
                )

        # 嘴巴：高度随音量增大
        mouth_cy = self.face_cy + self.face_ry * 0.52
        mouth_rx = self.face_rx * 0.42
        min_h = self.face_ry * 0.03
        mouth_ry = min_h + mouth_open * (self.face_ry * 0.32)
        draw.ellipse(
            [cx - mouth_rx, mouth_cy - mouth_ry, cx + mouth_rx, mouth_cy + mouth_ry],
            fill=COLOR_MOUTH,
        )
        if mouth_ry > min_h * 2.2:
            inner_rx = mouth_rx * 0.82
            inner_ry = (mouth_ry - min_h) * 0.85
            draw.ellipse(
                [cx - inner_rx, mouth_cy - inner_ry, cx + inner_rx, mouth_cy + inner_ry],
                fill=COLOR_MOUTH_INNER,
            )
            # 舌头
            t_ry = inner_ry * 0.5
            draw.ellipse(
                [cx - inner_rx * 0.6, mouth_cy + inner_ry - t_ry,
                 cx + inner_rx * 0.6, mouth_cy + inner_ry + t_ry * 0.4],
                fill=COLOR_TONGUE,
            )

        return np.asarray(img)
