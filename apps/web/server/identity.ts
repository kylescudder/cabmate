// The signed-in person, from whichever provider AUTH_PROVIDER selects. API code
// resolves the matching `users` row through clerk_user_id or auth_user_id.
export type Identity = { provider: 'clerk'; id: string } | { provider: 'better-auth'; id: string; name: string };
