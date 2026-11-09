// Explicit origin only: browser requests must come from the app's own origin.
export function appOrigin(fallback: string): string {
  return process.env.APP_ORIGIN || fallback
}

export function validAppOrigin(
  request: Request,
  fallback = new URL(request.url).origin
): boolean {
  return request.headers.get('origin') === appOrigin(fallback)
}
