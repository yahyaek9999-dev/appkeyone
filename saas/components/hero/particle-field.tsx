"use client";

import { useRef, useEffect } from "react";

interface Particle {
  x: number;
  y: number;
  size: number;
  opacity: number;
  speedX: number;
  speedY: number;
  phase: number;
}

const PARTICLE_COUNT = 60;
const MAX_SPEED = 0.3;
const MOUSE_RADIUS = 120;
const DRIFT_AMPLITUDE = 0.15;

export default function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;

    function resize() {
      if (!canvas) return;
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }

    function initParticles() {
      particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        size: 0.6 + Math.random() * 1.8,
        opacity: 0.06 + Math.random() * 0.18,
        speedX: (Math.random() - 0.5) * MAX_SPEED * 2,
        speedY: (Math.random() - 0.5) * MAX_SPEED * 2,
        phase: Math.random() * Math.PI * 2,
      }));
    }

    resize();
    initParticles();

    function tick() {
      ctx!.clearRect(0, 0, w, h);
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (const p of particlesRef.current) {
        // Drift with sine wave
        p.x += p.speedX + Math.sin(Date.now() * 0.001 + p.phase) * DRIFT_AMPLITUDE;
        p.y += p.speedY + Math.cos(Date.now() * 0.001 + p.phase * 1.3) * DRIFT_AMPLITUDE;

        // Mouse repulsion
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MOUSE_RADIUS && dist > 0) {
          const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS;
          p.x += (dx / dist) * force * 1.2;
          p.y += (dy / dist) * force * 1.2;
        }

        // Wrap around screen
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        // Draw
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255,255,255,${p.opacity})`;
        ctx!.fill();
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    tick();

    function onMouseMove(e: MouseEvent) {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    }

    function onMouseLeave() {
      mouseRef.current.x = -9999;
      mouseRef.current.y = -9999;
    }

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mouseleave", onMouseLeave, { passive: true });
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-10"
      aria-hidden="true"
      style={{ willChange: "transform" }}
    />
  );
}
