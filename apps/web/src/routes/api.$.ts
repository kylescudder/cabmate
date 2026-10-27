import { createFileRoute } from '@tanstack/react-router';
import { createApi } from '../../server/api';
import { database } from '../../server/db';
import { identity } from '../../server/auth';
const handler = ({ request }: { request: Request }) => createApi(database, identity)(request);
export const Route = createFileRoute('/api/$')({ server: { handlers: { GET: handler, POST: handler, PATCH: handler } } });
