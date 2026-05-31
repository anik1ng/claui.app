/* ============================================================
   claui.app — progressive enhancement only.
   The page is fully functional with this file absent: every
   [data-scrub] section defaults to --p:1 (final state) in CSS,
   and the download links are static.
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Scroll-scrubbed sections -------------------------------------
     Each [data-scrub] section is taller than the viewport and contains
     a position:sticky stage. Progress = how far the section has been
     scrolled through its own pinned range, mapped to 0→1, written to
     --p. CSS turns --p into transforms. */
  var scrubbed = Array.prototype.slice.call(document.querySelectorAll('[data-scrub]'));

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  var ticking = false;
  function update() {
    ticking = false;
    var vh = window.innerHeight;
    for (var i = 0; i < scrubbed.length; i++) {
      var el = scrubbed[i];
      var rect = el.getBoundingClientRect();
      var range = rect.height - vh; // distance the sticky child stays pinned
      var p = range > 0 ? clamp01(-rect.top / range) : 1;
      el.style.setProperty('--p', p.toFixed(4));
      if (el.hasAttribute('data-projects')) updateProjects(el, p);
    }
  }

  /* Snap the active project to one of N as the section scrolls, and swap the
     window's title / path / command so switching visibly changes the
     workspace. Cached index avoids rewriting the DOM every frame. */
  function updateProjects(section, p) {
    var rows = section.querySelectorAll('[data-proj]');
    if (!rows.length) return;
    var idx = Math.min(rows.length - 1, Math.floor(p * rows.length));
    if (section._proj === idx) return;
    section._proj = idx;
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('is-active', i === idx);
    }
    var active = rows[idx];
    var set = function (sel, attr) {
      var t = section.querySelector(sel);
      if (t) t.textContent = active.getAttribute(attr);
    };
    set('[data-proj-title]', 'data-title');
    set('[data-proj-ctx]', 'data-ctx');
    set('[data-proj-line]', 'data-line');
  }
  function onScroll() {
    if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
  }

  if (!reduceMotion && scrubbed.length) {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  /* ---- One-shot reveals for non-pinned content ---------------------- */
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if (!reduceMotion && 'IntersectionObserver' in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.18 });
    reveals.forEach(function (r) { io.observe(r); });
  } else {
    reveals.forEach(function (r) { r.classList.add('in-view'); });
  }

  /* ---- Version badge (progressive enhancement) ----------------------
     Replace the hardcoded version with the latest published tag. If the
     request fails or is rate-limited, the hardcoded default stays. */
  var badges = Array.prototype.slice.call(document.querySelectorAll('[data-version]'));
  if (badges.length && window.fetch) {
    fetch('https://api.github.com/repos/anik1ng/claui.app/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' }
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.tag_name) {
          badges.forEach(function (b) { b.textContent = data.tag_name; });
        }
      })
      .catch(function () { /* keep the default */ });
  }

  /* ---- GitHub star count (progressive enhancement) ------------------
     Stays hidden until a count arrives, so a failed/rate-limited request
     just leaves the bare octocat icon — no empty "★" placeholder. */
  var starEls = Array.prototype.slice.call(document.querySelectorAll('[data-stars]'));
  if (starEls.length && window.fetch) {
    fetch('https://api.github.com/repos/anik1ng/claui.app', {
      headers: { Accept: 'application/vnd.github+json' }
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && typeof data.stargazers_count === 'number') {
          starEls.forEach(function (el) {
            el.textContent = '★ ' + data.stargazers_count;
            el.hidden = false;
          });
        }
      })
      .catch(function () { /* leave the icon bare */ });
  }
})();
