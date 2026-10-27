import { auth } from '@clerk/tanstack-react-start/server';

export async function identity(): Promise<string | null> {
  if (!process.env.CLERK_SECRET_KEY) return null;
  const session = await auth();
  return session.userId;
}
