"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    grecaptcha?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        }
      ) => number;
      reset: (widgetId?: number) => void;
    };
  }
}

const SCRIPT_SRC = "https://www.google.com/recaptcha/api.js?render=explicit";
let scriptLoadPromise: Promise<void> | null = null;

function loadReCaptchaScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.grecaptcha) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src^="https://www.google.com/recaptcha/api.js"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load reCAPTCHA script")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load reCAPTCHA script"));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

interface ReCaptchaProps {
  siteKey: string;
  onTokenChange: (token: string) => void;
}

export function ReCaptcha({ siteKey, onTokenChange }: ReCaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function mountWidget() {
      try {
        await loadReCaptchaScript();
        if (!isMounted || !containerRef.current || !window.grecaptcha) return;

        widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onTokenChange(token),
          "expired-callback": () => onTokenChange(""),
          "error-callback": () => onTokenChange(""),
        });
      } catch {
        onTokenChange("");
      }
    }

    void mountWidget();

    return () => {
      isMounted = false;
      if (window.grecaptcha && widgetIdRef.current !== null) {
        window.grecaptcha.reset(widgetIdRef.current);
      }
    };
  }, [onTokenChange, siteKey]);

  return <div ref={containerRef} className="min-h-[78px]" />;
}
