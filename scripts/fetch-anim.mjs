// 下载内置示例动作（.vrma）到 public/anims/
// VRMA 是 VRM 标准动画格式，体积小、可复用；这里只放官方一个演示动作，
// 想要更多动作请把任意 .vrma 文件拖进网页，或参考 README 自行下载补充。
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const ANIMS = [
  {
    url: "https://cdn.jsdelivr.net/gh/pixiv/three-vrm@dev/packages/three-vrm-animation/examples/models/test.vrma",
    out: "public/anims/demo.vrma",
    label: "演示动作",
  },
];

async function fetchOne({ url, out, label }) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载失败（${label}）：HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, buffer);
  console.log(`完成 ✅ ${label} → ${out}（${(buffer.length / 1024).toFixed(1)} KB）`);
}

async function main() {
  console.log("正在下载内置示例动作…");
  for (const anim of ANIMS) {
    await fetchOne(anim);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
