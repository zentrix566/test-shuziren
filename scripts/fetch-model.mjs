// 下载内置示例 VRM 模型到 public/models/avatar.vrm
// 模型体积较大且版权归原作者，故不提交进仓库，改为按需下载。
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const MODEL_URL =
  "https://cdn.jsdelivr.net/gh/pixiv/three-vrm@dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm";
const OUT_PATH = "public/models/avatar.vrm";

async function main() {
  console.log("正在下载示例模型…");
  const res = await fetch(MODEL_URL);
  if (!res.ok) {
    throw new Error(`下载失败：HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, buffer);
  console.log(`完成 ✅ 已保存到 ${OUT_PATH}（${(buffer.length / 1024 / 1024).toFixed(1)} MB）`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
