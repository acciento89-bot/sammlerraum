"use client";

import { useEffect, useRef, useState } from "react";

type BarcodeResult = { rawValue: string };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect(source: HTMLVideoElement): Promise<BarcodeResult[]>;
};

export function CodeScanner({
  label,
  value,
  onChange,
  copy,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  copy: {
    start: string;
    stop: string;
    unavailable: string;
    proposal: string;
    confirm: string;
    cameraError: string;
  };
  disabled?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | undefined>(undefined);
  const starting = useRef(false);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [scanning, setScanning] = useState(false);
  const [proposal, setProposal] = useState("");
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(false);
  const Detector = (
    globalThis as typeof globalThis & {
      BarcodeDetector?: BarcodeDetectorConstructor;
    }
  ).BarcodeDetector;

  function stop() {
    generation.current += 1;
    starting.current = false;
    if (timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = undefined;
    if (video.current) video.current.srcObject = null;
    setScanning(false);
  }

  useEffect(() => {
    setSupported(
      Boolean(Detector && typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia),
    );
    return stop;
  }, []);

  async function start() {
    if (!Detector || !video.current || starting.current || stream.current) return;
    starting.current = true;
    const activeGeneration = ++generation.current;
    setError("");
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (generation.current !== activeGeneration || !video.current) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = acquired;
      video.current.srcObject = acquired;
      await video.current.play();
      if (generation.current !== activeGeneration) return;
      starting.current = false;
      setScanning(true);
      const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
      const scan = async () => {
        if (!video.current || !stream.current || generation.current !== activeGeneration) return;
        try {
          const result = await detector.detect(video.current);
          if (result[0]?.rawValue) {
            setProposal(result[0].rawValue);
            stop();
            return;
          }
        } catch {
          setError(copy.cameraError);
          stop();
          return;
        }
        if (generation.current === activeGeneration) timer.current = setTimeout(scan, 400);
      };
      await scan();
    } catch {
      setError(copy.cameraError);
      if (generation.current === activeGeneration) stop();
    }
  }

  return (
    <div className="scanner">
      <label>
        {label}
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={512}
          disabled={disabled}
        />
      </label>
      {supported ? (
        <button
          className="secondary-button"
          type="button"
          disabled={disabled}
          onClick={scanning ? stop : start}
        >
          {scanning ? copy.stop : copy.start}
        </button>
      ) : (
        <p className="field-help">{copy.unavailable}</p>
      )}
      <video ref={video} className={scanning ? "scanner-video" : "scanner-video hidden"} muted />
      {proposal && (
        <div className="scanner-proposal" role="status">
          <p>
            {copy.proposal}: <strong>{proposal}</strong>
          </p>
          <button
            type="button"
            onClick={() => {
              onChange(proposal);
              setProposal("");
            }}
          >
            {copy.confirm}
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
