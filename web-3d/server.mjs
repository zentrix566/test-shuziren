// 豆包（火山引擎）TTS 中转后端：
// 浏览器把文字发到 /api/tts，这里用 .env 里的 API Key 调豆包，
// 把流式返回的 base64 音频块拼接成完整 mp3 再回传。API Key 绝不暴露到前端。
import express from "express";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 8787;
const TTS_URL =
  process.env.DOUBAO_TTS_URL ||
  "https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional";
const RESOURCE_ID = process.env.DOUBAO_RESOURCE_ID || "seed-tts-2.0";
const DEFAULT_SPEAKER = process.env.DOUBAO_SPEAKER || "zh_female_gaolengyujie_uranus_bigtts";
const SAMPLE_RATE = Number(process.env.DOUBAO_SAMPLE_RATE) || 24000;
const API_KEY = process.env.DOUBAO_API_KEY || "";

// 可选音色列表（id 与中文标签）。注意：音色需在火山控制台为你的账号开通，
// 未开通的音色调用会报 55000000（resource 与 speaker 不匹配）。
// 开通后可用 .env 的 DOUBAO_SPEAKERS 追加，格式 "id|标签,id|标签"。
const BUILTIN_SPEAKERS = [
  { id: "zh_female_gaolengyujie_uranus_bigtts", label: "女声 · 高冷御姐" },
];

function parseSpeakers() {
  // 优先级：环境变量 DOUBAO_SPEAKERS > speakers.json > 内置
  const raw = process.env.DOUBAO_SPEAKERS;
  if (raw) {
    const list = raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [id, label] = item.split("|");
        return { id: id.trim(), label: (label || id).trim() };
      });
    if (list.length) return list;
  }

  const jsonPath = join(__dirname, "speakers.json");
  if (existsSync(jsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(jsonPath, "utf-8"));
      const list = (parsed.speakers || parsed)
        .map((s) => ({ id: String(s.id).trim(), label: (s.label || s.id).trim() }))
        .filter((s) => s.id);
      if (list.length) return list;
    } catch (err) {
      console.warn(`[speakers] speakers.json 解析失败，使用内置列表：${err.message}`);
    }
  }

  return BUILTIN_SPEAKERS;
}

const SPEAKERS = parseSpeakers();

const app = express();
app.use(express.json());

/** 返回可选音色列表与默认音色，供前端下拉使用。 */
app.get("/api/speakers", (_req, res) => {
  const list = SPEAKERS.some((s) => s.id === DEFAULT_SPEAKER)
    ? SPEAKERS
    : [{ id: DEFAULT_SPEAKER, label: DEFAULT_SPEAKER }, ...SPEAKERS];
  res.json({ speakers: list, default: DEFAULT_SPEAKER });
});

/** 调豆包 HTTP 接口，把流式按行 JSON 的 base64 音频块拼接为完整 mp3 Buffer。 */
async function synthesize(text, speaker) {
  const res = await fetch(TTS_URL, {
    method: "POST",
    headers: {
      "X-Api-Key": API_KEY,
      "X-Api-Resource-Id": RESOURCE_ID,
      "Content-Type": "application/json",
      "X-Control-Require-Usage-Tokens-Return": "*",
    },
    body: JSON.stringify({
      req_params: {
        text,
        speaker: speaker || DEFAULT_SPEAKER,
        audio_params: { format: "mp3", sample_rate: SAMPLE_RATE },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`豆包返回 HTTP ${res.status}：${detail.slice(0, 300)}`);
  }

  // 响应是按行的 JSON，每行 data 字段是一段 base64 音频
  const raw = await res.text();
  const chunks = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const code = data.code ?? 0;
    if (code === 0 && data.data) {
      chunks.push(Buffer.from(data.data, "base64"));
    } else if (code === 20000000) {
      break; // 合成结束
    } else if (code > 0) {
      throw new Error(
        `豆包合成错误 code=${code}（resource=${RESOURCE_ID}, speaker=${speaker || DEFAULT_SPEAKER}）：${trimmed.slice(0, 300)}`,
      );
    }
  }

  if (chunks.length === 0) {
    throw new Error("豆包未返回任何音频数据");
  }
  return Buffer.concat(chunks);
}

app.post("/api/tts", async (req, res) => {
  const text = (req.body?.text || "").trim();
  const speaker = req.body?.speaker;
  if (!text) {
    res.status(400).json({ error: "text 不能为空" });
    return;
  }
  if (!API_KEY) {
    res.status(500).json({ error: "未配置 DOUBAO_API_KEY，请在 web-3d/.env 中填写" });
    return;
  }

  try {
    console.log(`[tts] resource=${RESOURCE_ID} speaker=${speaker || DEFAULT_SPEAKER} chars=${text.length}`);
    const audio = await synthesize(text, speaker);
    res.set("Content-Type", "audio/mpeg");
    res.send(audio);
  } catch (err) {
    console.error("[tts]", err.message);
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`TTS 中转服务已启动：http://localhost:${PORT}`);
  if (!API_KEY) {
    console.warn("⚠️  尚未配置 DOUBAO_API_KEY，请复制 .env.example 为 .env 并填入你的 Key。");
  }
});
