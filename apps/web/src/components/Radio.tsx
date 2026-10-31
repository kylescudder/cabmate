import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { RadioState, RadioStation } from '@ets2/shared';

export function Radio() {
  const query = useQuery({ queryKey: ['radio'], queryFn: () => api<RadioState>('/api/radio/state'),
    refetchInterval: 5000, retry: false });
  return <>
    <div className="radio-intro"><h1>A little company<br />for the long haul.</h1>
      <p>Your favourite station, right here in the cab. See what’s playing, then take RadioMax on your next drive.</p>
    </div>
    {query.isPending ? <p role="status" className="radio-notice">Finding RadioMax…</p> :
      query.isError ? <section className="radio-notice" role="status">
        <h2>RadioMax is taking a break.</h2><p>We’ll keep trying. Your driving pages are still here.</p>
        <button className="cab-button" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? 'Trying…' : 'Try again'}</button>
      </section> : query.data.stations.length === 0 ? <p role="status" className="radio-notice">No stations on air just yet. Check back shortly.</p> :
        query.data.stations.map(station => <Station key={station.id} station={station} />)}
    <footer className="radio-footer">RadioMax is public. Sign in to Cabmate to find your friends and follow your drives.</footer>
  </>;
}

function Station({ station }: { station: RadioStation }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const progress = station.trackSizeBytes ? Math.min(100, station.positionBytes / station.trackSizeBytes * 100) : 0;
  const entry = `stream_data[]: "${station.ets2Url}"`;
  async function copyEntry() {
    try { await navigator.clipboard.writeText(entry); setCopy('copied'); }
    catch { setCopy('failed'); }
  }
  return <section className="radio-console" aria-label={`${station.name} station`}>
    <div className="radio-face">
      <div className="radio-station-line"><h2>{station.name}</h2><span className="on-air"><span aria-hidden="true" />On air</span></div>
      <p className="radio-genre">{station.genre}</p>
      <div className="radio-playing"><p>Now playing</p><h3>{station.trackTitle || 'Music for the road'}</h3></div>
      <div role="progressbar" aria-label="Track progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="radio-progress"><span style={{ width: `${progress}%` }} /></div>
      <div className="radio-details"><span>{station.listeners === 1 ? '1 driver tuned in' : `${station.listeners} drivers tuned in`}</span><span>{station.trackCount ? `Track ${Math.min(station.trackIndex + 1, station.trackCount)} of ${station.trackCount}` : 'Getting the music ready'}</span></div>
    </div>
    <div className="radio-setup"><h3>Bring it into your cab</h3>
      <p>Close ETS2, then add this line to <code>live_streams.sii</code> in your Euro Truck Simulator 2 documents folder. Use the next free <code>stream_data</code> index.</p>
      <pre tabIndex={0} aria-label="ETS2 station entry">{entry}</pre>
      <button className="cab-button" onClick={() => void copyEntry()}>Copy ETS2 entry</button>
      <p role="status" className="copy-status">{copy === 'copied' ? 'Copied. Ready for your next drive.' : copy === 'failed' ? 'Couldn’t copy. Select the entry above and copy it manually.' : ''}</p>
      <details><summary>Need a hand?</summary><p>Keep the other stations in the file and update <code>stream_data</code>’s total count. Start ETS2, open Radio, and choose {station.name}.</p>
        <p>Already have RadioMax in your game? Your existing station address still works.</p></details>
    </div>
  </section>;
}
