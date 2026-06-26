import "./style.css";
import { Viewer } from "./viewer";
import { LipSync } from "./lipsync";

// 内置示例模型，放在 public/models 下，构建时会一起打包
const DEFAULT_MODEL = "/models/avatar.vrm";

const container = document.getElementById("canvas-container")!;
const textInput = document.getElementById("text-input") as HTMLTextAreaElement;
const voiceSelect = document.getElementById("voice-select") as HTMLSelectElement;
const speakerInput = document.getElementById("speaker-input") as HTMLInputElement;
const speakBtn = document.getElementById("speak-btn") as HTMLButtonElement;
const stopBtn = document.getElementById("stop-btn") as HTMLButtonElement;
const waveBtn = document.getElementById("wave-btn") as HTMLButtonElement;
const statusEl = document.getElementById("status")!;
const dropMask = document.getElementById("drop-mask")!;

const viewer = new Viewer(container);
const lipSync = new LipSync((value) => viewer.setMouthOpen(value));

// 下拉里装的是豆包音色还是浏览器音色（取决于后端是否可用）
let usingDoubao = true;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

/** 从后端拉取豆包音色填充下拉；失败则退回浏览器自带音色。 */
async function populateVoices(): Promise<void> {
  try {
    const res = await fetch("/api/speakers");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      speakers: { id: string; label: string }[];
      default: string;
    };
    voiceSelect.innerHTML = "";
    for (const sp of data.speakers) {
      const option = document.createElement("option");
      option.value = sp.id;
      option.textContent = sp.label;
      voiceSelect.appendChild(option);
    }
    voiceSelect.value = data.default;
    usingDoubao = true;
  } catch {
    populateBrowserVoices();
  }
}

/** 兜底：把浏览器自带音色填进下拉。 */
function populateBrowserVoices(): void {
  const voices = lipSync.getVoices();
  voiceSelect.innerHTML = "";
  for (const voice of voices) {
    const option = document.createElement("option");
    option.value = voice.voiceURI;
    const name = voice.name.toLowerCase();
    const natural = name.includes("natural") || name.includes("online");
    option.textContent = `${natural ? "✨ " : ""}${voice.name}（${voice.lang}）`;
    voiceSelect.appendChild(option);
  }
  usingDoubao = false;
}

async function loadModel(url: string): Promise<void> {
  setStatus("正在加载模型…");
  try {
    await viewer.loadVrm(url);
    setStatus("模型已就绪，输入文字后点击朗读。");
  } catch (err) {
    console.error(err);
    setStatus("模型加载失败，请把一个 .vrm 文件拖进窗口。");
  }
}

async function speak(): Promise<void> {
  speakBtn.disabled = true;
  setStatus("豆包合成中…");
  // 手动输入的音色 ID 优先；否则用下拉所选（豆包模式）
  const manual = speakerInput.value.trim();
  const speaker = manual || (usingDoubao ? voiceSelect.value : "");
  try {
    await lipSync.speakWithDoubao(textInput.value, speaker, () => {
      speakBtn.disabled = false;
      setStatus("朗读结束。");
    });
  } catch (err) {
    console.error(err);
    // 豆包失败（未配置 Key/网络等）→ 退回浏览器自带语音
    setStatus(`豆包不可用，已改用浏览器语音：${(err as Error).message}`);
    const browserVoice = usingDoubao ? "" : voiceSelect.value;
    lipSync.speakWithBrowser(textInput.value, browserVoice, () => {
      speakBtn.disabled = false;
    });
  }
}

// 优先加载豆包音色；浏览器音色异步就绪时，仅在兜底模式下刷新
void populateVoices();
window.speechSynthesis.onvoiceschanged = () => {
  if (!usingDoubao) populateBrowserVoices();
};

speakBtn.addEventListener("click", speak);
stopBtn.addEventListener("click", () => {
  lipSync.stop();
  speakBtn.disabled = false;
  setStatus("已停止。");
});

waveBtn.addEventListener("click", () => viewer.wave());

// 拖入 .vrm 文件替换形象
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropMask.classList.add("active");
});
window.addEventListener("dragleave", (e) => {
  if (e.relatedTarget === null) dropMask.classList.remove("active");
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
  dropMask.classList.remove("active");
  const file = e.dataTransfer?.files?.[0];
  if (file && file.name.toLowerCase().endsWith(".vrm")) {
    loadModel(URL.createObjectURL(file));
  } else {
    setStatus("请拖入 .vrm 格式的模型文件。");
  }
});

loadModel(DEFAULT_MODEL);
