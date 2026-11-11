import {
  AmbientLight,
  DirectionalLight,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";

export function mountScene(canvas: HTMLCanvasElement): () => void {
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: "low-power",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 10);
  camera.position.z = 3.2;

  const geometry = new IcosahedronGeometry(1, 1);
  const material = new MeshStandardMaterial({
    color: 0x0b3d3a,
    roughness: 0.42,
    metalness: 0.08,
  });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);

  scene.add(new AmbientLight(0xffffff, 0.75));
  const key = new DirectionalLight(0xffffff, 1.5);
  key.position.set(2.2, 2.4, 3.2);
  scene.add(key);

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0;
  let running = false;

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const render = () => {
    renderer.render(scene, camera);
  };

  const tick = (time: number) => {
    if (!running) return;
    mesh.rotation.y = time * 0.00022;
    mesh.rotation.x = Math.sin(time * 0.00013) * 0.18;
    render();
    frame = window.requestAnimationFrame(tick);
  };

  const setRunning = (next: boolean) => {
    if (next === running) return;
    running = next;
    if (running) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    window.cancelAnimationFrame(frame);
  };

  const sync = () => {
    const visible = !document.hidden;
    setRunning(visible && !motion.matches);
    if (!running) render();
  };

  const onView: IntersectionObserverCallback = (entries) => {
    const seen = entries.some((entry) => entry.isIntersecting);
    if (!seen) {
      setRunning(false);
      return;
    }
    sync();
  };

  const view = new IntersectionObserver(onView, { threshold: 0.2 });
  const box = new ResizeObserver(resize);
  view.observe(canvas);
  box.observe(canvas);
  resize();
  render();
  sync();

  document.addEventListener("visibilitychange", sync);
  motion.addEventListener("change", sync);

  return () => {
    setRunning(false);
    view.disconnect();
    box.disconnect();
    document.removeEventListener("visibilitychange", sync);
    motion.removeEventListener("change", sync);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  };
}
