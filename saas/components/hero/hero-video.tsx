"use client";

import { useRef, useEffect, useCallback } from "react";

type HeroVideoProps = {
  src: string;
  /**
   * Optional mobile-only source. When provided, this clip is shown on phones
   * (<768px) while `src` continues to drive tablet/desktop unchanged.
   */
  mobileSrc?: string;
};

/**
 * Full-bleed video background that autoplays once then freezes on the last frame.
 * The <video> element is hidden behind a pointer-events-none wrapper so it feels
 * like a living background, not a media player.
 *
 * Desktop/tablet (≥768px) keep the original `src` clip and behaviour. Phones
 * (<768px) get an optional `mobileSrc` clip instead — both elements are stacked
 * in the same absolutely-positioned, object-cover frame, so swapping one for the
 * other via responsive `display` never shifts layout (no CLS).
 */
export default function HeroVideo({ src, mobileSrc }: HeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mobileVideoRef = useRef<HTMLVideoElement>(null);

  const handleEnded = useCallback(() => {
    // Pausing the video preserves the last rendered frame — no jump, no black.
    videoRef.current?.pause();
  }, []);

  // Shared autoplay kick: try to play, and if the browser blocks autoplay,
  // retry once on the first user gesture.
  const startPlayback = useCallback((el: HTMLVideoElement | null) => {
    if (!el) return () => {};

    const attemptPlay = () =>
      el.play().catch(() => {
        const handler = () => {
          el.play().catch(() => {});
          document.removeEventListener("pointerdown", handler);
        };
        document.addEventListener("pointerdown", handler, { once: true });
      });

    if (el.readyState >= 2) {
      attemptPlay();
    } else {
      el.addEventListener("loadedmetadata", attemptPlay, { once: true });
    }

    return () => el.removeEventListener("loadedmetadata", attemptPlay);
  }, []);

  useEffect(() => {
    const cleanupDesktop = startPlayback(videoRef.current);
    const cleanupMobile = startPlayback(mobileVideoRef.current);
    return () => {
      cleanupDesktop();
      cleanupMobile();
    };
  }, [startPlayback]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Desktop / tablet clip — unchanged behaviour. Hidden only on phones. */}
      <video
        ref={videoRef}
        src={src}
        autoPlay
        muted
        playsInline
        loop={false}
        controls={false}
        preload="metadata"
        poster="/vedio-poster.jpg"
        className={mobileSrc ? "h-full w-full object-cover max-md:hidden" : "h-full w-full object-cover"}
        style={{ willChange: "transform" }}
        onEnded={handleEnded}
      />

      {/* Mobile-only clip — shown solely on phones (<768px). */}
      {mobileSrc && (
        <video
          ref={mobileVideoRef}
          src={mobileSrc}
          autoPlay
          muted
          loop
          playsInline
          controls={false}
          preload="metadata"
          poster="/mobile-poster.jpg"
          className="absolute inset-0 h-full w-full object-cover md:hidden"
          style={{ willChange: "transform" }}
        />
      )}

      {/* Faint overlay to blend the video into the dark canvas */}
      <div className="absolute inset-0 bg-black/30" />
    </div>
  );
}
