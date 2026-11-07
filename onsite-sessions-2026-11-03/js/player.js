// Custom video player on top of the YouTube IFrame API.
// YouTube's own controls are hidden; everything you see is ours.
let _ytReady;
function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (_ytReady) return _ytReady;
  _ytReady = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev && prev(); resolve(); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () => reject(new Error("Couldn't load YouTube. Check the internet connection."));
    document.head.append(s);
  });
  return _ytReady;
}

const fmtTime = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
};

const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.2" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.2" fill="currentColor"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><text x="12" y="16.5" font-size="7" font-weight="700" text-anchor="middle" fill="currentColor">10</text></svg>',
  fwd: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2l5 4-5 4V7a6 6 0 1 0 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><text x="12" y="16.5" font-size="7" font-weight="700" text-anchor="middle" fill="currentColor">10</text></svg>',
  vol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="m16 9.5 5 5m0-5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  fs: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  fsExit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

class OnsitePlayer {
  constructor(root, { videoId, startAt = 0, watched = 0, onProgress, onEnded }) {
    this.root = root; this.videoId = videoId; this.startAt = startAt;
    this.onProgress = onProgress || (() => {}); this.onEnded = onEnded || (() => {});
    this.duration = 0; this.max = Math.max(watched, startAt); this.playing = false; this.started = false;
    this.lastSaved = 0; this.dragging = false;
    this._build();
    this._bind();
    loadYouTubeApi().then(() => { if (!this.destroyed) this._create(); }).catch((e) => { if (!this.destroyed) this.showMessage(e.message); });
  }

  _build() {
    const r = this.root;
    r.classList.add("op");
    r.setAttribute("dir", "ltr");
    r.tabIndex = 0;
    r.innerHTML = `
      <div class="op-video"><div class="op-yt"></div></div>
      <div class="op-poster" style="background-image:url(https://i.ytimg.com/vi/${this.videoId}/hqdefault.jpg)"></div>
      <div class="op-shield"></div>
      <button class="op-big" aria-label="${t("play")}">${ICONS.play}</button>
      <div class="op-resume" hidden></div>
      <div class="op-overlay" hidden></div>
      <div class="op-taphint" hidden>${t("tapToStart")}</div>
      <div class="op-spinner" hidden></div>
      <div class="op-bar">
        <div class="op-seek" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0">
          <div class="op-track"><div class="op-buf"></div><div class="op-max"></div><div class="op-played"></div></div>
          <div class="op-thumb"></div><div class="op-tip">0:00</div>
        </div>
        <div class="op-row">
          <button class="op-btn op-play" aria-label="${t("play")}">${ICONS.play}</button>
          <button class="op-btn op-back" aria-label="${t("back10")}">${ICONS.back}</button>
          <button class="op-btn op-fwd" aria-label="${t("fwd10")}">${ICONS.fwd}</button>
          <div class="op-vol">
            <button class="op-btn op-mute" aria-label="${t("mute")}">${ICONS.vol}</button>
            <input class="op-volume" type="range" min="0" max="100" value="100" aria-label="Volume">
          </div>
          <span class="op-time"><span class="op-cur">0:00</span> / <span class="op-dur">0:00</span></span>
          <span class="op-spacer"></span>
          <div class="op-speedwrap">
            <button class="op-btn op-speed" aria-haspopup="true" aria-label="${t("speed")}">1×</button>
            <div class="op-menu" hidden role="menu"></div>
          </div>
          <button class="op-btn op-fs" aria-label="${t("fullscreen")}">${ICONS.fs}</button>
        </div>
      </div>`;
    const q = (s) => r.querySelector(s);
    Object.assign(this, {
      $yt: q(".op-yt"), $poster: q(".op-poster"), $shield: q(".op-shield"), $big: q(".op-big"),
      $resume: q(".op-resume"), $overlay: q(".op-overlay"), $taphint: q(".op-taphint"), $spin: q(".op-spinner"),
      $seek: q(".op-seek"), $buf: q(".op-buf"), $maxbar: q(".op-max"), $played: q(".op-played"),
      $thumb: q(".op-thumb"), $tip: q(".op-tip"), $play: q(".op-play"), $back: q(".op-back"),
      $fwd: q(".op-fwd"), $mute: q(".op-mute"), $vol: q(".op-volume"), $cur: q(".op-cur"),
      $dur: q(".op-dur"), $speed: q(".op-speed"), $menu: q(".op-menu"), $fs: q(".op-fs"),
    });
    let vol = 100; try { vol = +(localStorage.getItem("onsite.vol") ?? 100); } catch {}
    this.$vol.value = vol;
    this._paintVolume();

    if (this.startAt > 10) {
      this.$resume.hidden = false;
      this.$resume.innerHTML = `<span>${t("resumeFrom", { t: fmtTime(this.startAt) })}</span>
        <button class="op-chip op-chip-main" data-a="resume">${t("resumeYes")}</button>
        <button class="op-chip" data-a="restart">${t("resumeNo")}</button>`;
    }
  }

  _bind() {
    const r = this.root;
    this.$big.onclick = () => this.play();
    this.$resume.onclick = (e) => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === "restart") this.startAt = 0;
      this.play();
    };
    this.$play.onclick = () => this.toggle();
    this.$back.onclick = () => this.skip(-10);
    this.$fwd.onclick = () => this.skip(10);
    this.$mute.onclick = () => this.toggleMute();
    this.$vol.oninput = () => this.setVolume(+this.$vol.value);
    this.$fs.onclick = () => this.toggleFullscreen();
    this.$speed.onclick = (e) => { e.stopPropagation(); this._openSpeedMenu(); };
    document.addEventListener("click", this._closeMenu = () => { this.$menu.hidden = true; });

    let lastTap = 0;
    this.$shield.addEventListener("pointerup", (e) => {
      if (!this.started) return this.play();
      if (e.pointerType === "touch" && r.classList.contains("op-idle")) return this._wake();
      const now = Date.now();
      if (now - lastTap < 280) { this.toggleFullscreen(); lastTap = 0; return; }
      lastTap = now;
      setTimeout(() => { if (lastTap === now) this.toggle(); }, 280);
    });

    // seek bar
    const posFromEvent = (e) => {
      const rect = this.$seek.getBoundingClientRect();
      return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    };
    this.$seek.addEventListener("pointermove", (e) => {
      const f = posFromEvent(e);
      this.$tip.textContent = fmtTime(f * this.duration);
      this.$tip.style.left = f * 100 + "%";
      if (this.dragging) this._paintProgress(f * this.duration);
    });
    this.$seek.addEventListener("pointerdown", (e) => {
      if (!this.duration) return;
      this.dragging = true; this.$seek.setPointerCapture(e.pointerId);
      this._paintProgress(posFromEvent(e) * this.duration);
    });
    this.$seek.addEventListener("pointerup", (e) => {
      if (!this.dragging) return;
      this.dragging = false; this.seek(posFromEvent(e) * this.duration);
    });
    this.$seek.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); this.skip(5); }
      if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); this.skip(-5); }
    });

    // keyboard shortcuts while the player page is open
    this._onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (["input", "textarea", "select"].includes(tag) || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
      if (tag === "button" && (e.key === " " || e.key === "Enter")) return;
      const k = e.key;
      const map = {
        " ": () => this.toggle(), k: () => this.toggle(), K: () => this.toggle(),
        ArrowLeft: () => this.skip(-5), ArrowRight: () => this.skip(5),
        j: () => this.skip(-10), J: () => this.skip(-10), l: () => this.skip(10), L: () => this.skip(10),
        ArrowUp: () => this.setVolume(+this.$vol.value + 5), ArrowDown: () => this.setVolume(+this.$vol.value - 5),
        m: () => this.toggleMute(), M: () => this.toggleMute(), f: () => this.toggleFullscreen(), F: () => this.toggleFullscreen(),
        ">": () => this.stepSpeed(1), "<": () => this.stepSpeed(-1),
      };
      if (map[k]) { e.preventDefault(); map[k](); this._wake(); }
    };
    document.addEventListener("keydown", this._onKey);

    // After a mouse/touch click on a control, give focus back to the player so Space and
    // the arrow keys control the video instead of re-pressing that button.
    r.addEventListener("click", (e) => {
      if (e.detail > 0 && e.target.closest(".op-btn, .op-menu button, .op-chip, .op-big")) setTimeout(() => r.focus({ preventScroll: true }), 0);
    }, true); // capture: the speed menu stops its clicks from bubbling

    // auto-hide controls
    r.addEventListener("pointermove", () => this._wake());
    r.addEventListener("focusin", () => this._wake());
    this._onFs = () => {
      const on = document.fullscreenElement === r || document.webkitFullscreenElement === r;
      this.$fs.innerHTML = on ? ICONS.fsExit : ICONS.fs;
      this.$fs.setAttribute("aria-label", on ? t("exitFullscreen") : t("fullscreen"));
    };
    document.addEventListener("fullscreenchange", this._onFs);
    document.addEventListener("webkitfullscreenchange", this._onFs);

    this._onHide = () => { if (document.visibilityState === "hidden") this._save(true); };
    document.addEventListener("visibilitychange", this._onHide);
    window.addEventListener("pagehide", this._onHide);
  }

  _create() {
    const vars = { controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3, fs: 0, cc_load_policy: 0 };
    if (location.protocol.startsWith("http")) vars.origin = location.origin;
    this.yt = new YT.Player(this.$yt, {
      videoId: this.videoId, playerVars: vars, host: "https://www.youtube-nocookie.com",
      events: {
        onReady: () => {
          this.ready = true;
          this.setVolume(+this.$vol.value, true);
          this.duration = this.yt.getDuration() || 0;
          this._paintTime();
          if (this._wantPlay) this.play();
        },
        onStateChange: (e) => this._state(e.data),
        onError: () => this.showMessage("This video can't be played. Ask your teacher to check the YouTube link (it must be Public or Unlisted, not Private)."),
      },
    });
    this._tick = setInterval(() => this._update(), 250);
  }

  _state(s) {
    const S = YT.PlayerState;
    this.$spin.hidden = s !== S.BUFFERING;
    if (s === S.BUFFERING) this._buffering = true;
    if (s === S.PLAYING) {
      clearTimeout(this._startCheck);
      this.root.classList.remove("op-native"); this.$taphint.hidden = true;
      if (this._pendingStart) { const at = this._pendingStart; this._pendingStart = 0; if ((this.yt.getCurrentTime() || 0) < at - 2) this.yt.seekTo(at, true); }
      this.playing = true; this.started = true;
      this.root.classList.add("op-started"); this.root.classList.remove("op-paused");
      this.$poster.hidden = true; this.$big.hidden = true; this.$resume.hidden = true;
      this.duration = this.yt.getDuration() || this.duration;
      this._setPlayIcon(); this._wake();
    } else if (s === S.PAUSED || s === S.ENDED) {
      this.playing = false; this._setPlayIcon();
      if (this.started) { this.root.classList.add("op-paused"); this.$big.hidden = s === S.ENDED; }
      this.root.classList.remove("op-idle");
      this._save(true);
      if (s === S.ENDED) {
        // only fill in the last bit if they really watched up to near the end (not if they jumped there)
        if (this.duration && this.duration - this.max <= 15) this.max = this.duration;
        this._save(true); this.onEnded();
      }
    }
  }

  _update() {
    if (!this.ready || !this.yt.getCurrentTime) return;
    const cur = this.yt.getCurrentTime() || 0;
    if (!this.duration) this.duration = this.yt.getDuration() || 0;
    // Only count forward progress made by watching (not by jumping far ahead).
    if (this.playing && cur > this.max && cur - this.max < 3) this.max = cur;
    if (!this.dragging) this._paintProgress(cur);
    this.$buf.style.width = (this.yt.getVideoLoadedFraction() || 0) * 100 + "%";
    if (this.playing && Date.now() - this.lastSaved > 10000) this._save();
  }

  _paintProgress(cur) {
    const f = this.duration ? cur / this.duration : 0;
    this.$played.style.width = f * 100 + "%";
    this.$thumb.style.left = f * 100 + "%";
    this.$maxbar.style.width = (this.duration ? this.max / this.duration : 0) * 100 + "%";
    this.$cur.textContent = fmtTime(cur);
    this.$seek.setAttribute("aria-valuemax", Math.floor(this.duration));
    this.$seek.setAttribute("aria-valuenow", Math.floor(cur));
    this.$seek.setAttribute("aria-valuetext", fmtTime(cur));
    this._paintTime();
  }
  _paintTime() { this.$dur.textContent = fmtTime(this.duration); }

  _save(force) {
    if (!this.ready || !this.started) return;
    this.lastSaved = Date.now();
    this.onProgress({ position: this.yt.getCurrentTime() || 0, duration: this.duration, max: this.max, force });
  }

  _setPlayIcon() {
    this.$play.innerHTML = this.playing ? ICONS.pause : ICONS.play;
    this.$play.setAttribute("aria-label", this.playing ? t("pause") : t("play"));
  }

  _wake() {
    this.root.classList.remove("op-idle");
    clearTimeout(this._idle);
    this._idle = setTimeout(() => { if (this.playing && !this.dragging && this.$menu.hidden) this.root.classList.add("op-idle"); }, 2600);
  }

  play() {
    if (!this.ready) { this._wantPlay = true; this.$spin.hidden = false; return; }
    if (!this.started && this.startAt > 0) { this.yt.seekTo(this.startAt, true); this._pendingStart = this.startAt; }
    this.$resume.hidden = true;
    this.yt.playVideo();
    if (!this.started) {
      // iPhones (and some browsers) only let a video start from a tap inside YouTube's own frame.
      // If nothing happened, hand the next tap to YouTube, then switch back to our controls.
      clearTimeout(this._startCheck);
      this._startCheck = setTimeout(() => { if (!this.started && !this._buffering) this._nativeStart(); }, 1500);
    }
  }
  _nativeStart() {
    this.root.classList.add("op-native");
    this.$big.hidden = true; this.$spin.hidden = true; this.$poster.hidden = true;
    this.$taphint.hidden = false;
  }
  pause() { this.ready && this.yt.pauseVideo(); }
  toggle() { this.playing ? this.pause() : this.play(); }
  seek(sec) {
    if (!this.ready) return;
    sec = Math.min(Math.max(0, sec), Math.max(0, this.duration - 0.5));
    this.yt.seekTo(sec, true); this._paintProgress(sec);
    if (!this.started) this.play();
  }
  skip(d) { this.ready && this.seek((this.yt.getCurrentTime() || 0) + d); }

  setVolume(v, silent) {
    v = Math.max(0, Math.min(100, Math.round(v)));
    this.$vol.value = v;
    try { localStorage.setItem("onsite.vol", v); } catch {}
    if (this.ready) { this.yt.setVolume(v); v === 0 ? this.yt.mute() : this.yt.unMute(); }
    this._paintVolume();
  }
  toggleMute() {
    if (+this.$vol.value === 0) this.setVolume(this._lastVol || 60);
    else { this._lastVol = +this.$vol.value; this.setVolume(0); }
  }
  _paintVolume() {
    const v = +this.$vol.value;
    this.$mute.innerHTML = v === 0 ? ICONS.muted : ICONS.vol;
    this.$mute.setAttribute("aria-label", v === 0 ? t("unmute") : t("mute"));
    this.$vol.style.setProperty("--v", v + "%");
  }

  _rates() { return (this.ready && this.yt.getAvailablePlaybackRates && this.yt.getAvailablePlaybackRates()) || [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]; }
  _openSpeedMenu() {
    const cur = this.ready ? this.yt.getPlaybackRate() : 1;
    this.$menu.innerHTML = `<div class="op-menu-h">${t("speed")}</div>` + this._rates().map((r) =>
      `<button role="menuitemradio" aria-checked="${r === cur}" data-r="${r}">${r === 1 ? t("normal") : r + "×"}</button>`).join("");
    this.$menu.hidden = !this.$menu.hidden;
    this.$menu.onclick = (e) => { e.stopPropagation(); const r = e.target.dataset.r; if (r) { this.setRate(+r); this.$menu.hidden = true; } };
  }
  setRate(r) { if (!this.ready) return; this.yt.setPlaybackRate(r); this.$speed.textContent = r + "×"; }
  stepSpeed(dir) {
    const rates = this._rates(), cur = this.ready ? this.yt.getPlaybackRate() : 1;
    const i = Math.max(0, Math.min(rates.length - 1, rates.indexOf(cur) + dir));
    this.setRate(rates[i]);
  }

  toggleFullscreen() {
    const r = this.root;
    const isFs = document.fullscreenElement || document.webkitFullscreenElement;
    if (isFs) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else if (r.requestFullscreen) r.requestFullscreen().catch(() => r.classList.toggle("op-pseudo-fs"));
    else if (r.webkitRequestFullscreen) r.webkitRequestFullscreen();
    else r.classList.toggle("op-pseudo-fs");
  }

  showOverlay(html) { this.$overlay.innerHTML = html; this.$overlay.hidden = !html; }
  showMessage(msg) { this.showOverlay(`<p class="op-msg">${msg}</p>`); this.$big.hidden = true; this.$resume.hidden = true; this.$spin.hidden = true; }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this._save(true);
    clearInterval(this._tick); clearTimeout(this._idle); clearTimeout(this._startCheck);
    document.removeEventListener("keydown", this._onKey);
    document.removeEventListener("click", this._closeMenu);
    document.removeEventListener("fullscreenchange", this._onFs);
    document.removeEventListener("webkitfullscreenchange", this._onFs);
    document.removeEventListener("visibilitychange", this._onHide);
    window.removeEventListener("pagehide", this._onHide);
    try { this.yt && this.yt.destroy(); } catch {}
  }
}
