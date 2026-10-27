import { createFileRoute } from '@tanstack/react-router';
import { createApi } from '../../server/api';
import { database } from '../../server/db';
const handler = ({ request }: { request: Request }) => createApi(database, async () => null)(request);
export const Route = createFileRoute('/functions/v1/ingest')({ server: { handlers: { POST: handler } } });
