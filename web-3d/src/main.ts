import "./style.css";
import { Viewer, type Emotion, type Gesture } from "./viewer";
import { LipSync } from "./lipsync";
import { SalesScene } from "./sales";

// 内置示例模型，放在 public/models 下，构建时会一起打包
const DEFAULT_MODEL = "/models/avatar.vrm";

const container = document.getElementById("canvas-container")!;
const textInput = document.getElementById("text-input") as HTMLTextAreaElement;
const voiceSelect = document.getElementById("voice-select") as HTMLSelectElement;
const speakerInput = document.getElementById("speaker-input") as HTMLInputElement;
const speakBtn = document.getElementById("speak-btn") as HTMLButtonElement;
const stopBtn = document.getElementById("stop-btn") as HTMLButtonElement;
const statusEl = document.getElementById("status")!;
const dropMask = document.getElementById("drop-mask")!;

const viewer = new Viewer(container);
const lipSync = new LipSync((value, vowel) => viewer.setMouth(value, vowel));

// 鼠标移动驱动眼睛/头部注视：把屏幕坐标换成归一化的 -1..1
window.addEventListener("mousemove", (e) => {
  const x = (e.clientX / window.innerWidth) * 2 - 1;
  const y = -((e.clientY / window.innerHeight) * 2 - 1);
  viewer.setPointer(x, y);
});

// 情绪按钮：点一下切换表情（再点同一个回到中性）
let currentEmotion: Emotion = "neutral";
document.querySelectorAll<HTMLButtonElement>("[data-emotion]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const emotion = btn.dataset.emotion as Emotion;
    currentEmotion = currentEmotion === emotion ? "neutral" : emotion;
    viewer.setEmotion(currentEmotion);
    syncEmotionButtons();
  });
});

function syncEmotionButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-emotion]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.emotion === currentEmotion);
  });
}

// 手势按钮：触发一次性动作
document.querySelectorAll<HTMLButtonElement>("[data-gesture]").forEach((btn) => {
  btn.addEventListener("click", () => {
    viewer.playGesture(btn.dataset.gesture as Gesture);
  });
});

/** 按文本里的标点/关键词粗略判断情绪，朗读时自动切换表情。 */
function detectEmotion(text: string): Emotion {
  if (/(哈哈|嘻嘻|太好了|开心|高兴|棒|耶|！{2,}|😄|😊)/.test(text)) return "happy";
  if (/(抱歉|对不起|难过|遗憾|可惜|伤心|哭|😢)/.test(text)) return "sad";
  if (/(生气|讨厌|可恶|愤怒|岂有此理|😠)/.test(text)) return "angry";
  if (/(惊|竟然|居然|不会吧|什么？|？！|！？)/.test(text)) return "surprised";
  if (/[？?]\s*$/.test(text.trim())) return "surprised";
  return "relaxed";
}


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

// 内置示例动作（.vrma），由 npm run fetch-anim 下载到此路径
const DEMO_ANIM = { name: "demo", url: "/anims/demo.vrma" };

const animBtn = document.getElementById("anim-btn") as HTMLButtonElement;

async function loadModel(url: string): Promise<void> {
  setStatus("正在加载模型…");
  try {
    await viewer.loadVrm(url);
    setStatus("模型已就绪，输入文字后点击朗读。");
    void loadDemoAnimation();
  } catch (err) {
    console.error(err);
    setStatus("模型加载失败，请把一个 .vrm 文件拖进窗口。");
  }
}

/** 尝试加载内置示例动作；失败（未下载）则禁用按钮，不影响其它功能。 */
async function loadDemoAnimation(): Promise<void> {
  animBtn.disabled = true;
  try {
    await viewer.loadAnimation(DEMO_ANIM.name, DEMO_ANIM.url);
    animBtn.disabled = false;
  } catch {
    animBtn.title = "未找到示例动作，请先运行 npm run fetch-anim，或把 .vrma 文件拖进窗口";
  }
}

/** 加载并立即播放一个拖入的 .vrma 文件。 */
async function loadAndPlayAnimation(url: string): Promise<void> {
  setStatus("正在加载动作…");
  try {
    await viewer.loadAnimation("dropped", url);
    viewer.playAnimation("dropped");
    setStatus("动作已播放。");
  } catch (err) {
    console.error(err);
    setStatus(`动作加载失败：${(err as Error).message}`);
  }
}

async function speak(override?: { text?: string; emotion?: Emotion }): Promise<void> {
  const text = override?.text ?? textInput.value;
  if (override?.text) textInput.value = override.text;

  speakBtn.disabled = true;
  setStatus("豆包合成中…");
  // 情绪：显式指定 > 手动设过的情绪 > 按文本自动判断
  const emotion =
    override?.emotion ?? (currentEmotion === "neutral" ? detectEmotion(text) : currentEmotion);
  viewer.setEmotion(emotion);
  const restoreEmotion = () => viewer.setEmotion(currentEmotion);
  // 手动输入的音色 ID 优先；否则用下拉所选（豆包模式）
  const manual = speakerInput.value.trim();
  const speaker = manual || (usingDoubao ? voiceSelect.value : "");
  try {
    await lipSync.speakWithDoubao(text, speaker, () => {
      speakBtn.disabled = false;
      setStatus("朗读结束。");
      restoreEmotion();
    });
  } catch (err) {
    console.error(err);
    // 豆包失败（未配置 Key/网络等）→ 退回浏览器自带语音
    setStatus(`豆包不可用，已改用浏览器语音：${(err as Error).message}`);
    const browserVoice = usingDoubao ? "" : voiceSelect.value;
    lipSync.speakWithBrowser(text, browserVoice, () => {
      speakBtn.disabled = false;
      restoreEmotion();
    });
  }
}

// 卖货直播间：商品卡、切换、倒计时、下单、氛围；点「讲解」时主播挥手并笑着朗读话术
const salesScene = new SalesScene({
  onExplain: (product) => {
    viewer.playGesture("wave");
    void speak({ text: product.script, emotion: "happy" });
  },
});
void salesScene;

// 主播控制台折叠/展开
const panel = document.getElementById("panel")!;
document.getElementById("panel-toggle")!.addEventListener("click", () => {
  panel.classList.toggle("collapsed");
});

// 优先加载豆包音色；浏览器音色异步就绪时，仅在兜底模式下刷新
void populateVoices();
window.speechSynthesis.onvoiceschanged = () => {
  if (!usingDoubao) populateBrowserVoices();
};

speakBtn.addEventListener("click", () => speak());
stopBtn.addEventListener("click", () => {
  lipSync.stop();
  speakBtn.disabled = false;
  viewer.setEmotion(currentEmotion);
  setStatus("已停止。");
});

animBtn.addEventListener("click", () => viewer.playAnimation(DEMO_ANIM.name));

// 拖入文件：.vrm 替换形象，.vrma 播放动作
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
  if (!file) return;
  const name = file.name.toLowerCase();
  if (name.endsWith(".vrm")) {
    loadModel(URL.createObjectURL(file));
  } else if (name.endsWith(".vrma")) {
    void loadAndPlayAnimation(URL.createObjectURL(file));
  } else {
    setStatus("请拖入 .vrm 模型或 .vrma 动作文件。");
  }
});

loadModel(DEFAULT_MODEL);
