import { createServerFn } from '@tanstack/react-start';

// Runtime provider selection keeps the client and server on the same provider
// (the image is built once). Only the provider name is returned, never settings.
export const getAuthConfig = createServerFn({ method: 'GET' }).handler(async () => {
  const { readAuthEnv } = await import('../../server/env');
  return { provider: readAuthEnv().AUTH_PROVIDER };
});
