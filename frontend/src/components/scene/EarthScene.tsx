import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);

const EARTH_RADIUS = 1.6;

const MARKERS: Array<{ name: string; lat: number; lon: number }> = [
  { name: "Dubai", lat: 25.11, lon: 55.13 },
  { name: "Rotterdam", lat: 51.94, lon: 4.28 },
  { name: "Three Gorges", lat: 30.87, lon: 110.9 },
  { name: "Lake Urmia", lat: 37.7, lon: 45.45 },
  { name: "Lagos", lat: 6.45, lon: 3.42 },
  { name: "Atacama", lat: -23.4, lon: -69.05 },
];

function latLonToVector(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function vectorToLatLon(point: THREE.Vector3): { lat: number; lon: number } {
  const radius = point.length();
  const lat = 90 - (Math.acos(THREE.MathUtils.clamp(point.y / radius, -1, 1)) * 180) / Math.PI;
  const lon = ((Math.atan2(point.z, -point.x) * 180) / Math.PI + 360) % 360 - 180;
  return { lat, lon };
}

function buildAtmosphere(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color("#c6f36b") },
      intensity: { value: 1.25 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 glowColor;
      uniform float intensity;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float rim = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.4);
        gl_FragColor = vec4(glowColor, rim * intensity);
      }
    `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

function buildStars(): THREE.Points {
  const count = 2800;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const radius = 34 + Math.random() * 40;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi);
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xf3f0e7,
    size: 0.16,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  return new THREE.Points(geometry, material);
}

function buildOrbit(radius: number, color: number, tilt: [number, number, number], opacity: number) {
  const points: THREE.Vector3[] = [];
  for (let step = 0; step <= 180; step += 1) {
    const angle = (step / 180) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const ring = new THREE.Line(geometry, material);
  ring.rotation.set(tilt[0], tilt[1], tilt[2]);
  return ring;
}

export function EarthScene({
  onPick,
  className,
  interactive = true,
  scrollDriven = false,
}: {
  onPick?: (lat: number, lon: number) => void;
  className?: string;
  interactive?: boolean;
  scrollDriven?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    camera.position.set(0, 0.35, 4.55);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);

    const globe = new THREE.Group();
    globe.rotation.set(0.18, -1.02, 0.06);
    scene.add(globe);

    const loader = new THREE.TextureLoader();
    const textures: THREE.Texture[] = [];

    const loadTexture = (url: string, srgb: boolean) => {
      const texture = loader.load(url, () => {
        if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        texture.needsUpdate = true;
      });
      textures.push(texture);
      return texture;
    };

    const surface = loadTexture("/textures/earth_atmos_2048.jpg", true);
    const specular = loadTexture("/textures/earth_specular_2048.jpg", false);
    const cloudsMap = loadTexture("/textures/earth_clouds_1024.png", true);

    const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 96, 96);
    const earthMaterial = new THREE.MeshStandardMaterial({
      map: surface,
      metalnessMap: specular,
      metalness: 0.18,
      roughness: 0.82,
    });
    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    globe.add(earth);

    const cloudMaterial = new THREE.MeshStandardMaterial({
      map: cloudsMap,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const cloudGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.008, 72, 72);
    const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
    globe.add(clouds);

    const atmosphereMaterial = buildAtmosphere();
    const atmosphereGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.055, 64, 64);
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    globe.add(atmosphere);

    const markerGeometry = new THREE.SphereGeometry(0.0115, 12, 12);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xc6f36b });
    MARKERS.forEach((marker) => {
      const dot = new THREE.Mesh(markerGeometry, markerMaterial);
      dot.position.copy(latLonToVector(marker.lat, marker.lon, EARTH_RADIUS * 1.004));
      globe.add(dot);
    });

    const stars = buildStars();
    scene.add(stars);

    const orbits = new THREE.Group();
    orbits.add(buildOrbit(EARTH_RADIUS * 1.32, 0xc6f36b, [Math.PI / 2.35, 0.15, 0.4], 0.22));
    orbits.add(buildOrbit(EARTH_RADIUS * 1.52, 0xf3f0e7, [Math.PI / 1.7, -0.4, -0.2], 0.16));
    scene.add(orbits);

    const satelliteGeometry = new THREE.SphereGeometry(0.018, 12, 12);
    const satelliteMaterial = new THREE.MeshBasicMaterial({ color: 0xc6f36b });
    const satelliteA = new THREE.Mesh(satelliteGeometry, satelliteMaterial);
    const satelliteB = new THREE.Mesh(
      satelliteGeometry,
      new THREE.MeshBasicMaterial({ color: 0xf3f0e7 }),
    );
    satelliteB.scale.setScalar(0.8);
    orbits.add(satelliteA);
    orbits.add(satelliteB);

    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const keyLight = new THREE.DirectionalLight(0xf3f0e7, 2.6);
    keyLight.position.set(5, 2.2, 3.2);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x4a5a22, 0.9);
    rimLight.position.set(-4, 0.5, -2.5);
    scene.add(rimLight);
    const bounceLight = new THREE.PointLight(0xf3f0e7, 0.45, 12);
    bounceLight.position.set(0, -3, 0.5);
    scene.add(bounceLight);

    const controls = interactive ? new OrbitControls(camera, renderer.domElement) : null;
    if (controls) {
      controls.enablePan = false;
      controls.enableZoom = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.065;
      controls.rotateSpeed = 0.42;
      controls.autoRotate = !reduced && !scrollDriven;
      controls.autoRotateSpeed = 0.34;
      controls.minPolarAngle = Math.PI / 2.6;
      controls.maxPolarAngle = Math.PI / 1.6;
      controls.target.set(0, 0.05, 0);
    }

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown: { x: number; y: number } | null = null;
    const mouseTarget = { x: 0, y: 0 };
    const onMouseMoveParallax = (event: PointerEvent) => {
      const bounds = container.getBoundingClientRect();
      mouseTarget.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      mouseTarget.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    };
    container.addEventListener("pointermove", onMouseMoveParallax);

    const onPointerDown = (event: PointerEvent) => {
      pointerDown = { x: event.clientX, y: event.clientY };
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!pointerDown) return;
      const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
      pointerDown = null;
      if (moved > 6 || !onPickRef.current) return;
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(earth, false)[0];
      if (!hit) return;
      const local = globe.worldToLocal(hit.point.clone()).normalize().multiplyScalar(EARTH_RADIUS);
      const { lat, lon } = vectorToLatLon(local);
      onPickRef.current(lat, lon);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!onPickRef.current) return;
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      renderer.domElement.style.cursor = raycaster.intersectObject(earth, false).length
        ? "pointer"
        : "grab";
    };

    if (interactive) {
      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      renderer.domElement.addEventListener("pointerup", onPointerUp);
      renderer.domElement.addEventListener("pointermove", onPointerMove);
    }


    let lastProgress = 0;
    let scrollTrigger: ScrollTrigger | null = null;
    if (scrollDriven && !reduced) {
      scrollTrigger = ScrollTrigger.create({
        trigger: container,
        start: "top 85%",
        end: "bottom 15%",
        scrub: 1.2,
        onUpdate: (self) => {
          const p = self.progress;
          const deltaP = p - lastProgress;
          lastProgress = p;
          globe.rotation.y += deltaP * Math.PI * 0.95;
          globe.rotation.x = 0.18 + (p - 0.5) * 0.24;
          globe.scale.setScalar(1 + (p - 0.5) * 0.2);
          orbits.rotation.y += deltaP * Math.PI * 0.75;
          (atmosphereMaterial.uniforms.intensity as { value: number }).value = 1.25 + p * 0.5;
          camera.position.z = 4.7 - p * 0.55;
          camera.position.y = 0.35 + (p - 0.5) * 0.18;
        },
      });
    }

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.elapsedTime;
      clouds.rotation.y += delta * 0.012;
      if (!reduced) {
        globe.rotation.y += delta * 0.08;
        orbits.rotation.y += delta * 0.035;
        satelliteA.position.set(
          Math.cos(elapsed * 0.28) * EARTH_RADIUS * 1.32,
          0,
          Math.sin(elapsed * 0.28) * EARTH_RADIUS * 1.32,
        );
        satelliteA.position.applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.4);
        satelliteB.position.set(
          Math.cos(-elapsed * 0.2 + 1.2) * EARTH_RADIUS * 1.52,
          Math.sin(-elapsed * 0.2 + 1.2) * EARTH_RADIUS * 0.28,
          Math.sin(-elapsed * 0.2 + 1.2) * EARTH_RADIUS * 1.3,
        );
        stars.rotation.y += delta * 0.004;
      }
      // subtle mouse parallax on camera
      camera.position.x += (mouseTarget.x * 0.35 - camera.position.x) * 0.04;
      controls?.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      scrollTrigger?.kill();
      cancelAnimationFrame(frame);
      observer.disconnect();
      container.removeEventListener("pointermove", onMouseMoveParallax);
      if (interactive) {
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("pointerup", onPointerUp);
        renderer.domElement.removeEventListener("pointermove", onPointerMove);
      }
      controls?.dispose();
      textures.forEach((texture) => texture.dispose());
      earthGeometry.dispose();
      earthMaterial.dispose();
      cloudGeometry.dispose();
      cloudMaterial.dispose();
      atmosphereGeometry.dispose();
      atmosphereMaterial.dispose();
      markerGeometry.dispose();
      markerMaterial.dispose();
      satelliteGeometry.dispose();
      satelliteMaterial.dispose();
      orbits.traverse((object) => {
        if (object instanceof THREE.Line) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      });
      stars.geometry.dispose();
      (stars.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [interactive, scrollDriven]);

  return (
    <div
      ref={containerRef}
      className={className ?? "h-full w-full"}
      aria-label="Interactive 3D Earth"
      role="img"
    />
  );
}
