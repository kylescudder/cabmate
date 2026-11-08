// The signed-in person (a verified, allowlisted Better Auth user). API code
// resolves the matching `users` row through users.auth_user_id.
export type Identity = { id: string; name: string };
