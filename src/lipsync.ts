import type { Vowel } from "./viewer";

/**
 * 口型驱动：
 * - 首选「豆包」神经语音：调本地后端 /api/tts 拿 mp3，用 Web Audio 播放，
 *   并按真实音量包络 + 频谱粗估的元音驱动多种嘴型（更准更自然）。
 * - 兜底：浏览器自带 Web Speech API（离线/未配置 Key 时可用，口型为节奏估算）。
 */
export class LipSync {
  private readonly synth = window.speechSynthesis;

  // Web Speech 兜底用的嘴部节奏定时器
  private timer: number | null = null;

  // 豆包音频播放与音量/频谱分析
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private timeData: Uint8Array<ArrayBuffer> | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private rafId: number | null = null;

  /** onMouth 在朗读过程中被反复调用，传入 0..1 的张嘴值与当前元音嘴型。 */
  constructor(private readonly onMouth: (value: number, vowel: Vowel) => void) {}

  /** 用豆包合成并播放，真实音量驱动口型。失败会抛错，由调用方决定是否兜底。 */
  async speakWithDoubao(text: string, speaker: string, onEnd?: () => void): Promise<void> {
    this.stop();
    const content = text.trim();
    if (!content) {
      onEnd?.();
      return;
    }

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: content, speaker: speaker || undefined }),
    });
    if (!res.ok) {
      const info = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(info.error || `HTTP ${res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const ctx = this.ensureAudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    analyser.connect(ctx.destination);

    this.source = source;
    this.analyser = analyser;
    this.timeData = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    this.freqData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    source.onended = () => {
      this.stopAnalyze();
      onEnd?.();
    };
    source.start();
    this.startAnalyze();
  }

  /** 兜底：用浏览器自带语音朗读。 */
  speakWithBrowser(text: string, voiceURI: string, onEnd?: () => void): void {
    this.stop();
    const content = text.trim();
    if (!content) {
      onEnd?.();
      return;
    }

    const utter = new SpeechSynthesisUtterance(content);
    utter.lang = "zh-CN";
    const voice = this.getVoices().find((v) => v.voiceURI === voiceURI);
    if (voice) utter.voice = voice;
    utter.rate = 0.95;
    utter.pitch = 0.95;

    utter.onstart = () => this.startMouthLoop();
    utter.onend = () => {
      this.stopMouthLoop();
      onEnd?.();
    };
    utter.onerror = () => {
      this.stopMouthLoop();
      onEnd?.();
    };
    this.synth.speak(utter);
  }

  /** 停止一切朗读并闭嘴。 */
  stop(): void {
    this.synth.cancel();
    this.stopMouthLoop();
    if (this.source) {
      try {
        this.source.onended = null;
        this.source.stop();
      } catch {
        // 已经停止则忽略
      }
      this.source = null;
    }
    this.stopAnalyze();
  }

  /** 返回系统语音音色，中文神经网络音色（Natural/Online）排最前。 */
  getVoices(): SpeechSynthesisVoice[] {
    const voices = this.synth.getVoices();
    return voices.slice().sort((a, b) => this.score(b) - this.score(a));
  }

  private score(v: SpeechSynthesisVoice): number {
    const isZh = v.lang.toLowerCase().startsWith("zh");
    const name = v.name.toLowerCase();
    const isNatural = name.includes("natural") || name.includes("online");
    let s = 0;
    if (isZh) s += 100;
    if (isNatural) s += 50;
    return s;
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === "suspended") {
      void this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  private startAnalyze(): void {
    const loop = () => {
      if (!this.analyser || !this.timeData || !this.freqData) return;
      this.analyser.getByteTimeDomainData(this.timeData);
      let sum = 0;
      for (let i = 0; i < this.timeData.length; i++) {
        const v = (this.timeData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this.timeData.length);
      // 放大并做非线性，让小音量也能看出张嘴
      const mouth = Math.min(1, Math.pow(rms * 3.2, 0.8));

      // 用频谱质心粗估元音：质心越低偏 ou/oh，越高偏 ee/ih，居中为 aa
      this.analyser.getByteFrequencyData(this.freqData);
      const vowel = mouth > 0.06 ? this.estimateVowel(this.freqData) : "aa";

      this.onMouth(mouth, vowel);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /**
   * 由频谱质心近似判断元音嘴型。这不是精确的音素识别，
   * 只是按"能量偏低/偏高"在 5 个嘴型间分档，让口型比单一张嘴更自然。
   */
  private estimateVowel(freq: Uint8Array): Vowel {
    let weighted = 0;
    let total = 0;
    for (let i = 0; i < freq.length; i++) {
      weighted += i * freq[i];
      total += freq[i];
    }
    if (total <= 0) return "aa";
    const centroid = weighted / total / freq.length; // 归一化到 0..1
    if (centroid < 0.12) return "ou";
    if (centroid < 0.2) return "oh";
    if (centroid < 0.32) return "aa";
    if (centroid < 0.45) return "ee";
    return "ih";
  }

  private stopAnalyze(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.analyser = null;
    this.timeData = null;
    this.freqData = null;
    this.onMouth(0, "aa");
  }

  private startMouthLoop(): void {
    this.stopMouthLoop();
    const vowels: Vowel[] = ["aa", "ih", "ou", "ee", "oh"];
    this.timer = window.setInterval(() => {
      const vowel = vowels[Math.floor(Math.random() * vowels.length)];
      this.onMouth(0.25 + Math.random() * 0.75, vowel);
    }, 90);
  }

  private stopMouthLoop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.onMouth(0, "aa");
  }
}
