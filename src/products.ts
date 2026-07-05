/** 直播间售卖的商品。价格单位为元，话术用于点「讲解」时自动朗读。 */
export interface Product {
  id: string;
  name: string;
  emoji: string; // 示例用 emoji 占位商品图，换真实图片时改成图片地址即可
  color: string; // 商品图背景色，配合 emoji 占位
  price: number; // 到手价
  originalPrice: number; // 原价（划线展示）
  tags: string[]; // 卖点标签
  stock: number; // 剩余库存
  script: string; // 主播带货话术
}

/** 内置示例商品，演示用。换成自己的商品时编辑这里即可。 */
export const PRODUCTS: Product[] = [
  {
    id: "serum",
    name: "雪绒精华液 30ml",
    emoji: "🧴",
    color: "#ffe3ec",
    price: 129,
    originalPrice: 299,
    tags: ["补水保湿", "提亮肤色", "敏感肌可用"],
    stock: 88,
    script:
      "家人们看过来！这瓶雪绒精华液，原价两百九十九，今天直播间到手只要一百二十九！补水保湿提亮肤色，敏感肌也能放心用。库存不多了，喜欢的赶紧拍，手慢就没啦！",
  },
  {
    id: "lipstick",
    name: "丝绒雾面口红",
    emoji: "💄",
    color: "#ffd9d9",
    price: 59,
    originalPrice: 139,
    tags: ["持久不沾杯", "显白", "三支装"],
    stock: 156,
    script:
      "这支丝绒雾面口红，一涂显白整个人都精神了！持久不沾杯，喝水吃饭都不掉色，还是三支装哦。原价一百三十九，今天只要五十九，闭眼入绝对不亏！",
  },
  {
    id: "earphone",
    name: "降噪蓝牙耳机",
    emoji: "🎧",
    color: "#dbeafe",
    price: 199,
    originalPrice: 499,
    tags: ["主动降噪", "超长续航", "高清音质"],
    stock: 42,
    script:
      "这款降噪蓝牙耳机，主动降噪通勤神器，地铁公交全世界都安静了！高清音质加超长续航，一次充电用一整天。原价四百九十九，直播间专享价一百九十九，只有四十二件，先到先得！",
  },
  {
    id: "scarf",
    name: "羊绒围巾礼盒",
    emoji: "🧣",
    color: "#fde68a",
    price: 89,
    originalPrice: 259,
    tags: ["100%羊绒", "亲肤柔软", "送礼自用"],
    stock: 120,
    script:
      "天冷啦，给自己和家人备一条羊绒围巾吧！百分之百羊绒，亲肤柔软不扎脖子，还是精美礼盒装，送礼超有面子。原价两百五十九，今天只要八十九，多买几条囤起来！",
  },
];
