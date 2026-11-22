import { Container, Sprite, Texture, VideoSource } from "pixi.js";
import { coverSprite } from "./art";

// Optional footage stays hidden until the browser has a frame. Missing or failed clips leave the live plate visible.
export class VideoPlate {
  private video = document.createElement("video");
  private sprite?: Sprite;
  private active = false;
  private failed = false;
  private uploadedFrame = -1;

  constructor(
    private job: string,
    url: string,
    private parent: Container,
    private width: number,
    private height: number,
    loop: boolean,
  ) {
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.loop = loop;
    this.video.preload = "auto";
    this.video.addEventListener("error", () => {
      this.failed = true;
      this.pause();
    });
    this.video.src = url;
  }

  play(progress?: number, duration?: number): boolean {
    const video = this.video;
    if (this.failed || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      if (this.sprite) this.sprite.visible = false;
      return false;
    }
    if (!this.sprite) {
      // Desk footage must use the plate's aspect ratio for the monitor projection to stay calibrated.
      if (video.loop && video.videoWidth * this.height !== video.videoHeight * this.width) {
        this.failed = true;
        return false;
      }
      const source = new VideoSource({
        resource: video, autoLoad: false, autoPlay: false, width: video.videoWidth, height: video.videoHeight,
      });
      source.autoUpdate = false;
      this.sprite = coverSprite(new Texture({ source }), this.width, this.height);
      this.sprite.label = this.job;
      this.parent.addChild(this.sprite);
    }
    if (!this.active) {
      this.active = true;
      if (progress !== undefined && duration && Number.isFinite(video.duration)) {
        const target = Math.min(video.duration, Math.max(0, progress) * video.duration);
        if (Math.abs(video.currentTime - target) > 1 / 24) video.currentTime = target;
        video.playbackRate = video.duration / duration;
      }
      void video.play().catch((error: DOMException) => {
        if (error.name !== "AbortError") {
          this.failed = true;
          this.pause();
        }
      });
    }
    this.sprite.visible = !video.seeking && (!video.paused || video.ended) &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    const frame = Math.floor(video.currentTime * 24);
    if (this.sprite.visible && frame !== this.uploadedFrame) {
      this.sprite.texture.source.update();
      this.uploadedFrame = frame;
    }
    return this.sprite.visible;
  }

  pause(rewind = false): void {
    if (this.active) this.video.pause();
    // Buffer the opening frame again before this transition is requested a second time.
    if (rewind && !this.failed && this.video.currentTime !== 0) this.video.currentTime = 0;
    this.active = false;
    this.uploadedFrame = -1;
    if (this.sprite) this.sprite.visible = false;
  }
}
