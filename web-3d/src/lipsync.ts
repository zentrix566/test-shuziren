/**
 * 口型驱动：
 * - 首选「豆包」神经语音：调本地后端 /api/tts 拿 mp3，用 Web Audio 播放，
 *   并按真实音量包络驱动口型（更准更自然）。
 * - 兜底：浏览器自带 Web Speech API（离线/未配置 Key 时可用，口型为节奏估算）。
 */
export class LipSync {
  private readonly synth = window.speechSynthesis;

  // Web Speech 兜底用的嘴部节奏定时器
  private timer: number | null = null;

  // 豆包音频播放与音量分析
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private timeData: Uint8Array<ArrayBuffer> | null = null;
  private rafId: number | null = null;

  /** onMouth 在朗读过程中被反复调用，传入 0..1 的张嘴值。 */
  constructor(private readonly onMouth: (value: number) => void) {}

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
      if (!this.analyser || !this.timeData) return;
      this.analyser.getByteTimeDomainData(this.timeData);
      let sum = 0;
      for (let i = 0; i < this.timeData.length; i++) {
        const v = (this.timeData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this.timeData.length);
      // 放大并做非线性，让小音量也能看出张嘴
      const mouth = Math.min(1, Math.pow(rms * 3.2, 0.8));
      this.onMouth(mouth);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private stopAnalyze(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.analyser = null;
    this.timeData = null;
    this.onMouth(0);
  }

  private startMouthLoop(): void {
    this.stopMouthLoop();
    this.timer = window.setInterval(() => {
      this.onMouth(0.25 + Math.random() * 0.75);
    }, 90);
  }

  private stopMouthLoop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.onMouth(0);
  }
}
