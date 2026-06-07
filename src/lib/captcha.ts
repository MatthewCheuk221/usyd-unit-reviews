const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

interface ReCaptchaVerifyResponse {
  success: boolean;
}

export async function verifyReCaptchaToken(
  token: string,
  remoteIp?: string
): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    // CAPTCHA is disabled unless a secret is configured.
    return true;
  }

  if (!token.trim()) {
    return false;
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp && remoteIp !== "unknown") {
    body.set("remoteip", remoteIp);
  }

  try {
    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as ReCaptchaVerifyResponse;
    return data.success === true;
  } catch {
    return false;
  }
}
