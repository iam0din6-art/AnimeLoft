'use strict';

window.LoftMascot = {
  idx: 0,
  lines: ['mascotHi', 'tip1', 'tip2', 'tip3', 'tip4'],
  say: function(repaint) {
    if (!repaint) this.idx = (this.idx + 1) % this.lines.length;
    const el = document.getElementById('mascot-say');
    if (el) el.textContent = t(this.lines[this.idx]);
  },
  toggle: function() {
    const m = document.getElementById('mascot');
    if (m) m.classList.toggle('min');
  },
  init: function() {
    this.say(true);
    setInterval(() => { if (!document.hidden) this.say(); }, 25000);
  }
};
