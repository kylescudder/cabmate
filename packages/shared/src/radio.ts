export const RADIO_STREAM_ORIGIN = 'http://radio-max-audio.kylescudder.co.uk';
export interface RadioStation {
  id: string;
  name: string;
  genre: string;
  trackTitle: string;
  trackIndex: number;
  trackCount: number;
  positionBytes: number;
  trackSizeBytes: number;
  listeners: number;
  uptimeSec: number;
  streamUrl: string;
  ets2Url: string;
}
export interface RadioState { stations: RadioStation[] }
