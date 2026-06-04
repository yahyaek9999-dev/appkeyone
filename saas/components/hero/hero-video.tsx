"use client";

import { useRef, useEffect, useCallback } from "react";

type HeroVideoProps = {
  src: string;
};

/**
 * Full-bleed video background that autoplays once then freezes on the last frame.
 * The <video> element is hidden behind a pointer-events-none wrapper so it feels
 * like a living background, not a media player.
 */
export default function HeroVideo({ src }: HeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleEnded = useCallback(() => {
    // Pausing the video preserves the last rendered frame — no jump, no black.
    videoRef.current?.pause();
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const attemptPlay = () => el.play().catch(() => {
      // Autoplay may be blocked; retry once on first user gesture.
      const handler = () => {
        el.play().catch(() => {});
        document.removeEventListener("pointerdown", handler);
      };
      document.addEventListener("pointerdown", handler, { once: true });
    });

    // If metadata is already loaded, play immediately.
    if (el.readyState >= 2) {
      attemptPlay();
    } else {
      el.addEventListener("loadedmetadata", attemptPlay, { once: true });
    }

    return () => {
      el.removeEventListener("loadedmetadata", attemptPlay);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <video
        ref={videoRef}
        src={src}
        autoPlay
        muted
        playsInline
        loop={false}
        controls={false}
        preload="auto"
        className="h-full w-full object-cover"
        style={{ willChange: "transform" }}
        onEnded={handleEnded}
      />
      {/* Faint overlay to blend the video into the dark canvas */}
      <div className="absolute inset-0 bg-black/30" />
    </div>
  );
}
