import { NativeModules } from 'react-native';
import TrackPlayer, { State, Capability } from 'react-native-track-player';

const { MonotonicClock } = NativeModules;

export interface SyncPayload {
  event: 'PLAY' | 'SEEK' | 'SYNC_CHECK';
  host_start_timestamp: number;
  track_uri: string;
  initial_position_ms: number;
}

export type NetworkTransportSend = (payload: SyncPayload) => void;

export class MasterGuestSyncEngine {
  private isHost: boolean = false;
  private currentTrackUri: string | null = null;
  private transportSend: NetworkTransportSend | null = null;
  private driftCheckInterval: NodeJS.Timeout | null = null;
  private lastKnownHostTimestamp: number = 0;
  private targetPlaybackPositionMs: number = 0;

  private readonly DRIFT_THRESHOLD_MS = 15;
  private readonly MAX_RATE_ADJUSTMENT = 0.05;

  constructor() {
    this.initAudioPlayer();
  }

  private async initAudioPlayer(): Promise<void> {
    try {
      await TrackPlayer.setupPlayer({ waitForBuffer: true });
      await TrackPlayer.updateOptions({
        capabilities: [Capability.Play, Capability.Pause, Capability.SeekTo],
      });
    } catch (e) {
      // Audio context initialized
    }
  }

  public setHostMode(isHost: boolean): void {
    this.isHost = isHost;
    if (!isHost) {
      this.startDriftMonitor();
    } else {
      this.stopDriftMonitor();
    }
  }

  public registerTransport(sendFn: NetworkTransportSend): void {
    this.transportSend = sendFn;
  }

  private async getMonotonicTime(): Promise<number> {
    if (MonotonicClock && MonotonicClock.getMonotonicTimeMs) {
      return await MonotonicClock.getMonotonicTimeMs();
    }
    return performance.now();
  }

  public async hostTriggerPlay(trackUri: string, startFromMs: number = 0): Promise<void> {
    if (!this.isHost) return;

    this.currentTrackUri = trackUri;
    await TrackPlayer.reset();
    await TrackPlayer.add({
      id: 'stream_track',
      url: trackUri,
      title: 'Synced Stream',
      artist: 'AudioCast Engine',
    });

    if (startFromMs > 0) {
      await TrackPlayer.seekTo(startFromMs / 1000);
    }

    const hostStartTimestamp = await this.getMonotonicTime();
    await TrackPlayer.play();

    const payload: SyncPayload = {
      event: 'PLAY',
      host_start_timestamp: hostStartTimestamp,
      track_uri: trackUri,
      initial_position_ms: startFromMs,
    };

    if (this.transportSend) {
      this.transportSend(payload);
    }
  }

  public async hostTriggerSeek(positionMs: number): Promise<void> {
    if (!this.isHost || !this.currentTrackUri) return;

    await TrackPlayer.seekTo(positionMs / 1000);
    const hostStartTimestamp = await this.getMonotonicTime();

    const payload: SyncPayload = {
      event: 'SEEK',
      host_start_timestamp: hostStartTimestamp,
      track_uri: this.currentTrackUri,
      initial_position_ms: positionMs,
    };

    if (this.transportSend) {
      this.transportSend(payload);
    }
  }

  public async guestProcessIncomingPayload(payload: SyncPayload): Promise<void> {
    if (this.isHost) return;

    const guestReceivedTimestamp = await this.getMonotonicTime();
    const networkTransitDelayMs = guestReceivedTimestamp - payload.host_start_timestamp;
    const targetSeekPositionMs = payload.initial_position_ms + Math.max(0, networkTransitDelayMs);
    const targetSeekSeconds = targetSeekPositionMs / 1000;

    this.lastKnownHostTimestamp = payload.host_start_timestamp;
    this.targetPlaybackPositionMs = targetSeekPositionMs;

    if (payload.event === 'PLAY') {
      await TrackPlayer.setVolume(0);
      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: 'stream_track',
        url: payload.track_uri,
        title: 'Synced Stream',
        artist: 'AudioCast Engine',
      });

      await TrackPlayer.seekTo(targetSeekSeconds);
      await TrackPlayer.play();
      await TrackPlayer.setVolume(1.0);
      this.currentTrackUri = payload.track_uri;
    } else if (payload.event === 'SEEK') {
      await TrackPlayer.seekTo(targetSeekSeconds);
    }
  }

  private startDriftMonitor(): void {
    this.stopDriftMonitor();
    this.driftCheckInterval = setInterval(() => {
      this.evaluateAndCorrectDrift();
    }, 1000);
  }

  private stopDriftMonitor(): void {
    if (this.driftCheckInterval) {
      clearInterval(this.driftCheckInterval);
      this.driftCheckInterval = null;
    }
  }

  private async evaluateAndCorrectDrift(): Promise<void> {
    if (this.isHost || !this.currentTrackUri) return;

    const playerState = await TrackPlayer.getPlaybackState();
    if (playerState.state !== State.Playing) return;

    const currentGuestTime = await this.getMonotonicTime();
    const guestActualPositionSec = await TrackPlayer.getPosition();
    const guestActualPositionMs = guestActualPositionSec * 1000;

    const elapsedTimeSinceHostStart = currentGuestTime - this.lastKnownHostTimestamp;
    const projectedHostPositionMs = this.targetPlaybackPositionMs + elapsedTimeSinceHostStart;
    const driftMs = projectedHostPositionMs - guestActualPositionMs;

    if (Math.abs(driftMs) > 100) {
      await TrackPlayer.seekTo(projectedHostPositionMs / 1000);
      await TrackPlayer.setRate(1.0);
    } else if (Math.abs(driftMs) > this.DRIFT_THRESHOLD_MS) {
      const correctionRatio = driftMs > 0 
        ? 1.0 + this.MAX_RATE_ADJUSTMENT 
        : 1.0 - this.MAX_RATE_ADJUSTMENT;
      await TrackPlayer.setRate(correctionRatio);
    } else {
      await TrackPlayer.setRate(1.0);
    }
  }

  public destroy(): void {
    this.stopDriftMonitor();
    TrackPlayer.reset();
  }
}
