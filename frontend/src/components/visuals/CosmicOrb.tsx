import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import clsx from "clsx";

/**
 * Cosmic Orb — a real WebGL orb (no images, no video).
 *
 * A warped serum sphere: banded noise veins, a fresnel rim, an additive halo,
 * two inclined orbital rings and drifting particles. Everything is driven by a
 * single requestAnimationFrame loop that pauses when the orb is off-screen or
 * the tab is hidden. All GPU resources are released on unmount.
 *
 * Palette is SenseEarth's: obsidian body, acid-lime veins, warm-ivory specular.
 */
export interface OrbPalette {
  deep: string;
  core: string;
  rim: string;
  highlight: string;
}

export const ORB_PALETTE: OrbPalette = {
  deep: "#101208",
  core: "#7fa32f",
  rim: "#c6f36b",
  highlight: "#f3f0e7",
};

export interface CosmicOrbProps {
  className?: string;
  /** Multiplier for the internal animation clock. */
  speed?: number;
  /** Rotation multiplier. */
  spin?: number;
  /** Overall emissive strength. */
  intensity?: number;
  palette?: Partial<OrbPalette>;
  rings?: boolean;
  particles?: boolean;
  /** Pointer parallax tilt (disabled automatically for reduced motion). */
  interactive?: boolean;
  label?: string;
}

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  varying vec3 vWorldNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uCore;
  uniform vec3 uRim;
  uniform vec3 uHighlight;
  uniform float uIntensity;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldNormal;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.55;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 n = normalize(vNormal);
    float t = uTime;

    // Spherical coordinates so the pattern wraps without a seam.
    float lon = atan(n.z, n.x) / 6.2831853 + 0.5;
    float lat = asin(clamp(n.y, -1.0, 1.0)) / 3.1415926 + 0.5;

    vec2 p = vec2(lon * 5.0, lat * 4.0);
    float warp = fbm(p * 1.4 + vec2(t * 0.06, -t * 0.04));
    float veins = fbm(p * 2.6 + warp * 1.8 + vec2(-t * 0.03, t * 0.05));

    float ridge = smoothstep(0.42, 0.78, veins);
    ridge = pow(ridge, 1.35);

    vec3 base = mix(uDeep, uCore, ridge * 0.9);
    // Thin bright filaments
    float filament = smoothstep(0.7, 0.95, abs(sin(veins * 12.0 + t * 0.35))) * ridge;
    base += uRim * filament * 0.55;

    // Fresnel rim
    float fres = pow(1.0 - max(dot(n, vViewDir), 0.0), 2.4);
    base += uRim * fres * 1.15;

    // Warm ivory specular
    vec3 lightDir = normalize(vec3(0.55, 0.7, 0.45));
    vec3 h = normalize(lightDir + vViewDir);
    float spec = pow(max(dot(n, h), 0.0), 26.0);
    base += uHighlight * spec * 0.5;

    // Darken the limb slightly so the orb reads as a volume, not a disc.
    float limb = smoothstep(0.0, 0.55, max(dot(n, vViewDir), 0.0));
    base *= mix(0.72, 1.0, limb);

    gl_FragColor = vec4(base * uIntensity, 1.0);
  }
`;

const haloFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uRim;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 3.0);
    gl_FragColor = vec4(uRim, rim * 0.55 * uIntensity);
  }
`;

function buildParticles(count: number, radius: number) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = radius * (1.05 + Math.random() * 0.5);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) * 0.62;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

function buildRing(radius: number, tilt: [number, number, number], opacity: number) {
  const segments = 220;
  const positions = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: 0xc6f36b, transparent: true, opacity, depthWrite: false });
  const line = new THREE.Line(geometry, material);
  line.rotation.set(tilt[0], tilt[1], tilt[2]);
  return line;
}

export function CosmicOrb({
  className,
  speed = 1,
  spin = 1,
  intensity = 1,
  palette,
  rings = true,
  particles = true,
  interactive = true,
  label = "Animated orbital visual",
}: CosmicOrbProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colors: OrbPalette = { ...ORB_PALETTE, ...palette };

    let renderer: THREE.WebGLRenderer | null = null;
    // Some Chromium/Electron builds refuse a high-performance context when the
    // GPU process is under pressure; a plain context usually still works.
    for (const options of [
      { antialias: true, alpha: true, powerPreference: "high-performance" as const },
      { antialias: false, alpha: true },
    ]) {
      try {
        renderer = new THREE.WebGLRenderer(options);
        break;
      } catch {
        renderer = null;
      }
    }
    if (!renderer) {
      setFailed(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    camera.position.set(0, 0, 4.05);

    const group = new THREE.Group();
    scene.add(group);

    const uniforms = {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(colors.deep) },
      uCore: { value: new THREE.Color(colors.core) },
      uRim: { value: new THREE.Color(colors.rim) },
      uHighlight: { value: new THREE.Color(colors.highlight) },
      uIntensity: { value: intensity },
    };

    const orbMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
    });

    const sphereGeometry = new THREE.SphereGeometry(1.32, 96, 96);
    const orb = new THREE.Mesh(sphereGeometry, orbMaterial);
    group.add(orb);

    const haloGeometry = new THREE.SphereGeometry(1.32 * 1.035, 64, 64);
    const haloMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uRim: uniforms.uRim,
        uIntensity: uniforms.uIntensity,
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
      fragmentShader: haloFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    });
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    group.add(halo);

    const ringGroup = new THREE.Group();
    if (rings) {
      ringGroup.add(buildRing(1.72, [Math.PI / 2.4, 0.18, 0.35], 0.5));
      ringGroup.add(buildRing(1.95, [Math.PI / 1.75, -0.35, -0.18], 0.28));
      ringGroup.add(buildRing(2.16, [Math.PI / 2.9, 0.6, -0.5], 0.14));
    }
    group.add(ringGroup);

    let particlePoints: THREE.Points | null = null;
    if (particles) {
      const geometry = buildParticles(340, 1.75);
      const material = new THREE.PointsMaterial({
        color: new THREE.Color(colors.highlight),
        size: 0.018,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      particlePoints = new THREE.Points(geometry, material);
      group.add(particlePoints);
    }

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    // Do not animate canvases that are off-screen.
    let visible = true;
    const intersection = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
      },
      { rootMargin: "120px" },
    );
    intersection.observe(host);

    const pointer = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      const bounds = host.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    };
    if (interactive && !reduced) window.addEventListener("pointermove", onPointerMove, { passive: true });

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      if (!visible || document.hidden) return;
      if (!reduced) uniforms.uTime.value += delta * speed;
      group.rotation.y += delta * 0.14 * spin * (reduced ? 0 : 1);
      ringGroup.rotation.z += delta * 0.05 * spin * (reduced ? 0 : 1);
      if (particlePoints) particlePoints.rotation.y -= delta * 0.03 * spin * (reduced ? 0 : 1);

      if (!reduced) {
        group.rotation.x += (pointer.y * 0.16 - group.rotation.x) * 0.035;
        group.position.x += (pointer.x * 0.06 - group.position.x) * 0.03;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      if (interactive) window.removeEventListener("pointermove", onPointerMove);
      sphereGeometry.dispose();
      orbMaterial.dispose();
      haloGeometry.dispose();
      haloMaterial.dispose();
      if (particlePoints) {
        particlePoints.geometry.dispose();
        (particlePoints.material as THREE.Material).dispose();
      }
      ringGroup.children.forEach((child) => {
        if (child instanceof THREE.Line) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [speed, spin, intensity, palette, rings, particles, interactive]);

  if (failed) {
    return (
      <div
        className={clsx("relative flex items-center justify-center overflow-hidden", className)}
        aria-label={label}
        role="img"
      >
        <div className="size-[78%] rounded-full bg-[radial-gradient(circle_at_35%_30%,#c6f36b33,#151711_68%)] ring-1 ring-primary/25" />
      </div>
    );
  }

  return <div ref={hostRef} className={clsx("relative", className)} aria-label={label} role="img" />;
}
