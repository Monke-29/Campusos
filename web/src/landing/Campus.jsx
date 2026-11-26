// The hero: a miniature clay campus under warm studio light.
// Scroll: complaint pins pop up over Block C one by one, then collapse into one glowing ticket pin
// while the camera dollies in to room C-204. Progress arrives via `progress.current` (0..1).
import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { rng } from "./geometry.js";

const CLAY = { base: "#2f241d", top: "#43352a", path: "#5a4738", sand: "#dcc7a8", sand2: "#cfb592", roof: "#b99a78", olive: "#7f8a5b", olive2: "#6c7a4c", trunk: "#5b4334", window: "#2a201a" };
const EMBER = new THREE.Color("#ff7a3d");

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const range = (p, a, b) => clamp01((p - a) / (b - a));
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const clay = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, ...extra });

// [name, x, z, w, h, d, floors, cols, color]
const BLOCKS = [
  ["A", -3.1, -1.45, 2.0, 1.35, 1.2, 3, 5, CLAY.sand],
  ["B", -3.0, 1.45, 1.8, 0.95, 1.25, 2, 4, CLAY.sand2],
  ["C", 0, -1.5, 2.3, 1.85, 1.3, 4, 6, CLAY.sand],
  ["D", 3.1, -1.5, 1.6, 1.5, 1.15, 3, 4, CLAY.sand2],
  ["H", 3.15, 1.5, 2.1, 1.15, 1.0, 3, 6, CLAY.sand2],
];
const C204 = { floor: 1, col: 3 }; // second floor, fourth window
const PIN_HOME = new THREE.Vector3(0.25, 3.2, -1.5); // where the single ticket pin lands, above Block C

function Building({ x, z, w, h, d, floors, cols, color, glow }) {
  const body = useMemo(() => new RoundedBoxGeometry(w, h, d, 4, 0.07), [w, h, d]);
  const roof = useMemo(() => new RoundedBoxGeometry(w + 0.12, 0.12, d + 0.12, 3, 0.05), [w, d]);
  const win = useMemo(() => new RoundedBoxGeometry((w / cols) * 0.5, (h / floors) * 0.42, 0.05, 2, 0.015), [w, h, floors, cols]);
  const bodyMat = useMemo(() => clay(color), [color]);
  const roofMat = useMemo(() => clay(CLAY.roof), []);
  const winMat = useMemo(() => clay(CLAY.window, { roughness: 0.6 }), []);
  const windows = [];
  for (let f = 0; f < floors; f++)
    for (let c = 0; c < cols; c++) {
      const px = -w / 2 + (w / cols) * (c + 0.5);
      const py = -h / 2 + (h / floors) * (f + 0.55);
      const isGlow = glow && f === C204.floor && c === C204.col;
      windows.push(<mesh key={`${f}-${c}`} geometry={win} material={isGlow ? glow : winMat} position={[px, py, d / 2 + 0.005]} />);
    }
  return (
    <group position={[x, h / 2 + 0.25, z]}>
      <mesh geometry={body} material={bodyMat} castShadow receiveShadow />
      <mesh geometry={roof} material={roofMat} position={[0, h / 2 + 0.04, 0]} castShadow receiveShadow />
      {windows}
    </group>
  );
}

function Library({ x, z }) {
  const mat = useMemo(() => clay(CLAY.sand), []);
  const roof = useMemo(() => clay(CLAY.roof), []);
  return (
    <group position={[x, 0.25, z]}>
      <mesh material={mat} position={[0, 0.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.85, 0.9, 1.0, 48]} />
      </mesh>
      <mesh material={roof} position={[0, 1.0, 0]} castShadow>
        <sphereGeometry args={[0.72, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return (
          <mesh key={i} material={roof} position={[Math.cos(a) * 0.96, 0.42, Math.sin(a) * 0.96]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.84, 12]} />
          </mesh>
        );
      })}
    </group>
  );
}

function Trees() {
  const trees = useMemo(() => {
    const r = rng(11);
    const spots = [[-1.4, 0.2], [-1.6, 2.6], [1.6, 0.1], [1.5, 2.7], [-4.3, 0.1], [4.4, 0.0], [-0.2, 2.9], [-4.4, 2.8], [4.5, -2.9], [-4.4, -2.9], [1.7, -2.8]];
    return spots.map(([x, z]) => ({ x: x + (r() - 0.5) * 0.3, z: z + (r() - 0.5) * 0.3, s: 0.75 + r() * 0.45, c: r() > 0.5 ? CLAY.olive : CLAY.olive2 }));
  }, []);
  const trunk = useMemo(() => clay(CLAY.trunk), []);
  const mats = useMemo(() => ({ [CLAY.olive]: clay(CLAY.olive), [CLAY.olive2]: clay(CLAY.olive2) }), []);
  return trees.map((t, i) => (
    <group key={i} position={[t.x, 0.25, t.z]} scale={t.s}>
      <mesh material={trunk} position={[0, 0.15, 0]} castShadow><cylinderGeometry args={[0.04, 0.06, 0.3, 10]} /></mesh>
      <mesh material={mats[t.c]} position={[0, 0.45, 0]} castShadow receiveShadow><sphereGeometry args={[0.28, 24, 16]} /></mesh>
      <mesh material={mats[t.c]} position={[0.12, 0.62, 0.05]} castShadow><sphereGeometry args={[0.18, 20, 14]} /></mesh>
    </group>
  ));
}

function Plinth() {
  const base = useMemo(() => new RoundedBoxGeometry(10.6, 0.5, 7.6, 6, 0.22), []);
  const path = useMemo(() => new RoundedBoxGeometry(1, 0.04, 1, 2, 0.02), []);
  const baseMat = useMemo(() => clay(CLAY.base), []);
  const topMat = useMemo(() => clay(CLAY.top), []);
  const pathMat = useMemo(() => clay(CLAY.path), []);
  return (
    <group>
      <mesh geometry={base} material={baseMat} receiveShadow />
      <mesh material={topMat} position={[0, 0.252, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10.1, 7.1]} />
      </mesh>
      {/* paths */}
      <mesh geometry={path} material={pathMat} position={[0, 0.27, 0]} scale={[9.4, 1, 0.5]} receiveShadow />
      <mesh geometry={path} material={pathMat} position={[0, 0.27, 0.3]} scale={[0.5, 1, 5.6]} receiveShadow />
      <mesh geometry={path} material={pathMat} position={[-3.05, 0.27, 0]} scale={[0.4, 1, 2.6]} receiveShadow />
      <mesh geometry={path} material={pathMat} position={[3.1, 0.27, 0]} scale={[0.4, 1, 2.6]} receiveShadow />
    </group>
  );
}

// One map pin: clay stem + glossy head.
function Pin({ color = "#ff7a3d", scale = 1, emissive = 0.9, pinRef, headMatRef }) {
  const head = useMemo(() => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, roughness: 0.35 }), [color, emissive]);
  const stem = useMemo(() => clay("#e9dcc8", { roughness: 0.6 }), []);
  return (
    <group ref={pinRef} scale={scale}>
      <mesh material={stem} position={[0, -0.22, 0]} castShadow><cylinderGeometry args={[0.012, 0.012, 0.44, 8]} /></mesh>
      <mesh ref={headMatRef} material={head} castShadow><sphereGeometry args={[0.085, 24, 16]} /></mesh>
    </group>
  );
}

function Scene({ progress, pointer, labels }) {
  const { camera, size } = useThree();
  const world = useRef();
  const pins = useRef([]);
  const big = useRef();
  const ring = useRef();
  const safety = useRef();
  const smooth = useRef(0);
  const wide = size.width / size.height > 1.15;

  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: CLAY.window, emissive: EMBER, emissiveIntensity: 0, roughness: 0.5 }), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: EMBER, transparent: true, opacity: 0, depthWrite: false }), []);

  // 15 complaint pins scattered above Block C's roof
  const spots = useMemo(() => {
    const r = rng(5);
    return Array.from({ length: 15 }, () => new THREE.Vector3(-1.0 + r() * 2.0, 2.35 + r() * 0.75, -1.5 + (r() - 0.5) * 1.0));
  }, []);

  const tmp = useMemo(() => ({ v: new THREE.Vector3(), look: new THREE.Vector3(), camFrom: new THREE.Vector3(14, 10.8, 16), camTo: new THREE.Vector3(5.2, 8.4, 12.6) }), []);

  useFrame((state, dt) => {
    smooth.current += (progress.current - smooth.current) * Math.min(1, dt * 4.5);
    const p = smooth.current;
    const t = state.clock.elapsedTime;

    // camera: wide product shot → dolly towards Block C
    const dolly = easeInOut(range(p, 0.5, 0.95));
    camera.position.lerpVectors(tmp.camFrom, tmp.camTo, dolly).multiplyScalar(wide ? 1 : 1.7); // phones: step back so it fits
    camera.position.x += pointer.current.x * 0.6;
    camera.position.y += -pointer.current.y * 0.4;
    // on wide screens the model sits to the right of the headline at first
    const shift = wide ? (1 - easeInOut(range(p, 0.05, 0.5))) * -4.6 : 0;
    // phones: the model sits in the top half, above the headline
    tmp.look.set(shift, (wide ? 0.6 : -2.6 + dolly * 1.6) + dolly * 1.1, dolly * -1.4);
    camera.lookAt(tmp.look);

    // slow turntable, a little more turn as you scroll
    world.current.rotation.y = -0.32 + Math.sin(t * 0.18) * 0.06 + p * 0.38;

    // complaint pins: pop in one by one, then fly into one
    const merge = easeInOut(range(p, 0.48, 0.66));
    pins.current.forEach((pin, i) => {
      if (!pin) return;
      const appear = range(p, 0.08 + i * 0.024, 0.12 + i * 0.024);
      const s = appear > 0 ? easeOutBack(appear) * (1 - merge) : 0;
      pin.scale.setScalar(Math.max(0.0001, s));
      tmp.v.copy(spots[i]).lerp(PIN_HOME, merge);
      tmp.v.y += Math.sin(t * 1.6 + i) * 0.03 * (1 - merge);
      pin.position.copy(tmp.v);
    });

    // the one ticket pin + a ring pulsing on the roof
    const bigS = easeOutBack(range(p, 0.6, 0.72));
    big.current.scale.setScalar(Math.max(0.0001, bigS * 1.9));
    big.current.position.set(PIN_HOME.x, PIN_HOME.y + Math.sin(t * 1.4) * 0.04, PIN_HOME.z);
    const pulse = (t * 0.6) % 1;
    ring.current.scale.setScalar(0.4 + pulse * 1.6);
    ringMat.opacity = bigS * (1 - pulse) * 0.55;

    // room C-204 lights up once the ticket exists
    glow.emissiveIntensity = 0.15 + range(p, 0.62, 0.8) * 2.2 + Math.sin(t * 3) * 0.05;

    // the safety pin over Block B keeps pulsing: always first in the queue
    const sp = 1 + Math.sin(t * 4) * 0.12;
    safety.current.scale.setScalar(sp * 1.15);

    // HTML labels follow their 3D anchors
    for (const l of labels.current) {
      if (!l.el) continue;
      tmp.v.copy(l.at);
      world.current.localToWorld(tmp.v);
      tmp.v.project(camera);
      const x = (tmp.v.x * 0.5 + 0.5) * size.width, y = (-tmp.v.y * 0.5 + 0.5) * size.height;
      l.el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
      l.el.style.opacity = l.show ? l.show(p) : 1;
    }
  });

  return (
    <>
      <hemisphereLight args={["#ffe8cf", "#2a1c12", 0.55]} />
      <directionalLight
        position={[6, 11, 6]} intensity={2.6} color="#ffd6ad" castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02}
        shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8}
      />
      <directionalLight position={[-6, 3, -5]} intensity={0.9} color="#ff8a4d" />
      <pointLight position={[0, 4, 3]} intensity={6} distance={12} color="#ffb98a" />

      <group ref={world}>
        <Plinth />
        {BLOCKS.map(([name, x, z, w, h, d, floors, cols, color]) => (
          <Building key={name} x={x} z={z} w={w} h={h} d={d} floors={floors} cols={cols} color={color} glow={name === "C" ? glow : null} />
        ))}
        <Library x={0.3} z={1.75} />
        <Trees />

        {spots.map((_, i) => <Pin key={i} pinRef={(el) => (pins.current[i] = el)} />)}
        <Pin pinRef={big} />
        <mesh ref={ring} material={ringMat} position={[PIN_HOME.x, 2.2, -1.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.56, 64]} />
        </mesh>

        {/* other live tickets around campus */}
        <group position={[-3.0, 1.75, 1.45]}><Pin pinRef={safety} color="#ff5a4e" emissive={1.4} /></group>
        <group position={[0.3, 2.45, 1.75]}><Pin color="#f0b65c" emissive={0.7} /></group>
        <group position={[3.15, 1.9, 1.5]}><Pin color="#f0b65c" emissive={0.7} /></group>
      </group>
    </>
  );
}

const LABELS = [
  ["Block A", [-3.1, 1.85, -1.45]],
  ["Lab B · sparks", [-3.0, 1.95, 1.45], "danger"],
  ["Block C", [0, 2.35, -1.5], null, (p) => 1 - range(p, 0.1, 0.2)],
  ["Block D", [3.1, 2.0, -1.5]],
  ["Library · Wi-Fi", [0.3, 2.65, 1.75], "amber"],
  ["Hostel · cooler", [3.15, 2.1, 1.5], "amber"],
  ["T1001 · ×15", [0.25, 3.55, -1.5], "ember", (p) => range(p, 0.68, 0.76)],
];

export default function Campus({ progress, pointer }) {
  const labels = useRef(LABELS.map(([text, at, tone, show]) => ({ text, at: new THREE.Vector3(...at), tone, show, el: null })));
  return (
    <>
      <Canvas
        shadows
        camera={{ position: [14, 10.8, 16], fov: 26, near: 0.1, far: 100 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Scene progress={progress} pointer={pointer} labels={labels} />
      </Canvas>
      <div className="campus-labels" aria-hidden="true">
        {labels.current.map((l, i) => (
          <span key={i} ref={(el) => (l.el = el)} className={`campus-label ${l.tone || ""}`}>{l.text}</span>
        ))}
      </div>
    </>
  );
}
