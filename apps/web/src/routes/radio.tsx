import { createFileRoute } from '@tanstack/react-router';
import { Radio } from '../components/Radio';
import { Nav } from '../components/Nav';

export const Route = createFileRoute('/radio')({
  head: () => ({ meta: [{ title: 'RadioMax | Cabmate' }] }),
  component: () => <><Nav publicView /><main id="main" className="radio-page"><Radio /></main></>,
});
