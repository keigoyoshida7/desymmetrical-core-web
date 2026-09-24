import test from 'node:test';
import assert from 'node:assert/strict';
import { ShadowAudio } from '../audio.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class MockEvents extends EventTarget {
  emit(name) {
    const event = new Event(name);
    this.dispatchEvent(event);
    this[`on${name}`]?.(event);
  }
}

class MockNode extends MockEvents {
  constructor() {
    super();
    this.connections = [];
    this.gain = this.frequency = this.Q = this.delayTime = {
      value: 0, setTargetAtTime() {},
    };
  }
  connect(...destination) { this.connections.push(destination); return destination[0]; }
  disconnect() { this.connections = []; }
}

// Install browser APIs only for this test, and restore Node's original descriptors.
function environment(t, { plans = [], sessionMode = 'supported' } = {}) {
  const originals = new Map(['AudioContext', 'AudioWorkletNode', 'navigator'].map(
    key => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
  ));
  const contexts = [], nodes = [], instances = [], sessionWrites = [];
  let sessionType = 'ambient';
  const session = {
    get type() { return sessionType; },
    set type(value) {
      if (sessionMode === 'throw-set') throw new Error('AudioSession unsupported');
      sessionType = value;
      sessionWrites.push(value);
    },
  };
  const navigator = {};
  if (sessionMode !== 'absent') Object.defineProperty(navigator, 'audioSession', {
    get() {
      if (sessionMode === 'throw-get') throw new Error('AudioSession inaccessible');
      return session;
    },
  });

  class MockAudioContext extends MockEvents {
    constructor() {
      super();
      this.plan = plans[contexts.length] || {};
      this.state = 'suspended';
      this.resumeCalls = 0;
      this.closeCalls = 0;
      this.sampleRate = 8000;
      this.currentTime = 0;
      this.destination = Object.assign(new MockNode(), { maxChannelCount: this.plan.maxChannels ?? 18 });
      this.moduleStarted = deferred();
      this.audioWorklet = {
        addModule: () => {
          this.moduleStarted.resolve();
          return this.plan.moduleGate?.promise
            || (this.plan.moduleError ? Promise.reject(this.plan.moduleError) : Promise.resolve());
        },
      };
      contexts.push(this);
    }
    changeState(state) { this.state = state; this.emit('statechange'); }
    async resume() {
      this.resumeCalls++;
      if (this.plan.resumeGate) await this.plan.resumeGate.promise;
      if (this.plan.resumeError) throw this.plan.resumeError;
      this.changeState(this.plan.resumedState || 'running');
    }
    async close() { this.closeCalls++; this.changeState('closed'); }
    createBuffer(channels, length) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: channel => data[channel] };
    }
    createConvolver() { return new MockNode(); }
    createChannelSplitter() { return new MockNode(); }
    createChannelMerger() { return new MockNode(); }
    createGain() { return new MockNode(); }
    createDelay() { return new MockNode(); }
    createWaveShaper() { return new MockNode(); }
    createBiquadFilter() { return new MockNode(); }
  }

  class MockAudioWorkletNode extends MockNode {
    constructor(context) {
      super();
      this.context = context;
      this.messages = [];
      this.port = { postMessage: value => this.messages.push(value), close() {} };
      nodes.push(this);
    }
  }

  for (const [key, value] of Object.entries({ AudioContext: MockAudioContext, AudioWorkletNode: MockAudioWorkletNode, navigator })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.after(async () => {
    try { await Promise.all(instances.map(audio => audio.stop())); }
    finally {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  });
  return {
    contexts, nodes, session, sessionWrites,
    create() { const audio = new ShadowAudio(); instances.push(audio); return audio; },
  };
}

test('a tap constructs and resumes audio immediately, and playback session is restored on stop', { timeout: 2000 }, async t => {
  const resumeGate = deferred();
  const env = environment(t, { plans: [{ resumeGate }] });
  const audio = env.create(), states = [];
  audio.onstatechange = () => states.push(audio.state);
  assert.equal(audio.state, 'stopped');
  const starting = audio.start();
  assert.equal(env.contexts.length, 1, 'AudioContext exists before start yields');
  assert.equal(env.contexts[0].resumeCalls, 1, 'resume is invoked within the original tap');
  assert.equal(audio.state, 'starting');
  assert.equal(env.session.type, 'playback');
  resumeGate.resolve();
  await starting;
  assert.equal(audio.state, 'running');
  assert.ok(audio.node);
  assert.equal(audio.error, '');
  assert.ok(states.includes('running'), 'UI is notified when playback is ready');
  await audio.stop();
  assert.equal(audio.state, 'stopped');
  assert.equal(audio.context, null);
  assert.equal(audio.node, null);
  assert.equal(env.session.type, 'ambient');
  assert.equal(env.contexts[0].state, 'closed');
});

for (const sessionMode of ['absent', 'throw-get', 'throw-set']) {
  test(`ordinary playback works when AudioSession is ${sessionMode}`, { timeout: 2000 }, async t => {
    const env = environment(t, { sessionMode });
    const audio = env.create();
    await audio.start();
    assert.equal(audio.state, 'running');
    assert.ok(audio.node);
    await audio.stop();
    assert.equal(audio.state, 'stopped');
  });
}

test('a failed worklet load releases the session and exposes an error, then permits restart', { timeout: 2000 }, async t => {
  const env = environment(t, { plans: [{ moduleError: new Error('Worklet load failed') }, {}] });
  const audio = env.create();
  await assert.rejects(audio.start(), /Worklet load failed/);
  assert.equal(audio.state, 'error');
  assert.match(audio.error, /Worklet load failed/);
  assert.equal(audio.context, null);
  assert.equal(audio.node, null);
  assert.equal(env.contexts[0].state, 'closed');
  assert.equal(env.session.type, 'ambient');
  await audio.start();
  assert.equal(audio.state, 'running');
  assert.equal(audio.error, '');
  assert.equal(env.session.type, 'playback');
});

test('unsupported discrete output fails cleanly without retaining its playback session', { timeout: 2000 }, async t => {
  const env = environment(t, { plans: [{ maxChannels: 2 }] });
  const audio = env.create();
  await assert.rejects(audio.start('discrete'));
  assert.equal(audio.state, 'error');
  assert.ok(audio.error.length > 0);
  assert.equal(audio.node, null);
  assert.equal(env.contexts[0].state, 'closed');
  assert.equal(env.session.type, 'ambient');
});

for (const outcome of ['resolve', 'reject']) {
  test(`a cancelled start that later ${outcome}s cannot clear its replacement`, { timeout: 2000 }, async t => {
    const moduleGate = deferred();
    const env = environment(t, { plans: [{ moduleGate }, {}] });
    const audio = env.create();
    // Attach rejection handling before cancelling, so cancellation is never unhandled.
    const firstResult = audio.start().then(() => null, error => error);
    const oldContext = env.contexts[0];
    await oldContext.moduleStarted.promise;
    await audio.stop();
    await audio.start();
    const replacementContext = audio.context, replacementNode = audio.node;
    assert.notEqual(replacementContext, oldContext);
    moduleGate[outcome](outcome === 'reject' ? new Error('Obsolete worklet failed') : undefined);
    assert.ok(await firstResult instanceof Error, 'cancelled start reports a failure');
    assert.equal(audio.context, replacementContext);
    assert.equal(audio.node, replacementNode);
    assert.equal(audio.state, 'running');
    assert.equal(audio.error, '', 'stale rejection does not replace current status');
    assert.equal(env.session.type, 'playback', 'stale cleanup does not restore the old session');
    assert.equal(oldContext.state, 'closed');
    audio.update([], []);
    assert.equal(replacementNode.messages.at(-1).type, 'state');
  });
}

test('resume reuses a suspended or interrupted context and its existing graph', { timeout: 2000 }, async t => {
  const env = environment(t);
  const audio = env.create(), states = [];
  audio.onstatechange = () => states.push(audio.state);
  await audio.start();
  const context = audio.context, node = audio.node;
  for (const state of ['suspended', 'interrupted']) {
    context.changeState(state);
    assert.equal(audio.state, state);
    assert.ok(states.includes(state));
    const previousCalls = context.resumeCalls;
    const resuming = audio.resume();
    assert.equal(context.resumeCalls, previousCalls + 1, 'resume uses the tap without a prior await');
    await resuming;
    assert.equal(audio.state, 'running');
    assert.equal(audio.context, context);
    assert.equal(audio.node, node);
    assert.equal(env.contexts.length, 1);
  }
});

test('a failed resume releases the playback session and allows a fresh retry', { timeout: 2000 }, async t => {
  const env = environment(t);
  const audio = env.create();
  await audio.start();
  const previousContext = audio.context;
  previousContext.changeState('interrupted');
  previousContext.plan.resumeError = new Error('Resume blocked');
  await assert.rejects(audio.resume(), /Resume blocked/);
  assert.equal(audio.state, 'error');
  assert.match(audio.error, /Resume blocked/);
  assert.equal(env.session.type, 'ambient');
  await audio.start();
  assert.equal(audio.state, 'running');
  assert.equal(audio.error, '');
  assert.notEqual(audio.context, previousContext);
  assert.equal(env.session.type, 'playback');
});

test('processor failure exposes error state and can be restarted with a fresh graph', { timeout: 2000 }, async t => {
  const env = environment(t);
  const audio = env.create(), states = [];
  audio.onstatechange = () => states.push(audio.state);
  await audio.start();
  const failedNode = audio.node;
  failedNode.emit('processorerror');
  assert.equal(audio.state, 'error');
  assert.ok(audio.error.length > 0);
  assert.ok(states.includes('error'));
  assert.equal(env.session.type, 'ambient', 'a failed processor releases the playback session');
  await audio.start();
  assert.equal(audio.state, 'running');
  assert.equal(audio.error, '');
  assert.notEqual(audio.node, failedNode);
  assert.equal(env.contexts.length, 2);
});
