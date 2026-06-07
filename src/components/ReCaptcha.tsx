"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    grecaptcha?: {
      ready?: (cb: () => void) => void;
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
    __onReCaptchaLoad?: () => void;
  }
}

const CALLBACK_NAME = "__onReCaptchaLoad";
const SCRIPT_SRC = `https://www.google.com/recaptcha/api.js?onload=${CALLBACK_NAME}&render=explicit`;

let scriptLoadPromise: Promise<void> | null = null;

function loadReCaptchaScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.grecaptcha?.render) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    // The onload callback fires once the API (including grecaptcha.render) is ready.
    window[CALLBACK_NAME] = () => resolve();

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src^="https://www.google.com/recaptcha/api.js"]'
    );
    if (existing) {
      // Script tag already present; if the API is ready, resolve now,
      // otherwise the onload callback above will resolve it.
      if (window.grecaptcha?.render) resolve();
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
    // Keep compatibility with the strict CSP nonce set by proxy.
    const nonce = document.body?.getAttribute("data-nonce");
    if (nonce) {
      script.setAttribute("nonce", nonce);
    }
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
      } catch (err) {
        console.error("[reCAPTCHA] script failed to load", err);
        onTokenChange("");
        return;
      }

      const container = containerRef.current;
      if (!isMounted || !container || !window.grecaptcha?.render) {
        return;
      }

      // Avoid rendering twice into the same container (e.g. React strict mode).
      if (widgetIdRef.current !== null || container.childElementCount > 0) {
        return;
      }

      try {
        widgetIdRef.current = window.grecaptcha.render(container, {
          sitekey: siteKey,
          callback: (token) => onTokenChange(token),
          "expired-callback": () => onTokenChange(""),
          "error-callback": () => onTokenChange(""),
        });
      } catch (err) {
        console.error("[reCAPTCHA] failed to render widget", err);
        onTokenChange("");
      }
    }

    void mountWidget();

    return () => {
      isMounted = false;
      if (window.grecaptcha && widgetIdRef.current !== null) {
        try {
          window.grecaptcha.reset(widgetIdRef.current);
        } catch {
          // ignore reset errors during unmount
        }
      }
    };
  }, [onTokenChange, siteKey]);

  return <div ref={containerRef} className="min-h-[78px]" />;
}
