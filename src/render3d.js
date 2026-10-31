/* Optional 3D view of the same match. Drawing only: it reads the match and the animator skeleton and never changes them.
   Key 3 (or the button) switches it on; drag the mouse on the arena to turn the camera. three.js is loaded on demand. */
var SF = (typeof SF === 'undefined') ? {} : SF;
(function () {
  'use strict';
  const C = SF.CFG, clamp = SF.clamp;
  const THREE_URLS = ['vendor/three.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'];   /* the local copy first, so the 3D view works offline */
  const V = SF.view3d = { on: false, failed: false, az: 0.5, el: 0.2 };
  let obsKey = null, obsMeshes = [];
  let T = null, renderer = null, scene = null, camera = null, c3 = null, rigs = null, target = null, loading = false;
  const COL = [0x5ab0ff, 0xff8a5a, 0x6fdc9a, 0xffd05a];

  /* z offsets give the flat skeleton some depth: the front arm and leg toward the camera, the back ones away */
  const ZF = 6, ZB = -6;
  const SEGS = [
    ['shoulderB', null, 'elbow', 1, 'back', 3], ['elbow', 1, 'hand', 1, 'back', 2.6],
    ['hip', null, 'knee', 1, 'back', 3.6], ['knee', 1, 'foot', 1, 'back', 3],
    ['hip', null, 'chest', null, 'mid', 4.6], ['chest', null, 'neck', null, 'mid', 3.4],
    ['shoulderB', null, 'shoulder', null, 'span', 3],
    ['hip', null, 'knee', 0, 'front', 3.6], ['knee', 0, 'foot', 0, 'front', 3],
    ['shoulder', null, 'elbow', 0, 'front', 3], ['elbow', 0, 'hand', 0, 'front', 2.6]
  ];
  /* a point's z: the shoulder girdle and hip carry the side they belong to */
  function zOf(name, idx) {
    if (name === 'shoulderB') return ZB;
    if (name === 'shoulder') return ZF;
    if (name === 'hip' || name === 'chest' || name === 'neck' || name === 'head') return 0;
    return idx === 1 ? ZB : ZF;
  }
  function pt(k, name, idx) { const p = idx === null || idx === undefined ? k[name] : k[name][idx]; return new T.Vector3(p[0] - C.W / 2, C.GY - p[1], zOf(name, idx)); }

  function place(mesh, a, b) {
    const d = new T.Vector3().subVectors(b, a), len = d.length() || 0.001;
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.multiplyScalar(1 / len));
  }

  function build() {
    scene = new T.Scene(); scene.background = new T.Color(0x0f1218);
    camera = new T.PerspectiveCamera(38, C.W / 450, 10, 4000);
    renderer = new T.WebGLRenderer({ canvas: c3, antialias: true });
    renderer.setSize(C.W, 450, false); renderer.shadowMap.enabled = true;
    scene.add(new T.HemisphereLight(0xdfe8ff, 0x1a1d26, 0.85));
    const sun = new T.DirectionalLight(0xffffff, 0.85); sun.position.set(180, 420, 320); sun.castShadow = true;
    sun.shadow.camera.left = -520; sun.shadow.camera.right = 520; sun.shadow.camera.top = 300; sun.shadow.camera.bottom = -300; sun.shadow.camera.far = 1200;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    const floor = new T.Mesh(new T.PlaneGeometry(C.W + 400, 700), new T.MeshStandardMaterial({ color: 0x171a21, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const grid = new T.GridHelper(C.W, 18, 0x3a3f4c, 0x252a35); grid.position.y = 0.5; scene.add(grid);
    const edge = new T.Mesh(new T.BoxGeometry(C.W, 3, 3), new T.MeshStandardMaterial({ color: 0x3a3f4c }));
    for (const z of [-170, 170]) { const e = edge.clone(); e.position.set(0, 1.5, z); scene.add(e); }
    target = new T.Vector3();
    rigs = [0, 1, 2, 3].map(function (i) {
      const mat = new T.MeshStandardMaterial({ color: COL[i], roughness: 0.55 }), back = new T.MeshStandardMaterial({ color: COL[i], roughness: 0.55 });
      back.color.multiplyScalar(0.62);
      const segs = SEGS.map(function (s) {
        const m = new T.Mesh(new T.CylinderGeometry(s[5], s[5], 1, 10), s[4] === 'back' ? back : mat);
        m.castShadow = true; scene.add(m); return m;
      });
      const head = new T.Mesh(new T.SphereGeometry(C.LIMB.head, 16, 12), mat); head.castShadow = true; scene.add(head);
      const joints = [];
      for (let j = 0; j < 4; j++) { const s = new T.Mesh(new T.SphereGeometry(3.6, 10, 8), j < 2 ? mat : back); s.castShadow = true; scene.add(s); joints.push(s); }
      const shield = new T.Mesh(new T.TorusGeometry(40, 2.4, 8, 28, 1.5), new T.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.6 }));
      shield.visible = false; scene.add(shield);
      return { mat: mat, back: back, segs: segs, head: head, joints: joints, shield: shield, base: COL[i] };
    });
  }

  function load(cb) {
    if (window.THREE) { T = window.THREE; return cb(true); }
    if (loading) return;
    loading = true;
    const tryUrl = function (i) {
      if (i >= THREE_URLS.length) { loading = false; V.failed = true; return cb(false); }
      const s = document.createElement('script'); s.src = THREE_URLS[i];
      s.onload = function () { loading = false; T = window.THREE; cb(!!T); };
      s.onerror = function () { s.remove(); tryUrl(i + 1); };
      document.head.appendChild(s);
    };
    tryUrl(0);
  }

  function layout() {
    const c = document.getElementById('c'); if (!c || !c3) return;
    c3.style.left = c.offsetLeft + 'px'; c3.style.top = c.offsetTop + 'px'; c3.style.width = c.clientWidth + 'px'; c3.style.height = c.clientHeight + 'px';
  }

  /* switch on or off; cb(ok) tells the page whether it worked */
  V.toggle = function (cb) {
    if (V.on) { V.on = false; if (c3) c3.style.display = 'none'; const c = document.getElementById('c'); if (c) c.style.background = ''; if (cb) cb(true, false); return; }
    load(function (ok) {
      if (!ok) { if (cb) cb(false, false); return; }
      try {
        if (!c3) {
          c3 = document.createElement('canvas'); c3.width = C.W; c3.height = 450;
          c3.style.cssText = 'position:absolute;pointer-events:none;border-radius:6px;z-index:0';
          const wrap = document.getElementById('wrap'); wrap.style.position = 'relative'; wrap.appendChild(c3);
          const c = document.getElementById('c'); c.style.position = 'relative'; c.style.zIndex = 1;
          let drag = null;
          c.addEventListener('mousedown', function (e) { if (V.on) drag = [e.clientX, e.clientY]; });
          addEventListener('mouseup', function () { drag = null; });
          addEventListener('mousemove', function (e) {
            if (!drag || !V.on) return;
            V.az = clamp(V.az - (e.clientX - drag[0]) * 0.008, -1.4, 1.4); V.el = clamp(V.el + (e.clientY - drag[1]) * 0.006, 0.02, 1.1);
            drag = [e.clientX, e.clientY];
          });
          build();
        }
        V.on = true; c3.style.display = 'block'; document.getElementById('c').style.background = 'transparent';
        if (cb) cb(true, true);
      } catch (err) { V.failed = true; V.on = false; if (cb) cb(false, false); }
    });
  };

  /* screen position (in the 900 x 450 overlay) of a point of the flat game world, for the floating texts and sparks */
  V.project = function (x, y) {
    if (!camera) return [x, y];
    const v = new T.Vector3(x - C.W / 2, C.GY - y, 0).project(camera);
    return [(v.x * 0.5 + 0.5) * C.W, (-v.y * 0.5 + 0.5) * 450];
  };

  V.render = function (m, anim) {
    if (!V.on || !renderer) return;
    layout();
    if (obsKey !== m.obstacles) {   /* the boxes of this match */
      obsMeshes.forEach(function (o) { scene.remove(o); }); obsMeshes = []; obsKey = m.obstacles;
      m.obstacles.forEach(function (b) { const o = new T.Mesh(new T.BoxGeometry(b.w, b.h, 70), new T.MeshStandardMaterial({ color: 0x6b5a46, roughness: 0.9 })); o.position.set(b.x - C.W / 2, b.h / 2, 0); o.castShadow = true; o.receiveShadow = true; scene.add(o); obsMeshes.push(o); });
    }
    const xs = m.f.map(function (q) { return q.x; }), lo = Math.min.apply(null, xs), hi = Math.max.apply(null, xs);
    const mid = (lo + hi) / 2 - C.W / 2, sep = hi - lo;
    rigs.forEach(function (r, j) { const vis = j < m.f.length; r.segs.forEach(function (s) { s.visible = vis; }); r.head.visible = vis; r.joints.forEach(function (s) { s.visible = vis; }); if (!vis) r.shield.visible = false; });
    target.set(mid, 80, 0);
    const dist = clamp(520 + sep * 0.55, 560, 1100);
    camera.position.set(mid + Math.sin(V.az) * Math.cos(V.el) * dist, 40 + Math.sin(V.el) * dist, Math.cos(V.az) * Math.cos(V.el) * dist);
    camera.lookAt(target); camera.updateMatrixWorld();
    for (let i = 0; i < m.f.length; i++) {
      const f = m.f[i], k = anim ? anim.skeleton(m, i) : SF.skeleton(f, m.t), r = rigs[i];
      r.mat.color.setHex(f.flash > 0 ? 0xffffff : r.base); r.back.color.setHex(f.flash > 0 ? 0xdddddd : r.base); if (f.flash <= 0) r.back.color.multiplyScalar(0.62);
      SEGS.forEach(function (s, j) { place(r.segs[j], pt(k, s[0], s[1]), pt(k, s[2], s[3])); });
      const h = pt(k, 'head'); r.head.position.copy(h);
      [pt(k, 'shoulder'), pt(k, 'hand', 0), pt(k, 'shoulderB'), pt(k, 'hand', 1)].forEach(function (p, j) { r.joints[j].position.copy(p); });
      const fl = SF.shieldFlash ? SF.shieldFlash(i) : 0;
      if (f.state === 'guard' || fl > 0) {
        const ar = f.aim * Math.PI / 180, hp = clamp(f.gHP / f.style.gmax, 0, 1), ch = pt(k, 'chest');
        r.shield.visible = true; r.shield.position.copy(ch);
        r.shield.rotation.z = Math.atan2(Math.sin(ar), f.face * Math.cos(ar)) - 0.75;
        r.shield.material.opacity = (f.state === 'guard' ? 0.3 + 0.3 * hp : 0) + 0.5 * Math.min(1, fl);
        r.shield.material.color.setHex(fl > 1 ? 0xffd24d : 0x7fe0ff);
      } else r.shield.visible = false;
    }
    renderer.render(scene, camera);
  };
})();
