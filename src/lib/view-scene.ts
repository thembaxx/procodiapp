import {
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  WebGLRenderer,
} from "three";
import type { Material } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Design } from "@/lib/appearance";

export type SceneAppearance = { design: Design; light: boolean; brand: string };

export function createViewScene(canvas: HTMLCanvasElement, appearance: SceneAppearance) {
  const context = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    powerPreference: "low-power",
    depth: false,
  });
  if (!context) return null;
  const renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: false });
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 40);
  camera.position.z = 12;
  const groups = { wallet: new Group(), rewards: new Group(), orbit: new Group() };
  scene.add(...Object.values(groups));
  const brand = new Color(appearance.brand);
  const targetBrand = new Color(appearance.brand);
  const ribbons: ShaderMaterial[] = [];
  for (let index = 0; index < 3; index++) {
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        uTime: { value: index * 4 },
        uColor: { value: brand.clone() },
        uOpacity: { value: 0.18 },
      },
      vertexShader: `uniform float uTime; varying vec2 vUv; void main() { vUv = uv; vec3 p = position; p.z = sin(p.x * .7 + uTime * .24) * .5; p.y += sin(p.x * .9 + uTime * .2) * .24; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; void main() { float edge = sin(vUv.y * 3.14159) * smoothstep(0., .12, vUv.x) * (1. - smoothstep(.88, 1., vUv.x)); gl_FragColor = vec4(mix(uColor, vec3(1.), vUv.y * .15), edge * uOpacity); }`,
    });
    const ribbon = new Mesh(new PlaneGeometry(11, 0.55, 64, 6), material);
    ribbon.position.set(0, index * 0.55 - 0.55, -index * 0.3);
    ribbon.rotation.z = -0.32;
    groups.wallet.add(ribbon);
    ribbons.push(material);
  }
  const dustGeometry = new BufferGeometry();
  const dust = [];
  for (let index = 0; index < 48; index++)
    dust.push(Math.sin(index * 2.4) * 4.5, Math.cos(index * 1.7) * 2.2, -2);
  dustGeometry.setAttribute("position", new Float32BufferAttribute(dust, 3));
  const dustMaterial = new PointsMaterial({
    color: brand,
    size: 0.028,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  const particles = new Points(dustGeometry, dustMaterial);
  groups.wallet.add(particles);

  const tileGeometry = new RoundedBoxGeometry(0.86, 0.56, 0.08, 2, 0.07);
  const tiles: Mesh[] = [];
  const tileMaterials: MeshBasicMaterial[] = [];
  for (let index = 0; index < 9; index++) {
    const material = new MeshBasicMaterial({
      color: ["#437be5", "#77caba", "#a29be0"][index % 3],
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    });
    const tile = new Mesh(tileGeometry, material);
    tile.rotation.set(0.35, index * 0.4, index * 0.68);
    tile.scale.setScalar(0.8 + (index % 4) * 0.16);
    groups.rewards.add(tile);
    tiles.push(tile);
    tileMaterials.push(material);
  }

  const ringMaterial = new MeshBasicMaterial({
    color: "#9b83d7",
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
  });
  const moonMaterial = new MeshBasicMaterial({
    color: "#b7a2ef",
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  const moonGeometry = new SphereGeometry(0.065, 12, 8);
  const rings: Group[] = [];
  for (let index = 0; index < 4; index++) {
    const ring = new Group();
    const radius = 1.1 + index * 0.48;
    ring.add(new Mesh(new TorusGeometry(radius, 0.009, 6, 96), ringMaterial));
    const moon = new Mesh(moonGeometry, moonMaterial);
    moon.position.x = radius;
    ring.add(moon);
    groups.orbit.add(ring);
    rings.push(ring);
  }

  let active = appearance;
  let width = 10;
  let raf = 0;
  let running = false;
  let disposed = false;
  let elapsed = 0;
  let lastFrame = 0;
  let burst = 0;
  const pointer = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };

  function draw(timestamp: number) {
    if (!running || disposed) return;
    raf = requestAnimationFrame(draw);
    // Cap GPU work at 30fps, including displays with high refresh rates.
    if (timestamp - lastFrame < 1000 / 30) return;
    elapsed += Math.min((timestamp - (lastFrame || timestamp)) / 1000, 0.06);
    lastFrame = timestamp;
    eased.x += (pointer.x - eased.x) * 0.055;
    eased.y += (pointer.y - eased.y) * 0.055;
    brand.lerp(targetBrand, 0.04);
    burst *= 0.94;
    for (const [name, group] of Object.entries(groups)) group.visible = name === active.design;

    groups.wallet.position.set(width * 0.14 + eased.x * 0.15, -1.4 + eased.y * 0.12, 0);
    ribbons.forEach((material, index) => {
      material.uniforms.uTime.value = elapsed + index * 4;
      material.uniforms.uColor.value.copy(brand);
      material.uniforms.uOpacity.value = (active.light ? 0.13 : 0.2) + burst * 0.04;
    });
    dustMaterial.color.copy(brand);
    particles.rotation.z = elapsed * 0.008;
    particles.scale.setScalar(1 + burst * 0.08);
    tiles.forEach((tile, index) => {
      const side = index % 2 ? 1 : -1;
      tile.position.set(
        side * width * (0.34 + (index % 3) * 0.08) +
          Math.sin(elapsed * 0.12 + index) * 0.18 +
          eased.x * 0.12,
        ((index * 1.2 + elapsed * 0.13) % 12) - 6 + eased.y * 0.1,
        -1,
      );
      tile.rotation.y = index * 0.4 + elapsed * 0.04;
      tile.rotation.z = index * 0.68 + Math.sin(elapsed * 0.16 + index) * 0.1;
      tileMaterials[index].opacity = (active.light ? 0.1 : 0.16) + burst * 0.04;
    });
    groups.orbit.position.set(width * 0.38 + eased.x * 0.14, -0.8 + eased.y * 0.12, 0);
    groups.orbit.rotation.y = eased.x * 0.04;
    groups.orbit.scale.setScalar(1 + burst * 0.035);
    ringMaterial.opacity = active.light ? 0.2 : 0.3;
    rings.forEach((ring, index) => {
      ring.rotation.set(
        0.48 + index * 0.25,
        0.2 + Math.sin(elapsed * 0.09 + index) * 0.1,
        elapsed * (0.035 + index * 0.008) + index * 1.2,
      );
    });
    renderer.render(scene, camera);
  }

  return {
    setAppearance(next: SceneAppearance) {
      active = next;
      targetBrand.set(next.brand);
    },
    resize(pixelWidth: number, pixelHeight: number, pixelRatio: number) {
      width = (10 * pixelWidth) / pixelHeight;
      camera.left = -width / 2;
      camera.right = width / 2;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(pixelRatio, pixelWidth < 600 ? 1.25 : 1.5));
      renderer.setSize(pixelWidth, pixelHeight, false);
    },
    pointer(x: number, y: number) {
      pointer.x = x;
      pointer.y = y;
    },
    delight() {
      burst = 1;
    },
    setRunning(value: boolean) {
      if (disposed || value === running) return;
      running = value;
      if (running) {
        lastFrame = 0;
        raf = requestAnimationFrame(draw);
      } else cancelAnimationFrame(raf);
    },
    dispose() {
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      scene.traverse((object) => {
        if (object instanceof Mesh || object instanceof Points) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            materials.add(material);
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
