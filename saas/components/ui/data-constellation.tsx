"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Subtle data constellation — abstract business-signal visualization.
 *
 * Renders floating data points with faint connecting lines, evoking a
 * real-time operations network. Extremely low visibility (opacity ~0.04–0.08)
 * so it never competes with content. Three.js, no robots/brains/holograms.
 */
export default function DataConstellation() {
  const ref = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);

  useEffect(() => {
    if (rendered.current || !ref.current) return;
    rendered.current = true;

    const W = ref.current.clientWidth || 1200;
    const H = ref.current.clientHeight || 800;
    const COUNT = 40;

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(60, W / H, 1, 100);
    camera.position.z = 28;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
    });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    ref.current.appendChild(renderer.domElement);

    // Points
    const positions = new Float32Array(COUNT * 3);
    const speeds: number[] = [];
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 15;
      speeds.push(0.002 + Math.random() * 0.006);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x0c7a6c,
      size: 0.12,
      transparent: true,
      opacity: 0.25,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // Lines
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x0c7a6c,
      transparent: true,
      opacity: 0.04,
    });

    const linePairs: number[][] = [];
    for (let i = 0; i < COUNT; i++) {
      for (let j = i + 1; j < COUNT; j++) {
        const dx = positions[i * 3] - positions[j * 3];
        const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
        const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 8 && Math.random() < 0.3) {
          linePairs.push([i, j]);
        }
      }
    }

    const lines: THREE.Line[] = [];
    for (const [a, b] of linePairs) {
      const geo = new THREE.BufferGeometry();
      const verts = new Float32Array([
        positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2],
        positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2],
      ]);
      geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
      const line = new THREE.Line(geo, lineMaterial);
      scene.add(line);
      lines.push(line);
    }

    // Animation
    let frame: number;
    let t = 0;
    function animate() {
      t++;
      const pos = points.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < COUNT; i++) {
        pos[i * 3 + 1] += Math.sin(t * speeds[i] + i) * 0.003;
        pos[i * 3] += Math.cos(t * speeds[i] * 0.7 + i * 0.5) * 0.002;
      }
      points.geometry.attributes.position.needsUpdate = true;

      for (const line of lines) {
        const lp = line.geometry.attributes.position.array as Float32Array;
        const aIdx = linePairs[lines.indexOf(line)][0];
        const bIdx = linePairs[lines.indexOf(line)][1];
        lp[0] = pos[aIdx * 3];
        lp[1] = pos[aIdx * 3 + 1];
        lp[2] = pos[aIdx * 3 + 2];
        lp[3] = pos[bIdx * 3];
        lp[4] = pos[bIdx * 3 + 1];
        lp[5] = pos[bIdx * 3 + 2];
        line.geometry.attributes.position.needsUpdate = true;
      }

      points.rotation.y += 0.0005;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    }
    animate();

    // Resize
    function onResize() {
      if (!ref.current) return;
      const w = ref.current.clientWidth || W;
      const h = ref.current.clientHeight || H;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      if (ref.current?.contains(renderer.domElement)) {
        ref.current.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      lineMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-60"
      aria-hidden="true"
    />
  );
}
