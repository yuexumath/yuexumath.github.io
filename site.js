/* ============================================================================
   Yue Xu · personal academic site
   Theme toggle, bilingual switching, and the random-matrix backdrop.
   ========================================================================= */
(function () {
    'use strict';

    var KEY_THEME = 'yx-theme';
    var KEY_LANG = 'yx-lang';
    var root = document.documentElement;

    function read(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function save(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    }

    /* ------------------------------------------------------------- theme */
    var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    var reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    function effectiveTheme() {
        return root.getAttribute('data-theme') || (darkQuery.matches ? 'dark' : 'light');
    }

    function syncThemeState() {
        root.setAttribute('data-effective', effectiveTheme());
    }

    function initTheme() {
        syncThemeState();

        // keep following the OS while no explicit choice has been made
        var onChange = function () {
            if (!root.getAttribute('data-theme')) { syncThemeState(); }
        };
        if (darkQuery.addEventListener) { darkQuery.addEventListener('change', onChange); }
        else if (darkQuery.addListener) { darkQuery.addListener(onChange); }

        var btn = document.getElementById('theme-btn');
        if (!btn) { return; }
        btn.addEventListener('click', function () {
            var next = effectiveTheme() === 'dark' ? 'light' : 'dark';

            var commit = function () {
                root.classList.add('is-theme-changing');
                root.setAttribute('data-theme', next);
                save(KEY_THEME, next);
                syncThemeState();
                if (window.__yxMatrix) { window.__yxMatrix.refresh(); }
                if (window.__yxReasoning) { window.__yxReasoning.refresh(); }
                window.setTimeout(function () {
                    root.classList.remove('is-theme-changing');
                }, 480);
            };

            // Newer browsers cross-fade the complete page as one coherent
            // surface. Older browsers simply use the token transitions above.
            if (document.startViewTransition && !reduceMotionQuery.matches) {
                document.startViewTransition(commit);
            } else {
                commit();
            }
        });
    }

    /* ---------------------------------------------------------- language */
    function applyLang(lang) {
        lang = (lang === 'zh') ? 'zh' : 'en';

        document.querySelectorAll('[data-zh][data-en]').forEach(function (el) {
            // never overwrite a node that owns markup (icons, nested spans)
            if (el.children.length) { return; }
            var text = lang === 'zh' ? el.dataset.zh : el.dataset.en;
            if (text != null) { el.textContent = text; }
        });

        document.querySelectorAll('[data-zh-title][data-en-title]').forEach(function (el) {
            var t = lang === 'zh' ? el.dataset.zhTitle : el.dataset.enTitle;
            if (t) { el.setAttribute('title', t); }
        });

        document.querySelectorAll('[data-zh-label][data-en-label]').forEach(function (el) {
            var label = lang === 'zh' ? el.dataset.zhLabel : el.dataset.enLabel;
            if (label) { el.setAttribute('aria-label', label); el.setAttribute('title', label); }
        });

        root.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en-US');

        var title = lang === 'zh' ? root.dataset.titleZh : root.dataset.titleEn;
        if (title) { document.title = title; }

        document.querySelectorAll('.lang-switch button[data-lang]').forEach(function (btn) {
            var on = btn.getAttribute('data-lang') === lang;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });

        save(KEY_LANG, lang);

        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise();
        }
    }

    var langTimer = null;

    function changeLang(lang) {
        lang = (lang === 'zh') ? 'zh' : 'en';
        var current = root.getAttribute('lang') === 'zh-CN' ? 'zh' : 'en';
        if (lang === current) { return; }

        if (reduceMotionQuery.matches) {
            applyLang(lang);
            return;
        }

        window.clearTimeout(langTimer);
        root.classList.add('is-lang-changing');
        langTimer = window.setTimeout(function () {
            applyLang(lang);
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    root.classList.remove('is-lang-changing');
                });
            });
        }, 130);
    }

    function initLang() {
        var buttons = document.querySelectorAll('.lang-switch button[data-lang]');
        if (!buttons.length) { return; }
        buttons.forEach(function (btn) {
            btn.addEventListener('click', function () {
                changeLang(btn.getAttribute('data-lang'));
            });
        });
        applyLang(read(KEY_LANG) || 'en');
    }

    // kept as a global so any inline onclick="switchLanguage('zh')" still works
    window.switchLanguage = changeLang;

    /* ----------------------------------------------- random-matrix layer
       A grid of cells, each easing toward a fresh random target opacity.
       Literally a random matrix, slowly resampling itself.                */
    function initMatrix() {
        var canvas = document.getElementById('matrix-bg');
        if (!canvas || !canvas.getContext) { return; }

        var ctx = canvas.getContext('2d');
        var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

        var BASE_CELL = 22;     // cell pitch in CSS pixels
        var BASE_SQUARE = 15;   // drawn square size
        var MAX_CELLS = 6200;   // hard cap so huge monitors stay cheap
        var FRAME_MS = 55;      // ~18fps is plenty for something this slow

        var CELL = BASE_CELL;
        var SQUARE = BASE_SQUARE;

        var cols = 0, rows = 0;
        var value = null, target = null;
        var rgb = '58, 83, 80';
        var accentRgb = '104, 88, 179';
        var maxAlpha = 0.075;
        var last = 0;
        var running = false;

        function readTokens() {
            var cs = getComputedStyle(root);
            rgb = (cs.getPropertyValue('--matrix-rgb') || rgb).trim();
            accentRgb = (cs.getPropertyValue('--matrix-accent-rgb') || accentRgb).trim();
            maxAlpha = parseFloat(cs.getPropertyValue('--matrix-alpha')) || maxAlpha;
        }

        function build() {
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            var w = window.innerWidth;
            var h = window.innerHeight;

            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            // reset the pitch each rebuild, otherwise repeated resizes keep coarsening
            CELL = BASE_CELL;
            SQUARE = BASE_SQUARE;

            cols = Math.ceil(w / CELL) + 1;
            rows = Math.ceil(h / CELL) + 1;

            // if the viewport is enormous, coarsen rather than draw 10k cells
            while (cols * rows > MAX_CELLS) {
                CELL += 4;
                SQUARE += 3;
                cols = Math.ceil(w / CELL) + 1;
                rows = Math.ceil(h / CELL) + 1;
            }

            var n = cols * rows;
            value = new Float32Array(n);
            target = new Float32Array(n);
            for (var i = 0; i < n; i++) {
                target[i] = Math.random();
                value[i] = target[i];
            }
        }

        // Only the top slice of entries is inked at all, so the grid reads as a
        // sparse scatter rather than a busy checkerboard.
        var THRESHOLD = 0.70;

        function paint() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            var pad = (CELL - SQUARE) / 2;
            var span = 1 - THRESHOLD;
            for (var y = 0; y < rows; y++) {
                for (var x = 0; x < cols; x++) {
                    var v = value[y * cols + x];
                    if (v <= THRESHOLD) { continue; }
                    var a = ((v - THRESHOLD) / span) * maxAlpha;
                    if (a < 0.003) { continue; }
                    var ink = v > 0.94 ? accentRgb : rgb;
                    ctx.fillStyle = 'rgba(' + ink + ',' + a.toFixed(4) + ')';
                    ctx.fillRect(x * CELL + pad, y * CELL + pad, SQUARE, SQUARE);
                }
            }
        }

        function step(now) {
            if (!running) { return; }
            requestAnimationFrame(step);
            if (now - last < FRAME_MS) { return; }
            last = now;

            var n = cols * rows;
            for (var i = 0; i < n; i++) {
                value[i] += (target[i] - value[i]) * 0.045;
            }
            // resample a small handful of entries each tick
            var resample = Math.max(2, Math.round(n * 0.006));
            for (var k = 0; k < resample; k++) {
                target[(Math.random() * n) | 0] = Math.random();
            }
            paint();
        }

        function start() {
            if (running || motionQuery.matches) { return; }
            running = true;
            last = 0;
            requestAnimationFrame(step);
        }

        function stop() { running = false; }

        var resizeTimer = null;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () { build(); paint(); }, 180);
        });

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) { stop(); } else { start(); }
        });

        readTokens();
        build();
        paint();
        start();

        window.__yxMatrix = {
            refresh: function () { readTokens(); paint(); }
        };
    }

    /* ------------------------------------------------------------ tips
       Wire each keyword chip to its tooltip so screen readers announce it;
       the tip is visibility:hidden until hover/focus, so it needs the link. */
    function initTips() {
        document.querySelectorAll('.kw').forEach(function (chip, i) {
            var tip = chip.querySelector('.kw-tip');
            if (!tip) { return; }
            if (!tip.id) { tip.id = 'kw-tip-' + i; }
            chip.setAttribute('aria-describedby', tip.id);
        });
    }

    /* ------------------------------------------- reasoning trajectory
       Three paths begin under competing oscillations and gradually phase-lock
       into parallel lines. It is a visual metaphor for finding structure in
       noisy evidence, not a literal simulation of a physical system. */
    function initReasoningPath() {
        var canvas = document.getElementById('reasoning-path');
        if (!canvas || !canvas.getContext) { return; }

        var ctx = canvas.getContext('2d');
        var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        var width = 0, height = 0;
        var neutralRgb = '58, 83, 80';
        var accentRgb = '23, 91, 94';
        var signalRgb = '104, 88, 179';
        var running = false;
        var visible = true;
        var last = 0;

        function readTokens() {
            var cs = getComputedStyle(root);
            neutralRgb = (cs.getPropertyValue('--matrix-rgb') || neutralRgb).trim();
            accentRgb = (cs.getPropertyValue('--matrix-rgb') || accentRgb).trim();
            signalRgb = (cs.getPropertyValue('--matrix-accent-rgb') || signalRgb).trim();
        }

        function resize() {
            var rect = canvas.getBoundingClientRect();
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = Math.max(1, rect.width);
            height = Math.max(1, rect.height);
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function smoothstep(t) { return t * t * (3 - 2 * t); }

        function pathY(t, lane, phase) {
            var order = smoothstep(Math.min(1, Math.max(0, (t - .08) / .84)));
            var disorder = (1 - order) * height * .24;
            var noise =
                Math.sin(t * 21 + phase * .72 + lane * 1.73) * .54 +
                Math.sin(t * 47 - phase * .43 + lane * 2.61) * .29 +
                Math.sin(t * 89 + phase * .18 + lane * .91) * .17;
            var orderedOffset = (lane - 1) * Math.min(13, height * .16);
            return height / 2 + disorder * noise + order * orderedOffset;
        }

        function draw(now) {
            ctx.clearRect(0, 0, width, height);
            var phase = now * .00022;
            var inks = [neutralRgb, signalRgb, accentRgb];

            for (var lane = 0; lane < 3; lane++) {
                var gradient = ctx.createLinearGradient(0, 0, width, 0);
                gradient.addColorStop(0, 'rgba(' + inks[lane] + ',0.22)');
                gradient.addColorStop(.58, 'rgba(' + inks[lane] + ',0.48)');
                gradient.addColorStop(1, 'rgba(' + inks[lane] + ',0.76)');
                ctx.beginPath();
                for (var x = 0; x <= width; x += 2) {
                    var t = x / width;
                    var y = pathY(t, lane, phase);
                    if (x === 0) { ctx.moveTo(x, y); }
                    else { ctx.lineTo(x, y); }
                }
                ctx.strokeStyle = gradient;
                ctx.lineWidth = lane === 1 ? 1.25 : 1;
                ctx.stroke();

                // A small moving point makes the direction of inquiry legible.
                if (!motionQuery.matches) {
                    var progress = (now * .000055 + lane * .24) % 1;
                    var px = progress * width;
                    var py = pathY(progress, lane, phase);
                    ctx.beginPath();
                    ctx.arc(px, py, lane === 1 ? 2.2 : 1.8, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(' + inks[lane] + ',0.82)';
                    ctx.fill();
                }
            }
        }

        function frame(now) {
            if (!running) { return; }
            requestAnimationFrame(frame);
            if (now - last < 42) { return; }
            last = now;
            draw(now);
        }

        function start() {
            if (running || motionQuery.matches || !visible || document.hidden) { return; }
            running = true;
            last = 0;
            requestAnimationFrame(frame);
        }

        function stop() { running = false; }

        var resizeTimer = null;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () { resize(); draw(performance.now()); }, 160);
        });

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) { stop(); } else { start(); }
        });

        if ('IntersectionObserver' in window) {
            visible = false;
            new IntersectionObserver(function (entries) {
                visible = !!entries[0] && entries[0].isIntersecting;
                if (visible) { start(); } else { stop(); }
            }, { threshold: .05 }).observe(canvas);
        }

        readTokens();
        resize();
        draw(0);
        start();

        window.__yxReasoning = {
            refresh: function () { readTokens(); draw(performance.now()); }
        };
    }

    /* --------------------------------------------------------------- go */
    function boot() {
        initTheme();
        initLang();
        initTips();
        initReasoningPath();
        initMatrix();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
