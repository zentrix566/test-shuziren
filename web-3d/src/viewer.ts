import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMUtils, VRMHumanBoneName } from "@pixiv/three-vrm";

/** 渲染循环里用到的骨骼集合，加载模型后填充。 */
interface PoseBones {
  spine: THREE.Object3D | null;
  chest: THREE.Object3D | null;
  neck: THREE.Object3D | null;
  head: THREE.Object3D | null;
  leftUpperArm: THREE.Object3D | null;
  rightUpperArm: THREE.Object3D | null;
  leftLowerArm: THREE.Object3D | null;
  rightLowerArm: THREE.Object3D | null;
}

/**
 * 负责 three.js 场景、相机、灯光、渲染循环，以及加载并驱动 VRM 角色。
 * 角色默认是 T-pose，这里会摆成自然站姿，并叠加呼吸、摇摆、眨眼与说话时的小动作。
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

  // 挥手动作：记录开始时间，applyPose 里按时间包络叠加
  private waveStart = -100;
  private readonly waveDuration = 2.6;

  // 由口型模块设置的目标张嘴值（0..1），渲染循环里平滑逼近，避免抖动
  private mouthTarget = 0;
  private mouthValue = 0;

  // 眨眼计时
  private blinkTimer = 0;
  private nextBlinkAt = 2.5;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

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

    const light = new THREE.DirectionalLight(0xffffff, 2.2);
    light.position.set(1, 1.5, 1.5);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    window.addEventListener("resize", () => this.onResize());
    this.animate();
  }

  /** 设置目标张嘴程度，由口型模块调用。 */
  setMouthOpen(value: number): void {
    this.mouthTarget = Math.max(0, Math.min(1, value));
  }

  /** 触发一次"挥手打招呼"动作。 */
  wave(): void {
    this.waveStart = this.elapsed;
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
    this.frameHead(vrm);
  }

  private collectBones(vrm: VRM): void {
    const get = (name: VRMHumanBoneName) =>
      vrm.humanoid?.getNormalizedBoneNode(name) ?? null;
    this.bones = {
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
      // 平滑逼近目标张嘴值
      this.mouthValue += (this.mouthTarget - this.mouthValue) * Math.min(1, delta * 18);
      vrm.expressionManager?.setValue("aa", this.mouthValue);

      this.applyPose(this.elapsed);
      this.updateBlink(vrm, delta);
      vrm.update(delta);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  /**
   * 每帧重摆姿势：自然站姿（手臂下垂）+ 呼吸 + 轻微摇摆 +
   * 说话时（mouthValue 越大）更明显的头部与手势小动作。
   */
  private applyPose(t: number): void {
    const b = this.bones;
    if (!b) return;
    const speak = this.mouthValue;

    const set = (node: THREE.Object3D | null, x: number, y: number, z: number) => {
      node?.rotation.set(x, y, z);
    };

    const breath = Math.sin(t * 1.6) * 0.025; // 呼吸起伏
    const sway = Math.sin(t * 0.6) * 0.03; // 身体缓慢摇摆

    set(b.spine, breath * 0.3, sway * 0.5, 0);
    set(b.chest, breath, 0, 0);
    set(b.neck, 0, sway, 0);

    // 头部：缓慢点头/转头，说话时加一点随节奏的小幅点头
    const headNod = Math.sin(t * 2.0) * 0.02 + speak * Math.sin(t * 9) * 0.05;
    const headTurn = Math.sin(t * 0.5) * 0.05;
    set(b.head, headNod, headTurn, Math.sin(t * 0.8) * 0.02);

    // 手臂：从 T-pose 放下到自然下垂（绕 Z 轴约 67°），叠加摇摆与说话手势
    const armSwing = Math.sin(t * 0.6) * 0.04;
    const gesture = speak * Math.sin(t * 4) * 0.1;
    set(b.leftUpperArm, 0.08, 0, -1.18 + armSwing - gesture);
    set(b.leftLowerArm, 0, -0.18 - gesture * 0.6, 0);

    // 右臂：常态自然下垂；挥手时抬起并左右摆动
    const wave = this.waveAmount(t);
    if (wave > 0) {
      const lerp = (a: number, c: number) => a + (c - a) * wave;
      const wob = Math.sin(t * 13) * 0.45; // 快速摆动 = 招手
      set(b.rightUpperArm, 0.15, 0, lerp(1.18, -0.55));
      set(b.rightLowerArm, 0, 0, lerp(0.18, -0.9 + wob));
    } else {
      set(b.rightUpperArm, 0.08, 0, 1.18 - armSwing + gesture);
      set(b.rightLowerArm, 0, 0.18 + gesture * 0.6, 0);
    }
  }

  /** 挥手动作的时间包络（0..1）：快速抬起、保持摆动、缓慢放下。 */
  private waveAmount(t: number): number {
    const e = t - this.waveStart;
    if (e < 0 || e > this.waveDuration) return 0;
    const rampIn = Math.min(1, e / 0.3);
    const rampOut = Math.min(1, (this.waveDuration - e) / 0.4);
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
