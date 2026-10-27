// Card thumbnail. Uses FastPix's thumbnail image; if FastPix has none for this
// video (the image API 404s for some assets), shows a real frame from the
// stream instead: a paused, muted <video> at the lowest rendition, ~2s in.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { loadHls, type HlsInstance } from "../shorts/hls";
import { masterUrl, startupHlsConfig } from "../shorts/startup";
import { thumbnailUrl } from "../shorts/utils";

const FRAME_AT_S = 2;

const fill: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

function StreamFrame({ playbackId }: { playbackId: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    let hls: HlsInstance | null = null;
    let cancelled = false;
    loadHls().then((Hls) => {
      if (cancelled) return;
      if (Hls?.isSupported()) {
        hls = new Hls({
          ...startupHlsConfig(playbackId),
          startLevel: 0,
          startPosition: FRAME_AT_S,
          testBandwidth: false,
          maxBufferLength: 1,
          maxMaxBufferLength: 1,
        });
        hls.autoLevelCapping = 0;
        hls.attachMedia(video);
        hls.loadSource(masterUrl(playbackId));
      } else {
        video.src = `${masterUrl(playbackId)}#t=${FRAME_AT_S}`;
      }
    });
    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [playbackId]);

  return <video ref={videoRef} muted playsInline preload="auto" aria-hidden="true" style={fill} />;
}

export function Thumbnail({ playbackId, eager = false }: { playbackId: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <StreamFrame playbackId={playbackId} />;
  return (
    <img
      src={thumbnailUrl(playbackId)}
      alt=""
      aria-hidden="true"
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
      style={fill}
    />
  );
}
