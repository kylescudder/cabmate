import { clerkMiddleware } from '@clerk/tanstack-react-start/server';
import { createCsrfMiddleware, createStart } from '@tanstack/react-start';

// Clerk's middleware runs only while Clerk is the selected (default) provider.
const clerk = process.env.AUTH_PROVIDER !== 'better-auth' && Boolean(process.env.CLERK_SECRET_KEY);
export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({ filter: ctx => ctx.handlerType === 'serverFn' }),
    ...(clerk ? [clerkMiddleware()] : []),
  ],
}));
