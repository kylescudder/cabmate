// Explicit origins only: the legacy host is retained briefly for open pages/sockets.
export function appOrigins(fallback: string): string[] {
  return [process.env.APP_ORIGIN || fallback, process.env.LEGACY_APP_ORIGIN]
    .filter((value): value is string => Boolean(value));
}

export function validAppOrigin(request: Request, fallback = new URL(request.url).origin): boolean {
  return appOrigins(fallback).includes(request.headers.get('origin') || '');
}
