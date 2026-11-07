import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Hall, Seat } from '../lib/types';

interface SpeakerMix { id: string; distance: number; gain: number; pan: number }
interface AudioGraph {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  master: GainNode;
  channels: Array<{ id: string; gain: GainNode; pan: StereoPannerNode }>;
  meters: [AnalyserNode, AnalyserNode];
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The same metre-based hall geometry drives the camera, speaker attenuation and stereo image. */
export function cinemaSpeakerMix(hall: Hall, seat: Seat): SpeakerMix[] {
  const speakers = hall.speakers.length ? hall.speakers : [{ id: 'screen', position: hall.screen.center }];
  const facing = Math.atan2(hall.screen.center.x - seat.position.x, seat.position.z - hall.screen.center.z);
  return speakers.map((speaker) => {
    const dx = speaker.position.x - seat.position.x;
    const dy = speaker.position.y - seat.position.y - hall.camera.eye_height;
    const dz = speaker.position.z - seat.position.z;
    const distance = Math.hypot(dx, dy, dz);
    const angle = Math.atan2(dx, -dz) - facing;
    return {
      id: speaker.id,
      distance,
      // A 6 m near-field cap prevents spikes; attenuation continues across the entire auditorium.
      gain: (6 / Math.max(6, distance)) / speakers.length,
      pan: clamp(Math.sin(angle), -0.96, 0.96),
    };
  });
}

function moveListener(graph: AudioGraph, mix: SpeakerMix[]) {
  for (const channel of graph.channels) {
    const value = mix.find((item) => item.id === channel.id);
    if (!value) continue;
    channel.gain.gain.setTargetAtTime(value.gain, graph.context.currentTime, 0.16);
    channel.pan.pan.setTargetAtTime(value.pan, graph.context.currentTime, 0.16);
  }
}

export function useCinemaMedia(hall: Hall, seat: Seat | null, mediaURL: string) {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.85);
  const [muted, setMutedState] = useState(false);
  const [sample, setSample] = useState(false);
  const [levels, setLevels] = useState<[number, number]>([0, 0]);
  const graphRef = useRef<AudioGraph | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sampleEndRef = useRef<number | null>(null);
  const actionRef = useRef(0);
  const latest = useRef({ hall, seat, volume, muted });
  latest.current = { hall, seat, volume, muted };
  const speakerMix = useMemo(() => seat ? cinemaSpeakerMix(hall, seat) : [], [hall, seat]);

  useEffect(() => {
    if (!mediaURL) {
      setVideoElement(null); setPlaying(false); setStarting(false); setLoading(false); setReady(false);
      setError(null); setCurrentTime(0); setDuration(0); setSample(false); setLevels([0, 0]);
      return;
    }
    const video = document.createElement('video');
    videoRef.current = video;
    video.crossOrigin = 'anonymous';
    video.src = mediaURL;
    video.preload = 'auto';
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.className = 'cinema-media-source';
    video.tabIndex = -1;
    // Keep one inline source attached for mobile browsers. Both 3D canvases share this exact element.
    document.body.appendChild(video);
    setVideoElement(video);
    setPlaying(false); setStarting(false); setLoading(true); setReady(false); setError(null);
    setCurrentTime(0); setDuration(0); setSample(false); setLevels([0, 0]);
    const metadata = () => { setDuration(Number.isFinite(video.duration) ? video.duration : 0); };
    const canPlay = () => { setReady(true); setLoading(false); metadata(); };
    const time = () => {
      setCurrentTime(video.currentTime);
      if (sampleEndRef.current !== null && video.currentTime >= sampleEndRef.current) {
        video.pause(); sampleEndRef.current = null; setSample(false);
      }
    };
    const active = () => { setPlaying(true); setStarting(false); setLoading(false); };
    const paused = () => { setPlaying(false); setStarting(false); setLevels([0, 0]); };
    const waiting = () => { if (!video.paused) setLoading(true); };
    const ended = () => { paused(); sampleEndRef.current = null; setSample(false); };
    const failed = () => { setError('Трейлер не загрузился. Проверьте соединение и попробуйте снова.'); setLoading(false); setStarting(false); setPlaying(false); };
    const visibility = () => { if (document.hidden) video.pause(); };
    video.addEventListener('loadedmetadata', metadata);
    video.addEventListener('loadeddata', canPlay);
    video.addEventListener('canplay', canPlay);
    video.addEventListener('timeupdate', time);
    video.addEventListener('playing', active);
    video.addEventListener('pause', paused);
    video.addEventListener('waiting', waiting);
    video.addEventListener('ended', ended);
    video.addEventListener('error', failed);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      actionRef.current += 1;
      sampleEndRef.current = null;
      video.removeEventListener('loadedmetadata', metadata);
      video.removeEventListener('loadeddata', canPlay);
      video.removeEventListener('canplay', canPlay);
      video.removeEventListener('timeupdate', time);
      video.removeEventListener('playing', active);
      video.removeEventListener('pause', paused);
      video.removeEventListener('waiting', waiting);
      video.removeEventListener('ended', ended);
      video.removeEventListener('error', failed);
      document.removeEventListener('visibilitychange', visibility);
      video.pause(); video.removeAttribute('src'); video.load(); video.remove();
      if (videoRef.current === video) videoRef.current = null;
      const graph = graphRef.current;
      graphRef.current = null;
      if (graph) { graph.source.disconnect(); void graph.context.close().catch(() => undefined); }
    };
  }, [mediaURL]);

  const ensureAudio = useCallback((video: HTMLVideoElement) => {
    if (graphRef.current) return graphRef.current;
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) throw new Error('На этом устройстве пространственный звук недоступен.');
    const context = new AudioContextClass();
    try {
      const source = context.createMediaElementSource(video);
      const mono = context.createGain();
      mono.channelCount = 1; mono.channelCountMode = 'explicit'; mono.channelInterpretation = 'speakers';
      source.connect(mono);
      const master = context.createGain();
      master.gain.value = latest.current.muted ? 0 : latest.current.volume;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -6; limiter.knee.value = 3; limiter.ratio.value = 6;
      master.connect(limiter); limiter.connect(context.destination);
      const splitter = context.createChannelSplitter(2);
      limiter.connect(splitter);
      const meters = [context.createAnalyser(), context.createAnalyser()] as [AnalyserNode, AnalyserNode];
      meters.forEach((meter, index) => { meter.fftSize = 256; splitter.connect(meter, index); });
      const current = latest.current;
      const channels = (current.hall.speakers.length ? current.hall.speakers : [{ id: 'screen', position: current.hall.screen.center }]).map((speaker) => {
        const gain = context.createGain();
        const pan = context.createStereoPanner();
        gain.gain.value = 0;
        mono.connect(gain); gain.connect(pan); pan.connect(master);
        return { id: speaker.id, gain, pan };
      });
      const graph = { context, source, master, channels, meters };
      graphRef.current = graph;
      if (current.seat) moveListener(graph, cinemaSpeakerMix(current.hall, current.seat));
      return graph;
    } catch (cause) {
      void context.close().catch(() => undefined);
      throw cause;
    }
  }, []);

  const play = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !latest.current.seat) return;
    const action = ++actionRef.current;
    setError(null); setStarting(true);
    try {
      const graph = ensureAudio(video);
      // Both policy-sensitive calls happen synchronously within the user's click/tap.
      const resume = graph.context.resume();
      const startVideo = video.play();
      await Promise.all([resume, startVideo]);
      if (videoRef.current !== video || action !== actionRef.current) return;
      setPlaying(!video.paused); setStarting(false);
    } catch (cause) {
      if (videoRef.current !== video || action !== actionRef.current) return;
      video.pause(); setStarting(false);
      setError(cause instanceof DOMException && cause.name === 'NotAllowedError'
        ? 'Браузер ждёт вашего нажатия. Нажмите «Включить трейлер» ещё раз.'
        : 'Не удалось запустить трейлер со звуком. Попробуйте ещё раз.');
    }
  }, [ensureAudio]);

  const pause = useCallback(() => {
    actionRef.current += 1;
    videoRef.current?.pause();
    setStarting(false); setPlaying(false);
  }, []);
  const toggle = useCallback(() => {
    if (videoRef.current && !videoRef.current.paused) pause(); else void play();
  }, [pause, play]);
  const seek = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    sampleEndRef.current = null; setSample(false);
    video.currentTime = clamp(seconds, 0, video.duration); setCurrentTime(video.currentTime);
  }, []);
  const replay = useCallback(() => { seek(0); void play(); }, [play, seek]);
  const playSample = useCallback(() => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    // A repeatable passage with music/dialogue, shared by both listening positions.
    const start = Math.min(18, Math.max(0, video.duration - 12));
    video.currentTime = start; sampleEndRef.current = Math.min(start + 10, video.duration);
    setCurrentTime(start); setSample(true); setMutedState(false);
    latest.current.muted = false;
    graphRef.current?.master.gain.setTargetAtTime(latest.current.volume, graphRef.current.context.currentTime, 0.05);
    void play();
  }, [play]);
  const retry = useCallback(() => {
    setError(null); setLoading(true); setReady(false); videoRef.current?.load();
  }, []);
  const setVolume = useCallback((value: number) => { setVolumeState(clamp(value, 0, 1)); if (value > 0) setMutedState(false); }, []);
  const toggleMute = useCallback(() => setMutedState((value) => !value), []);

  useEffect(() => { if (graphRef.current) moveListener(graphRef.current, speakerMix); }, [speakerMix]);
  useEffect(() => {
    const graph = graphRef.current;
    if (graph) graph.master.gain.setTargetAtTime(muted ? 0 : volume, graph.context.currentTime, 0.05);
  }, [volume, muted]);
  useEffect(() => {
    if (!playing) return;
    const data = new Uint8Array(256);
    const timer = window.setInterval(() => {
      const graph = graphRef.current;
      if (!graph) return;
      const values = graph.meters.map((meter) => {
        meter.getByteTimeDomainData(data);
        const rms = Math.sqrt(data.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / data.length);
        return clamp(rms * 5, 0, 1);
      });
      setLevels(values as [number, number]);
    }, 100);
    return () => clearInterval(timer);
  }, [playing]);

  return { videoElement, playing, starting, loading, ready, error, currentTime, duration, volume, muted, sample, levels, speakerMix,
    play, pause, toggle, seek, replay, playSample, retry, setVolume, toggleMute };
}

export type CinemaMedia = ReturnType<typeof useCinemaMedia>;
