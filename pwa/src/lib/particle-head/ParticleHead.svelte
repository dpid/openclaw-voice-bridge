<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
  import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
  import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
  import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
  import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
  import vertexShader from './shaders/particle.vert?raw';
  import fragmentShader from './shaders/particle.frag?raw';
  import type { AppState } from '../types';

  // Props
  interface Props {
    state?: AppState;
    size?: number;
  }
  let { state = 'idle', size = 120 }: Props = $props();

  // State-based animation parameters
  const stateParams: Record<AppState, { rotateSpeed: number; animSpeed: number; bloomStrength: number }> = {
    idle: { rotateSpeed: 0.2, animSpeed: 0.15, bloomStrength: 0.4 },
    listening: { rotateSpeed: 0.4, animSpeed: 0.2, bloomStrength: 0.6 },
    recording: { rotateSpeed: 0.8, animSpeed: 0.5, bloomStrength: 0.9 },
    processing: { rotateSpeed: 1.5, animSpeed: 0.8, bloomStrength: 1.0 },
    speaking: { rotateSpeed: 0.6, animSpeed: 0.35, bloomStrength: 0.8 },
    error: { rotateSpeed: 0.1, animSpeed: 0.1, bloomStrength: 0.3 },
  };

  // Palette
  const PALETTE = [
    0x7c3aed, 0xa78bfa, 0xc4b5fd, 0x818cf8, 0x60a5fa, 0xffffff,
  ].map((c) => new THREE.Color(c));

  let container: HTMLDivElement;
  let animationId: number;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let composer: EffectComposer;
  let bloomPass: UnrealBloomPass;
  let clock: THREE.Clock;
  let material: THREE.ShaderMaterial;
  let points: THREE.Points;
  let loadError = $state(false);

  // Current interpolated values
  let currentRotateSpeed = stateParams.idle.rotateSpeed;
  let currentAnimSpeed = stateParams.idle.animSpeed;
  let currentBloomStrength = stateParams.idle.bloomStrength;

  async function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a14);

    // Camera - closer for compact view
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 28);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size);
    container.appendChild(renderer.domElement);

    // Post-processing
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size, size),
      stateParams.idle.bloomStrength,
      0.4,
      0.2
    );
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

    clock = new THREE.Clock();

    // Load particles
    const positions = await loadModelPositions('/models/head.gltf');
    const particleCount = positions.length / 3;

    const geometry = new THREE.BufferGeometry();
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const randoms = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const hsl = { h: 0, s: 0, l: 0 };
      color.getHSL(hsl);
      hsl.h += (Math.random() - 0.5) * 0.05;
      hsl.s = Math.min(1, Math.max(0.5, hsl.s + (Math.random() - 0.5) * 0.2));
      hsl.l = Math.min(0.9, Math.max(0.4, hsl.l + (Math.random() - 0.5) * 0.3));

      const finalColor = new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
      colors[i * 3] = finalColor.r;
      colors[i * 3 + 1] = finalColor.g;
      colors[i * 3 + 2] = finalColor.b;

      sizes[i] = 0.6 + Math.random() * 0.6;
      randoms[i * 3] = Math.random() * 10;
      randoms[i * 3 + 1] = Math.random() * Math.PI * 2;
      randoms[i * 3 + 2] = 0.5 + 0.5 * Math.random();
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('random', new THREE.BufferAttribute(randoms, 3));

    material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        animSpeed: { value: currentAnimSpeed },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
    });

    points = new THREE.Points(geometry, material);
    scene.add(points);

    animate();
  }

  function animate() {
    animationId = requestAnimationFrame(animate);

    const elapsed = clock.getElapsedTime();

    // Interpolate towards target values
    const targetParams = stateParams[state];
    const lerpFactor = 0.05;
    currentRotateSpeed += (targetParams.rotateSpeed - currentRotateSpeed) * lerpFactor;
    currentAnimSpeed += (targetParams.animSpeed - currentAnimSpeed) * lerpFactor;
    currentBloomStrength += (targetParams.bloomStrength - currentBloomStrength) * lerpFactor;

    // Apply values
    if (material) {
      material.uniforms.time.value = elapsed;
      material.uniforms.animSpeed.value = currentAnimSpeed;
    }
    if (bloomPass) {
      bloomPass.strength = currentBloomStrength;
    }
    if (points) {
      points.rotation.y += currentRotateSpeed * 0.01;
    }

    composer.render();
  }

  async function loadModelPositions(modelPath: string): Promise<Float32Array> {
    const loader = new GLTFLoader();

    return new Promise((resolve, reject) => {
      loader.load(
        modelPath,
        (gltf) => {
          const allPositions: number[] = [];
          gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh && child.geometry) {
              const positionAttr = child.geometry.attributes.position;
              if (positionAttr) {
                child.updateMatrixWorld(true);
                for (let i = 0; i < positionAttr.count; i++) {
                  const vertex = new THREE.Vector3();
                  vertex.fromBufferAttribute(positionAttr, i);
                  vertex.applyMatrix4(child.matrixWorld);
                  allPositions.push(vertex.x, vertex.y, vertex.z);
                }
              }
            }
          });
          resolve(normalizePositions(new Float32Array(allPositions)));
        },
        undefined,
        reject
      );
    });
  }

  function normalizePositions(positions: Float32Array): Float32Array {
    const TARGET_SIZE = 18;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i]);
      maxX = Math.max(maxX, positions[i]);
      minY = Math.min(minY, positions[i + 1]);
      maxY = Math.max(maxY, positions[i + 1]);
      minZ = Math.min(minZ, positions[i + 2]);
      maxZ = Math.max(maxZ, positions[i + 2]);
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const maxDimension = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
    const scale = TARGET_SIZE / maxDimension;

    const result = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      result[i] = (positions[i] - centerX) * scale;
      result[i + 1] = (positions[i + 1] - centerY) * scale;
      result[i + 2] = (positions[i + 2] - centerZ) * scale;
    }
    return result;
  }

  function cleanup() {
    if (animationId) cancelAnimationFrame(animationId);
    if (renderer) {
      renderer.dispose();
      renderer.domElement.remove();
    }
    if (composer) composer.dispose();
  }

  onMount(() => {
    init().catch((err) => {
      console.error('[ParticleHead] Failed to initialize:', err);
      loadError = true;
    });
  });

  onDestroy(() => {
    cleanup();
  });
</script>

{#if loadError}
  <div class="fallback" style="width: {size}px; height: {size}px;">
    🌀
  </div>
{:else}
  <div
    bind:this={container}
    class="particle-head"
    style="width: {size}px; height: {size}px;"
  ></div>
{/if}

<style>
  .particle-head {
    border-radius: 50%;
    overflow: hidden;
  }

  .particle-head :global(canvas) {
    border-radius: 50%;
  }

  .fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 80px;
    background: rgba(10, 10, 20, 0.5);
    border-radius: 50%;
  }
</style>
