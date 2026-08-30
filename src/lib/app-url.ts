const PRODUCTION_APP_URL = "https://ai-os.rauell.systems";

export function appUrl(): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  const fallback = process.env.NODE_ENV === "production" ? PRODUCTION_APP_URL : "http://localhost:3000";
  if (configured && process.env.NODE_ENV === "production") {
    try {
      const hostname = new URL(configured).hostname;
      if (hostname === "localhost" || hostname === "127.0.0.1") return fallback;
    } catch {
      return fallback;
    }
  }
  return (configured || fallback).replace(/\/+$/, "");
}

export function appCallbackUrl(pathname: string): string {
  return new URL(pathname, `${appUrl()}/`).toString();
}

export function configuredCallbackUrl(configured: string | undefined, pathname: string): string {
  if (!configured) return appCallbackUrl(pathname);
  try {
    const url = new URL(configured);
    if (process.env.NODE_ENV === "production" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
      return appCallbackUrl(pathname);
    }
    return url.toString();
  } catch {
    return appCallbackUrl(pathname);
  }
}
