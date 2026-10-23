/**
 * @file web/recorder-worklet.js
 * @summary AudioWorkletProcessor that forwards raw mono input samples (channel 0) to the main thread in ~85 ms chunks.
 */
class RecorderProcessor extends AudioWorkletProcessor {
  /** Creates the processor with an internal 4096-sample batch buffer. */
  constructor() {
    super();
    this.buf = new Float32Array(4096);
    this.n = 0;
  }
  /**
   * Copies input channel 0 into the batch buffer and posts full batches.
   * @param {Float32Array[][]} inputs Input buses.
   * @returns {boolean} true to stay alive.
   */
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) {
          this.port.postMessage(this.buf.slice(0));
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("recorder", RecorderProcessor);
