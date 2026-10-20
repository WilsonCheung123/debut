// A stand-in for https://www.youtube.com/iframe_api for the deterministic QA run
// (tests/scenarios/vinyl.json): a YT.Player that behaves like the real one on
// the surface music.ts uses (replaces its element with an iframe, fires
// onReady, cues a playlist, reports onStateChange with the real state numbers
// and the real sequences: play = BUFFERING then PLAYING, next = UNSTARTED then
// BUFFERING/PLAYING or CUED) without the network. The live player is checked
// by tests/scenarios/vinyl-live.json.
(function () {
  var PS = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
  function Player(el, opts) {
    var iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'stub YouTube player');
    iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#1a1a1a';
    iframe.srcdoc = '<body style="margin:0;background:#1a1a1a;color:#8a8275;font:13px -apple-system,sans-serif;display:flex;align-items:center;justify-content:center">stub player</body>';
    el.replaceWith(iframe);
    this._iframe = iframe;
    this._state = PS.UNSTARTED;
    this._ids = [];
    this._index = 0;
    this._events = (opts && opts.events) || {};
    var vars = (opts && opts.playerVars) || {};
    if (vars.list) this._ids = ['stub-a', 'stub-b', 'stub-c'];
    var self = this;
    setTimeout(function () { if (self._events.onReady) self._events.onReady({ target: self, data: null }); }, 50);
  }
  Player.prototype._set = function (s) {
    this._state = s;
    if (this._events.onStateChange) this._events.onStateChange({ target: this, data: s });
  };
  Player.prototype.cuePlaylist = function (ids) {
    this._ids = Array.isArray(ids) ? ids.slice() : (ids && ids.list ? ['stub-a', 'stub-b', 'stub-c'] : []);
    this._index = (ids && ids.index) || 0;
    var self = this;
    setTimeout(function () { self._set(PS.CUED); }, 30);
  };
  Player.prototype.playVideo = function () {
    var self = this;
    setTimeout(function () { self._set(PS.BUFFERING); }, 30);
    setTimeout(function () { self._set(PS.PLAYING); }, 300);
  };
  Player.prototype.pauseVideo = function () {
    var self = this;
    if (this._state === PS.PLAYING || this._state === PS.BUFFERING) setTimeout(function () { self._set(PS.PAUSED); }, 30);
  };
  Player.prototype._skip = function (d) {
    var n = this._ids.length;
    if (!n) return;
    this._index = (this._index + d + n) % n;
    var wasPlaying = this._state === PS.PLAYING || this._state === PS.BUFFERING;
    var self = this;
    setTimeout(function () { self._set(PS.UNSTARTED); }, 20);
    if (wasPlaying) {
      setTimeout(function () { self._set(PS.BUFFERING); }, 60);
      setTimeout(function () { self._set(PS.PLAYING); }, 400);
    } else setTimeout(function () { self._set(PS.CUED); }, 60);
  };
  Player.prototype.nextVideo = function () { this._skip(1); };
  Player.prototype.previousVideo = function () { this._skip(-1); };
  Player.prototype.getPlayerState = function () { return this._state; };
  Player.prototype.getPlaylist = function () { return this._ids.slice(); };
  Player.prototype.getPlaylistIndex = function () { return this._index; };
  Player.prototype.getVideoData = function () { var id = this._ids[this._index]; return { video_id: id, title: 'stub ' + id, author: 'stub' }; };
  Player.prototype.getIframe = function () { return this._iframe; };
  Player.prototype.destroy = function () { this._iframe.remove(); };
  window.YT = { Player: Player, PlayerState: PS };
  setTimeout(function () { if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady(); }, 0);
})();
