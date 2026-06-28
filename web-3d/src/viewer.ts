import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMUtils, VRMHumanBoneName } from "@pixiv/three-vrm";
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
  type VRMAnimation,
} from "@pixiv/three-vrm-animation";

/** 渲染循环里用到的骨骼集合，加载模型后填充。 */
interface PoseBones {
  hips: THREE.Object3D | null;
  spine: THREE.Object3D | null;
  chest: THREE.Object3D | null;
  neck: THREE.Object3D | null;
  head: THREE.Object3D | null;
  leftUpperArm: THREE.Object3D | null;
  rightUpperArm: THREE.Object3D | null;
  leftLowerArm: THREE.Object3D | null;
  rightLowerArm: THREE.Object3D | null;
}

/** 说话时使用的元音嘴型，对应 VRM 标准表情。 */
export type Vowel = "aa" | "ih" | "ou" | "ee" | "oh";

/** 可手动/自动切换的情绪表情，对应 VRM 标准表情；neutral 表示恢复中性。 */
export type Emotion = "neutral" | "happy" | "angry" | "sad" | "relaxed" | "surprised";

/** 可触发的一次性手势动作。 */
export type Gesture = "wave" | "nod" | "shake" | "think" | "bow";

const VOWELS: Vowel[] = ["aa", "ih", "ou", "ee", "oh"];
const EMOTIONS: Exclude<Emotion, "neutral">[] = ["happy", "angry", "sad", "relaxed", "surprised"];

/** 各手势的总时长（秒），用于时间包络。 */
const GESTURE_DURATION: Record<Gesture, number> = {
  wave: 2.6,
  nod: 1.4,
  shake: 1.4,
  think: 2.4,
  bow: 2.0,
};

/**
 * 负责 three.js 场景、相机、灯光、渲染循环，以及加载并驱动 VRM 角色。
 * 角色默认是 T-pose，这里会摆成自然站姿，并叠加呼吸、摇摆、眨眼、注视、
 * 情绪表情、说话口型与一次性手势。
 */
export class Viewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly clock = new THREE.Clock();

  private currentVrm: VRM | null = null;
  private bones: PoseBones | null = null;
  private elapsed = 0;

  // VRMA 动画：mixer 播放时由它接管全身骨骼，程序化姿势暂停
  private mixer: THREE.AnimationMixer | null = null;
  private readonly clips = new Map<string, THREE.AnimationClip>();
  private currentAction: THREE.AnimationAction | null = null;
  private playingClip = false;

  // lookAt 注视目标：眼睛会盯着这个空物体的世界位置
  private readonly gazeTarget = new THREE.Object3D();
  // 鼠标归一化坐标（-1..1），由 main 传入；平滑后用于驱动注视与头部朝向
  private pointerX = 0;
  private pointerY = 0;
  private gazeX = 0;
  private gazeY = 0;
  private lastPointerAt = -100; // 最近一次鼠标移动的时间戳（用于判断是否进入待机眼神游移）
  // 待机眼神游移（saccade）：每隔一段时间随机看一个方向
  private saccadeX = 0;
  private saccadeY = 0;
  private nextSaccadeAt = 1.5;

  // 一次性手势：记录类型与开始时间，applyPose 里按时间包络叠加
  private gesture: Gesture | null = null;
  private gestureStart = -100;

  // 说话口型：五个元音嘴型各自平滑逼近目标值，避免抖动
  private readonly visemeTarget: Record<Vowel, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  private readonly visemeValue: Record<Vowel, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

  // 情绪表情：当前激活的情绪各自平滑逼近目标，避免突变
  private readonly emotionTarget: Record<string, number> = {};
  private readonly emotionValue: Record<string, number> = {};

  // 眨眼计时
  private blinkTimer = 0;
  private nextBlinkAt = 2.5;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.add(this.gazeTarget);

    this.camera = new THREE.PerspectiveCamera(
      30,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.camera.position.set(0, 1.35, 1.4);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.3, 0);
    this.controls.enablePan = false;
    this.controls.minDistance = 0.6;
    this.controls.maxDistance = 4;
    this.controls.update();

    // 直播间补光：暖色主光 + 柔和环境光，贴合暖色背景观感
    const light = new THREE.DirectionalLight(0xfff2e0, 2.2);
    light.position.set(1, 1.5, 1.5);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0xfff0ea, 1.05));

    for (const e of EMOTIONS) {
      this.emotionTarget[e] = 0;
      this.emotionValue[e] = 0;
    }

    window.addEventListener("resize", () => this.onResize());
    this.animate();
  }

  /** 设置说话口型：amount 为张嘴程度（0..1），vowel 选择嘴型。 */
  setMouth(amount: number, vowel: Vowel = "aa"): void {
    const value = Math.max(0, Math.min(1, amount));
    for (const v of VOWELS) {
      this.visemeTarget[v] = v === vowel ? value : 0;
    }
  }

  /** 设置鼠标归一化坐标（-1..1），驱动眼睛/头部注视。 */
  setPointer(x: number, y: number): void {
    this.pointerX = Math.max(-1, Math.min(1, x));
    this.pointerY = Math.max(-1, Math.min(1, y));
    this.lastPointerAt = this.elapsed;
  }

  /** 设置情绪表情；neutral 恢复中性。weight 控制强度（0..1）。 */
  setEmotion(emotion: Emotion, weight = 1): void {
    const w = Math.max(0, Math.min(1, weight));
    for (const e of EMOTIONS) {
      this.emotionTarget[e] = emotion === e ? w : 0;
    }
  }

  /** 触发一次手势动作（挥手/点头/摇头/思考/鞠躬）。 */
  playGesture(gesture: Gesture): void {
    this.gesture = gesture;
    this.gestureStart = this.elapsed;
  }

  /** 兼容旧接口：触发一次"挥手打招呼"。 */
  wave(): void {
    this.playGesture("wave");
  }

  /** 加载一个 VRM 模型（url 可以是本地路径或拖入文件的 ObjectURL）。 */
  async loadVrm(url: string): Promise<void> {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const gltf = await loader.loadAsync(url);
    const vrm = gltf.userData.vrm as VRM;

    if (this.currentVrm) {
      this.scene.remove(this.currentVrm.scene);
      VRMUtils.deepDispose(this.currentVrm.scene);
    }

    // 优化无用关节，并把 VRM0 旧规范模型转向正面
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.rotateVRM0(vrm);

    this.currentVrm = vrm;
    this.collectBones(vrm);
    this.scene.add(vrm.scene);

    // 重置动画状态：新模型需要新的 mixer，已加载的 .vrma 需要按新骨骼重建片段
    this.mixer = new THREE.AnimationMixer(vrm.scene);
    this.mixer.addEventListener("finished", () => {
      // 片段播完淡出，回到程序化待机姿势
      this.currentAction?.fadeOut(0.3);
      this.playingClip = false;
    });
    this.currentAction = null;
    this.playingClip = false;
    this.clips.clear();

    // 让眼睛盯着注视目标
    if (vrm.lookAt) {
      vrm.lookAt.target = this.gazeTarget;
    }

    this.frameHead(vrm);
  }

  /**
   * 加载一个 .vrma 动画文件并按当前模型骨骼生成片段，存入 clips 备用。
   * 必须在 loadVrm 之后调用（依赖当前 VRM 的骨骼）。
   */
  async loadAnimation(name: string, url: string): Promise<void> {
    const vrm = this.currentVrm;
    if (!vrm) throw new Error("请先加载模型再加载动画");

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);
    const vrmAnimations = gltf.userData.vrmAnimations as VRMAnimation[] | undefined;
    const vrmAnimation = vrmAnimations?.[0];
    if (!vrmAnimation) throw new Error("文件里没有可用的 VRM 动画");

    const clip = createVRMAnimationClip(vrmAnimation, vrm);
    this.clips.set(name, clip);
  }

  /** 播放一个已加载的动画片段（一次性），播完平滑回到程序化待机。 */
  playAnimation(name: string): void {
    const clip = this.clips.get(name);
    if (!this.mixer || !clip) return;

    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = false;

    if (this.currentAction && this.currentAction !== action) {
      this.currentAction.fadeOut(0.3);
    }
    action.fadeIn(0.3).play();
    this.currentAction = action;
    this.playingClip = true;
  }

  /** 已加载的动画片段名称列表。 */
  animationNames(): string[] {
    return [...this.clips.keys()];
  }

  private collectBones(vrm: VRM): void {
    const get = (name: VRMHumanBoneName) =>
      vrm.humanoid?.getNormalizedBoneNode(name) ?? null;
    this.bones = {
      hips: get(VRMHumanBoneName.Hips),
      spine: get(VRMHumanBoneName.Spine),
      chest: get(VRMHumanBoneName.Chest) ?? get(VRMHumanBoneName.UpperChest),
      neck: get(VRMHumanBoneName.Neck),
      head: get(VRMHumanBoneName.Head),
      leftUpperArm: get(VRMHumanBoneName.LeftUpperArm),
      rightUpperArm: get(VRMHumanBoneName.RightUpperArm),
      leftLowerArm: get(VRMHumanBoneName.LeftLowerArm),
      rightLowerArm: get(VRMHumanBoneName.RightLowerArm),
    };
  }

  /** 让相机对准角色头部，得到一个合适的"上半身"取景。 */
  private frameHead(vrm: VRM): void {
    const head = vrm.humanoid?.getNormalizedBoneNode("head");
    if (!head) return;
    const headPos = new THREE.Vector3();
    head.getWorldPosition(headPos);
    this.controls.target.set(headPos.x, headPos.y, headPos.z);
    this.camera.position.set(headPos.x, headPos.y + 0.05, headPos.z + 1.1);
    this.controls.update();
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();
    this.elapsed += delta;
    const vrm = this.currentVrm;

    if (vrm) {
      this.updateGaze(delta);
      this.updateMouth(vrm, delta);
      this.updateEmotion(vrm, delta);
      if (this.playingClip && this.mixer) {
        // 动画片段接管全身骨骼，程序化姿势暂停，仅保留口型/表情/注视/眨眼叠加
        this.mixer.update(delta);
      } else {
        this.applyPose(this.elapsed);
      }
      this.updateBlink(vrm, delta);
      vrm.update(delta);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  /** 更新注视目标：鼠标活动时盯鼠标，静止后眼神缓慢游移（saccade）。 */
  private updateGaze(delta: number): void {
    const head = this.bones?.head;
    if (!head) return;

    const idle = this.elapsed - this.lastPointerAt > 2.5;
    if (idle) {
      // 待机：定时随机看一个方向，模拟真人眼神的小幅游移
      if (this.elapsed >= this.nextSaccadeAt) {
        this.saccadeX = (Math.random() - 0.5) * 0.7;
        this.saccadeY = (Math.random() - 0.5) * 0.4;
        this.nextSaccadeAt = this.elapsed + 1.2 + Math.random() * 2.5;
      }
    } else {
      this.saccadeX = 0;
      this.saccadeY = 0;
    }

    const targetX = idle ? this.saccadeX : this.pointerX;
    const targetY = idle ? this.saccadeY : this.pointerY;
    // 平滑逼近，避免眼睛瞬移
    const k = Math.min(1, delta * 6);
    this.gazeX += (targetX - this.gazeX) * k;
    this.gazeY += (targetY - this.gazeY) * k;

    // 把归一化坐标映射成头部前方的一个世界点
    const headPos = new THREE.Vector3();
    head.getWorldPosition(headPos);
    this.gazeTarget.position.set(
      headPos.x + this.gazeX * 0.6,
      headPos.y + this.gazeY * 0.4,
      headPos.z + 1.0,
    );
  }

  /** 平滑逼近各元音嘴型目标并写入表情。 */
  private updateMouth(vrm: VRM, delta: number): void {
    const k = Math.min(1, delta * 18);
    for (const v of VOWELS) {
      this.visemeValue[v] += (this.visemeTarget[v] - this.visemeValue[v]) * k;
      vrm.expressionManager?.setValue(v, this.visemeValue[v]);
    }
  }

  /** 平滑逼近情绪表情目标并写入表情。 */
  private updateEmotion(vrm: VRM, delta: number): void {
    const k = Math.min(1, delta * 5);
    for (const e of EMOTIONS) {
      this.emotionValue[e] += (this.emotionTarget[e] - this.emotionValue[e]) * k;
      vrm.expressionManager?.setValue(e, this.emotionValue[e]);
    }
  }

  /**
   * 每帧重摆姿势：自然站姿（手臂下垂）+ 呼吸 + 轻微摇摆 + 重心转移 +
   * 头部跟随鼠标，并叠加说话小动作与一次性手势。
   */
  private applyPose(t: number): void {
    const b = this.bones;
    if (!b) return;
    const speak = this.visemeValue.aa + this.visemeValue.ih + this.visemeValue.ou;

    const set = (node: THREE.Object3D | null, x: number, y: number, z: number) => {
      node?.rotation.set(x, y, z);
    };

    const breath = Math.sin(t * 1.6) * 0.025; // 呼吸起伏
    const sway = Math.sin(t * 0.6) * 0.03; // 身体缓慢摇摆
    const shift = Math.sin(t * 0.32) * 0.04; // 重心缓慢左右转移

    set(b.hips, 0, shift * 0.5, shift);
    set(b.spine, breath * 0.3, sway * 0.5, -shift * 0.6);
    set(b.chest, breath, 0, 0);
    set(b.neck, 0, sway, 0);

    // 头部：缓慢点头/转头 + 跟随鼠标 + 说话时随节奏小幅点头；偶尔轻轻歪头
    const tilt = Math.sin(t * 0.23) * 0.04; // 缓慢歪头
    const headNod = Math.sin(t * 2.0) * 0.02 + speak * Math.sin(t * 9) * 0.04 - this.gazeY * 0.18;
    const headTurn = Math.sin(t * 0.5) * 0.04 + this.gazeX * 0.28;
    set(b.head, headNod, headTurn, Math.sin(t * 0.8) * 0.02 + tilt);

    // 手臂：从 T-pose 放下到自然下垂（绕 Z 轴约 67°），叠加摇摆与说话手势
    const armSwing = Math.sin(t * 0.6) * 0.04;
    const gesture = speak * Math.sin(t * 4) * 0.1;
    set(b.leftUpperArm, 0.08, 0, -1.18 + armSwing - gesture);
    set(b.leftLowerArm, 0, -0.18 - gesture * 0.6, 0);
    set(b.rightUpperArm, 0.08, 0, 1.18 - armSwing + gesture);
    set(b.rightLowerArm, 0, 0.18 + gesture * 0.6, 0);

    this.applyGesture(t, set);
  }

  /** 在基础姿势之上叠加当前一次性手势。 */
  private applyGesture(
    t: number,
    set: (node: THREE.Object3D | null, x: number, y: number, z: number) => void,
  ): void {
    const b = this.bones;
    if (!b || !this.gesture) return;
    const amount = this.gestureAmount(t);
    if (amount <= 0) {
      this.gesture = null;
      return;
    }
    const e = t - this.gestureStart;

    switch (this.gesture) {
      case "wave": {
        // 右臂抬起并快速左右摆动 = 招手
        const lerp = (a: number, c: number) => a + (c - a) * amount;
        const wob = Math.sin(t * 13) * 0.45;
        set(b.rightUpperArm, 0.15, 0, lerp(1.18, -0.55));
        set(b.rightLowerArm, 0, 0, lerp(0.18, -0.9 + wob));
        break;
      }
      case "nod": {
        // 点头两下（绕 X 轴上下）
        const head = b.head;
        if (head) head.rotation.x += Math.sin(e * 9) * 0.22 * amount;
        break;
      }
      case "shake": {
        // 摇头（绕 Y 轴左右）
        const head = b.head;
        if (head) head.rotation.y += Math.sin(e * 10) * 0.28 * amount;
        break;
      }
      case "think": {
        // 思考：歪头 + 右手抬到下巴附近
        const head = b.head;
        if (head) {
          head.rotation.z += 0.18 * amount;
          head.rotation.x += 0.08 * amount;
        }
        const lerp = (a: number, c: number) => a + (c - a) * amount;
        set(b.rightUpperArm, lerp(0.08, 0.5), 0, lerp(1.18, 0.35));
        set(b.rightLowerArm, 0, 0, lerp(0.18, 1.5));
        break;
      }
      case "bow": {
        // 鞠躬：脊柱前倾一次
        const bend = Math.sin((e / GESTURE_DURATION.bow) * Math.PI) * amount;
        if (b.spine) b.spine.rotation.x += 0.35 * bend;
        if (b.chest) b.chest.rotation.x += 0.15 * bend;
        break;
      }
    }
  }

  /** 当前手势的时间包络（0..1）：快速进入、保持、缓慢退出。 */
  private gestureAmount(t: number): number {
    if (!this.gesture) return 0;
    const duration = GESTURE_DURATION[this.gesture];
    const e = t - this.gestureStart;
    if (e < 0 || e > duration) return 0;
    const rampIn = Math.min(1, e / 0.3);
    const rampOut = Math.min(1, (duration - e) / 0.4);
    return Math.min(rampIn, rampOut);
  }

  private updateBlink(vrm: VRM, delta: number): void {
    this.blinkTimer += delta;
    const since = this.blinkTimer - this.nextBlinkAt;
    let blink = 0;
    if (since >= 0 && since < 0.18) {
      // 0.18 秒内完成一次闭-睁
      blink = Math.sin((since / 0.18) * Math.PI);
    } else if (since >= 0.18) {
      this.nextBlinkAt = this.blinkTimer + 2 + Math.random() * 3;
    }
    vrm.expressionManager?.setValue("blink", blink);
  }
}
