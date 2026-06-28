import { PRODUCTS, type Product } from "./products";

interface SalesOptions {
  /** 点「讲解这件」时回调，传入当前商品（由外部负责朗读话术）。 */
  onExplain: (product: Product) => void;
}

const DANMAKU_POOL = [
  "求链接！",
  "已下单，催发货～",
  "主播声音好好听",
  "这个我买过，真心好用",
  "还有库存吗",
  "便宜啊，冲冲冲",
  "刚拍了三件",
  "什么时候发货呀",
  "已抢到，开心",
  "主播再讲讲这个",
  "买它买它！",
  "颜色好好看",
];

const DANMAKU_COLORS = ["#fff", "#ffe08a", "#ffd2e6", "#c9f7ff", "#d9ffd2"];

/** 倒计时初始秒数（15 分钟），归零后自动重置，营造"限时抢购"的紧迫感。 */
const COUNTDOWN_SECONDS = 15 * 60;

/**
 * 卖货直播间场景控制器：管理商品卡、商品切换、限时倒计时、下单提示，
 * 以及直播氛围（在线人数跳动、点赞飘心、滚动弹幕）。
 */
export class SalesScene {
  private readonly thumbs = document.getElementById("product-thumbs")!;
  private readonly img = document.getElementById("product-img")!;
  private readonly name = document.getElementById("product-name")!;
  private readonly tagsEl = document.getElementById("product-tags")!;
  private readonly priceEl = document.getElementById("product-price")!;
  private readonly originEl = document.getElementById("product-origin")!;
  private readonly stockEl = document.getElementById("product-stock")!;
  private readonly countdownEl = document.querySelector("#countdown b")!;
  private readonly explainBtn = document.getElementById("explain-btn") as HTMLButtonElement;
  private readonly buyBtn = document.getElementById("buy-btn") as HTMLButtonElement;
  private readonly viewerCountEl = document.getElementById("viewer-count")!;
  private readonly likeCountEl = document.getElementById("like-count")!;
  private readonly danmakuLayer = document.getElementById("danmaku-layer")!;
  private readonly heartsLayer = document.getElementById("hearts-layer")!;
  private readonly toast = document.getElementById("buy-toast")!;

  private current = 0;
  private remaining = COUNTDOWN_SECONDS;
  private viewers = 12000 + Math.floor(Math.random() * 4000);
  private likes = 0;
  private soldCount = 0;
  private toastTimer: number | null = null;

  constructor(private readonly options: SalesOptions) {
    this.buildThumbs();
    this.selectProduct(0);

    this.explainBtn.addEventListener("click", () => {
      this.options.onExplain(PRODUCTS[this.current]);
    });
    this.buyBtn.addEventListener("click", () => this.buy());

    // 各类定时任务：倒计时、在线人数、弹幕、飘心
    window.setInterval(() => this.tickCountdown(), 1000);
    window.setInterval(() => this.tickViewers(), 2500);
    this.scheduleDanmaku();
    this.scheduleHeart();
  }

  /** 当前正在展示的商品。 */
  currentProduct(): Product {
    return PRODUCTS[this.current];
  }

  private buildThumbs(): void {
    this.thumbs.innerHTML = "";
    PRODUCTS.forEach((p, index) => {
      const el = document.createElement("div");
      el.className = "thumb";
      el.textContent = p.emoji;
      el.style.background = p.color;
      el.title = p.name;
      el.addEventListener("click", () => this.selectProduct(index));
      this.thumbs.appendChild(el);
    });
  }

  private selectProduct(index: number): void {
    this.current = index;
    const p = PRODUCTS[index];

    this.img.textContent = p.emoji;
    this.img.style.background = p.color;
    this.name.textContent = p.name;
    this.priceEl.textContent = String(p.price);
    this.originEl.textContent = `¥${p.originalPrice}`;
    this.stockEl.textContent = `仅剩 ${p.stock} 件`;

    this.tagsEl.innerHTML = "";
    for (const tag of p.tags) {
      const t = document.createElement("span");
      t.className = "tag";
      t.textContent = tag;
      this.tagsEl.appendChild(t);
    }

    this.thumbs.querySelectorAll(".thumb").forEach((el, i) => {
      el.classList.toggle("active", i === index);
    });
  }

  private buy(): void {
    const p = PRODUCTS[this.current];
    if (p.stock > 0) {
      p.stock -= 1;
      this.stockEl.textContent = `仅剩 ${p.stock} 件`;
    }
    this.soldCount += 1;
    this.showToast(`🎉 抢购成功！已抢 ${this.soldCount} 件`);
    // 下单时多飘几颗心，制造热闹感
    for (let i = 0; i < 5; i++) {
      window.setTimeout(() => this.spawnHeart(), i * 120);
    }
  }

  private showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add("show");
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.remove("show");
    }, 1600);
  }

  private tickCountdown(): void {
    this.remaining -= 1;
    if (this.remaining < 0) this.remaining = COUNTDOWN_SECONDS;
    const m = Math.floor(this.remaining / 60);
    const s = this.remaining % 60;
    this.countdownEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  private tickViewers(): void {
    // 在线人数小幅随机游走
    this.viewers += Math.floor((Math.random() - 0.45) * 200);
    this.viewers = Math.max(800, this.viewers);
    this.viewerCountEl.textContent = this.formatCount(this.viewers);
  }

  private formatCount(n: number): string {
    return n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n);
  }

  private scheduleDanmaku(): void {
    const next = 800 + Math.random() * 2000;
    window.setTimeout(() => {
      this.spawnDanmaku();
      this.scheduleDanmaku();
    }, next);
  }

  private spawnDanmaku(): void {
    const el = document.createElement("div");
    el.className = "danmaku";
    el.textContent = DANMAKU_POOL[Math.floor(Math.random() * DANMAKU_POOL.length)];
    el.style.top = `${Math.random() * 150}px`;
    el.style.color = DANMAKU_COLORS[Math.floor(Math.random() * DANMAKU_COLORS.length)];
    el.style.animationDuration = `${6 + Math.random() * 5}s`;
    el.addEventListener("animationend", () => el.remove());
    this.danmakuLayer.appendChild(el);
  }

  private scheduleHeart(): void {
    const next = 500 + Math.random() * 1200;
    window.setTimeout(() => {
      this.spawnHeart();
      this.scheduleHeart();
    }, next);
  }

  private spawnHeart(): void {
    const el = document.createElement("div");
    el.className = "heart";
    const emojis = ["❤️", "💖", "💕", "🧡", "💛"];
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    el.style.left = `${20 + Math.random() * 60}px`;
    el.style.setProperty("--drift", `${(Math.random() - 0.5) * 60}px`);
    el.style.animationDuration = `${3 + Math.random() * 2}s`;
    el.addEventListener("animationend", () => el.remove());
    this.heartsLayer.appendChild(el);

    this.likes += 1;
    this.likeCountEl.textContent = this.formatCount(this.likes);
  }
}
