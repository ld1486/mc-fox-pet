/* Idle life for the fox: state machine, vanilla poses and procedural layers. */
const PI = Math.PI;
const TAU = PI * 2;

const BASE = {
  head: { p: [-1, 16.5, -3], r: [0, 0, 0] },
  right_ear: { p: [0, 0, 0], r: [0, 0, 0] },
  left_ear: { p: [0, 0, 0], r: [0, 0, 0] },
  nose: { p: [0, 0, 0], r: [0, 0, 0] },
  body: { p: [0, 16, -6], r: [PI / 2, 0, 0] },
  tail: { p: [-4, 15, -1], r: [-0.05235988, 0, 0] },
  legRH: { p: [-5, 17.5, 7], r: [0, 0, 0] },
  legLH: { p: [-1, 17.5, 7], r: [0, 0, 0] },
  legRF: { p: [-5, 17.5, 0], r: [0, 0, 0] },
  legLF: { p: [-1, 17.5, 0], r: [0, 0, 0] },
};

function pose(over) {
  const out = {};
  for (const k of Object.keys(BASE)) {
    out[k] = { p: BASE[k].p.slice(), r: BASE[k].r.slice(), v: true };
  }
  if (over) {
    for (const k of Object.keys(over)) {
      const o = over[k];
      if (o.p) out[k].p = o.p.slice();
      if (o.r) out[k].r = o.r.slice();
      if (o.v !== undefined) out[k].v = o.v;
    }
  }
  return out;
}

const SIT = {
  body: { p: [0, 9, -3], r: [PI / 6, 0, 0] },
  tail: { p: [-4, 15, -2], r: [PI / 4, 0, 0] },
  head: { p: [-1, 10, -0.25], r: [0, 0, 0] },
  legRH: { p: [-5, 21.5, 6.75], r: [-5 * PI / 12, 0, 0] },
  legLH: { p: [-1, 21.5, 6.75], r: [-5 * PI / 12, 0, 0] },
  legRF: { r: [-PI / 12, 0, 0] },
  legLF: { r: [-PI / 12, 0, 0] },
};

const SLEEP = {
  body: { p: [0, 21, -6], r: [PI / 2, 0, -PI / 2] },
  tail: { r: [-5 * PI / 6, 0, 0] },
  head: { p: [1, 19.49, -3], r: [0, -2 * PI / 3, 0] },
  legRH: { v: false },
  legLH: { v: false },
  legRF: { v: false },
  legLF: { v: false },
};

function crouchPose(c) {
  return pose({
    body: { p: [0, 16 + c, -6], r: [1.6755161, 0, 0] },
    head: { p: [-1, 16.5 + c, -3], r: [0, 0, 0] },
    legRH: { r: [-0.4 * c, 0, 0] },
    legLH: { r: [-0.4 * c, 0, 0] },
    legRF: { r: [0.5 * c, 0, 0] },
    legLF: { r: [0.5 * c, 0, 0] },
    tail: { r: [-0.052 - 0.5 * c, 0, 0] },
  });
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rand = (a, b) => a + Math.random() * (b - a);

const ACTIVITIES = [
  ['look', 26],
  ['sit', 16],
  ['tail', 12],
  ['groom', 10],
  ['stretch', 8],
  ['pounce', 7],
  ['spin', 4],
  ['hop', 9],
  ['scratch', 5],
  ['walk', 8],
];

export class FoxAnim {
  constructor(fox, hooks = {}) {
    this.fox = fox;
    this.hooks = hooks;
    this.t = 0;
    this.state = 'stand';
    this.stateT = 0;
    this.hold = 0;
    this.nextActivity = 7 + Math.random() * 5;
    this.cur = pose();
    this.lookTarget = { yaw: 0, pitch: 0 };
    this.look = { yaw: 0, pitch: 0 };
    this.lookHold = 0;
    this.eyeClosed = false;
    this.blinkAt = rand(2, 5);
    this.jumpY = 0;
    this.jumpV = 0;
    this.drag = null;
    this.roam = { x: 0, targetX: 0, yaw: 0, walking: false };
    this.spin = 0;
    this.rigZ = 0;
    this.walkPhase = 0;
    this.lastInteract = 0;
    this.facingYaw = 0;
    this.didPounce = false;
    this.onLand = null;
  }

  /* ------------------------------------------------------------ state control */
  setState(name, holdSeconds = 0, opts = {}) {
    if (this.state === name && !opts.force) return;
    this.state = name;
    this.stateT = 0;
    this.hold = holdSeconds;
    if (this.hooks.onState) this.hooks.onState(name);
  }

  idleActivity(name) {
    this.setState(name, 0);
  }

  startDrag(vx = 0) {
    this.drag = { vx: 0, vy: 0, sway: 0 };
    this.setState('drag');
  }

  endDrag() {
    this.drag = null;
    this.setState('land', 0.5);
    this.jumpV = 7.5; // tiny bounce
  }

  react(kind) {
    this.lastInteract = this.t;
    if (kind === 'click') {
      if (Math.random() < 0.55) {
        this.setState('hop', 0.7);
        this.jumpV = rand(8, 12);
      } else if (Math.random() < 0.6) {
        this.didPounce = false;
        this.setState('pounce', 1.2);
      } else {
        this.setState('look', 2.0);
        this.lookHold = 1.6;
        this.lookTarget = { yaw: Math.random() < 0.5 ? -0.6 : 0.6, pitch: 0.1 };
      }
    } else if (kind === 'doubleclick') {
      this.setState('spin', 1.3);
    } else if (kind === 'poke') {
      this.setState('hop', 0.6);
    }
  }

  wake() {
    if (this.state === 'sleep') this.setState('stand');
    this.lastInteract = this.t;
  }

  /* ------------------------------------------------------------------ update */
  update(dt) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    this.stateT += dt;

    if (this.state === 'drag') {
      this.dragUpdate(dt);
      return;
    }

    // --- activity scheduling
    if (this.state === 'stand' && this.stateT > this.nextActivity) {
      const pick = weightedPick(ACTIVITIES);
      this.activity(pick);
    }
    if (this.state === 'stand' && this.t - this.lastInteract > 55 && Math.random() < dt * 0.08) {
      this.activity('sleep');
    }

    // --- state durations
    if (this.hold > 0 && this.stateT > this.hold) {
      this.hold = 0;
      this.setState('stand');
      this.nextActivity = 4 + Math.random() * 6;
      this.stateT = 0;
    }

    // --- pose for the current state
    let target = this.statePose();

    // --- head look (hover / cursor tracking)
    this.look.yaw = lerp(this.look.yaw, this.lookTarget.yaw, 1 - Math.exp(-dt * 6));
    this.look.pitch = lerp(this.look.pitch, this.lookTarget.pitch, 1 - Math.exp(-dt * 6));
    if (this.state !== 'sleep' && this.state !== 'pounce') {
      target.head.r[1] += this.look.yaw;
      target.head.r[0] += this.look.pitch;
      target.head.p[0] += this.look.yaw * 0.6;
    }

    // --- procedural life
    const t = this.t;
    const breath = Math.sin(t * 1.9) * 0.5 + 0.5;
    // tail idle sway
    if (this.state !== 'sleep' && this.state !== 'drag') {
      target.tail.r[1] += Math.sin(t * 1.35) * 0.14;
      target.tail.r[2] += Math.sin(t * 1.02 + 1.1) * 0.1;
    }
    target.body.p[1] += Math.sin(t * 1.9) * 0.12;
    target.head.p[1] += Math.sin(t * 1.9 + 0.35) * 0.14;
    target.head.r[2] += Math.sin(t * 0.73) * 0.02;

    // walk cycle
    if (this.state === 'walk') this.walkPose(target, dt);
    if (this.state === 'scratch') this.scratchPose(target);
    if (this.state === 'spin') this.spinPose(target);
    if (this.state === 'groom') this.groomPose(target);
    if (this.state === 'stretch') this.stretchPose(target);
    if (this.state === 'pounce') this.pouncePose(target);
    if (this.state === 'land') this.landPose(target);
    if (this.state === 'tail') this.tailWag(target, 13, 0.62);

    // eyes
    if (this.t > this.blinkAt) {
      this.eyeClosed = true;
      this.blinkAt = this.t + rand(2.2, 6.5);
      this.blinkOff = this.t + 0.13;
    }
    if (this.eyeClosed && this.t > (this.blinkOff || 0)) this.eyeClosed = false;

    // smoothing
    const tau = this.state === 'sleep' || this.state === 'stand' && this.prevState === 'sleep' ? 0.34 : 0.14;
    const k = 1 - Math.exp(-dt / tau);
    for (const name of Object.keys(this.cur)) {
      const c = this.cur[name];
      const g = target[name];
      for (let i = 0; i < 3; i += 1) {
        c.p[i] = lerp(c.p[i], g.p[i], k);
        c.r[i] = lerp(c.r[i], g.r[i], k);
      }
      c.v = g.v;
    }
    this.prevState = this.state;

    this.fox.applyPose(this.cur);
    this.applyRoot(dt, breath);
  }

  applyRoot(dt) {
    // jump / bounce (units per second)
    if (this.jumpV !== 0 || this.jumpY !== 0) {
      this.jumpY += this.jumpV * dt;
      this.jumpV -= 55 * dt;
      if (this.jumpY <= 0) {
        this.jumpY = 0;
        this.jumpV = 0;
      }
    }
    this.fox.rig.position.y = 24 + this.jumpY;
    this.fox.rig.position.z = this.rigZ;
    if (this.state !== 'pounce') this.rigZ = lerp(this.rigZ, 0, 1 - Math.exp(-dt * 5));

    // roam
    if (this.state === 'walk') {
      const d = this.roam.targetX - this.roam.x;
      const step = Math.sign(d) * Math.min(Math.abs(d), dt * 1.1);
      this.roam.x += step;
      this.roam.yaw = clamp(step * 2.4, -0.55, 0.55);
      this.fox.root.position.x = this.roam.x;
      this.fox.root.rotation.y = this.roam.yaw;
      if (Math.abs(d) < 0.01) {
        this.setState('stand');
        this.nextActivity = 3 + Math.random() * 5;
      }
    } else {
      this.roam.yaw = lerp(this.roam.yaw, 0, 1 - Math.exp(-dt * 4));
      if (this.state !== 'spin') {
        this.fox.root.rotation.y = this.roam.yaw;
      }
      this.fox.root.position.x = lerp(this.fox.root.position.x, this.roam.x, 1 - Math.exp(-dt * 3));
    }
  }

  /* ------------------------------------------------------------------- poses */
  statePose() {
    switch (this.state) {
      case 'sit':
      case 'scratch':
        return pose(SIT);
      case 'sleep':
        return pose(SLEEP);
      case 'pounce':
        return crouchPose(clamp(this.stateT / 0.25, 0, 1) * 0.95);
      case 'hop': {
        const p = pose();
        p.tail.r[0] -= 0.5;
        p.legRF.r[0] = -0.5;
        p.legLF.r[0] = -0.5;
        return p;
      }
      case 'groom':
        return pose(SIT);
      case 'stretch':
        return pose({
          body: { p: [0, 16.5, -6], r: [1.32, 0, 0] },
          head: { p: [-1, 17.5, -3], r: [0.25, 0, 0] },
          legRF: { r: [0.55, 0, 0] },
          legLF: { r: [0.55, 0, 0] },
          tail: { r: [-0.5, 0, 0] },
        });
      case 'land':
        return pose({ body: { p: [0, 16.6, -6] }, head: { p: [-1, 17.1, -3] } });
      case 'walk':
        return pose();
      default:
        return pose();
    }
  }

  activity(name) {
    switch (name) {
      case 'look':
        this.setState('look', rand(2.4, 4.4));
        this.lookHold = this.hold;
        this.lookTarget = {
          yaw: (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 0.75),
          pitch: rand(-0.12, 0.18),
        };
        break;
      case 'sit':
        this.setState('sit', rand(7, 22));
        this.lookTarget = { yaw: rand(-0.2, 0.2), pitch: 0 };
        break;
      case 'sleep':
        this.setState('sleep', rand(25, 70));
        this.lookTarget = { yaw: 0, pitch: 0 };
        break;
      case 'tail': {
        this.setState('tail', rand(1.4, 2.6));
        break;
      }
      case 'groom':
        this.setState('groom', rand(2.4, 3.6));
        break;
      case 'stretch':
        this.setState('stretch', rand(1.6, 2.4));
        break;
      case 'pounce':
        this.setState('pounce', rand(1.0, 1.5));
        this.didPounce = false;
        break;
      case 'spin':
        this.setState('spin', 1.35);
        this.spin = 0;
        break;
      case 'hop':
        this.setState('hop', 0.7);
        this.jumpV = rand(9, 13);
        break;
      case 'scratch':
        this.setState('scratch', rand(2.2, 3.4));
        break;
      case 'walk':
        this.setState('walk', 0);
        this.roam.targetX = rand(-0.55, 0.55);
        break;
      default:
        this.setState('look', 2);
    }
    this.stateT = 0;
  }

  tailWag(target, speed = 9, amp = 0.5) {
    target.tail.r[1] += Math.sin(this.t * speed) * amp;
    target.tail.r[2] += Math.sin(this.t * speed * 0.6) * amp * 0.3;
  }

  walkPose(target, dt) {
    this.walkPhase += dt * 9;
    const s = Math.sin(this.walkPhase);
    target.legRH.r[0] = s * 0.55;
    target.legLH.r[0] = -s * 0.55;
    target.legRF.r[0] = -s * 0.55;
    target.legLF.r[0] = s * 0.55;
    target.body.p[1] += Math.abs(Math.sin(this.walkPhase * 2)) * 0.25;
    target.tail.r[1] += Math.sin(this.walkPhase * 0.5) * 0.25;
  }

  scratchPose(target) {
    target.legRH.r[0] = -0.45 + Math.sin(this.t * 22) * 0.55;
    target.legRH.p[1] = 19.5;
    target.head.r[0] += 0.25;
    this.tailWag(target, 6, 0.3);
  }

  spinPose(target) {
    const p = clamp(this.stateT / 1.1, 0, 1);
    const e = p * p * (3 - 2 * p);
    this.fox.root.rotation.y = this.roam.yaw + e * TAU;
    this.fox.rig.position.y = 24 + Math.sin(p * PI) * 1.2;
    target.tail.r[1] += Math.sin(this.t * 26) * 0.6;
    target.legRH.r[0] = Math.sin(this.t * 12) * 0.3;
    target.legLF.r[0] = -Math.sin(this.t * 12) * 0.3;
    if (p >= 1) this.fox.root.rotation.y = this.roam.yaw;
  }

  groomPose(target) {
    const t = this.stateT;
    target.head.r[1] = 0.55 + Math.sin(t * 6) * 0.12;
    target.head.r[0] = 0.5 + Math.sin(t * 6) * 0.06;
    target.head.p[1] = 12.5;
    this.tailWag(target, 7, 0.35);
  }

  stretchPose(target) {
    const p = Math.min(1, this.stateT / 0.4);
    const bob = Math.sin(this.stateT * 3) * 0.15;
    target.head.p[1] += bob;
    target.tail.r[1] += Math.sin(this.stateT * 4) * 0.25;
  }

  pouncePose(target) {
    // crouch, then leap forward with a lunge
    if (this.stateT > 0.5) {
      if (!this.didPounce) {
        this.didPounce = true;
        this.jumpV = 13;
        this.rigZ = 0;
      }
      const p = clamp((this.stateT - 0.5) / 0.55, 0, 1);
      this.rigZ = -Math.sin(p * PI) * 2.8;
      target.legRF.r[0] = -0.9;
      target.legLF.r[0] = -0.9;
      target.legRH.r[0] = 0.7;
      target.legLH.r[0] = 0.7;
      target.tail.r[0] -= 0.6;
      target.head.r[0] -= 0.12;
    }
  }

  landPose(target) {
    const p = clamp(this.stateT / 0.45, 0, 1);
    target.body.p[1] += Math.sin(p * PI) * 0.8;
    target.head.p[1] += Math.sin(p * PI) * 0.9;
  }

  dragUpdate(dt) {
    const d = this.drag;
    const target = pose({
      body: { p: [0, 17, -6], r: [PI / 2 + 0.12, 0, d.sway] },
      head: { p: [-1, 15.4, -3], r: [-0.25, d.sway * 0.6, 0] },
      legRF: { r: [-0.55, 0, 0.12] },
      legLF: { r: [-0.55, 0, -0.12] },
      legRH: { r: [0.45, 0, 0.1] },
      legLH: { r: [0.45, 0, -0.1] },
      tail: { r: [-0.45, 0.18, 0] },
    });
    const k = 1 - Math.exp(-dt / 0.1);
    for (const name of Object.keys(this.cur)) {
      const c = this.cur[name];
      const g = target[name];
      for (let i = 0; i < 3; i += 1) {
        c.p[i] = lerp(c.p[i], g.p[i], k);
        c.r[i] = lerp(c.r[i], g.r[i], k);
      }
      c.v = g.v;
    }
    this.fox.applyPose(this.cur);
    this.fox.rig.position.y = 24;
  }

  /** velocity in window px/s, drives the dangling sway */
  setDragVelocity(vx, vy) {
    if (!this.drag) return;
    this.drag.sway = clamp(this.drag.sway * 0.9 + vx * 0.0009, -0.55, 0.55);
  }

  setSleepy() {
    if (this.state === 'stand' && this.t - this.lastInteract > 40) this.activity('sleep');
  }
}

function weightedPick(table) {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [name, w] of table) {
    r -= w;
    if (r <= 0) return name;
  }
  return table[0][0];
}

export { BASE };
