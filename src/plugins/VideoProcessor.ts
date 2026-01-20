import { registerPlugin } from '@capacitor/core';
import type { VideoProcessorPlugin } from './definitions';

const VideoProcessor = registerPlugin<VideoProcessorPlugin>('VideoProcessor', {
  web: () => import('./VideoProcessor.web').then(m => new m.VideoProcessorWeb()),
});

export * from './definitions';
export { VideoProcessor };
