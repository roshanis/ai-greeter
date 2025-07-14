/**
 * A simple AudioWorkletProcessor to capture raw PCM data from the microphone.
 */
class RecorderProcessor extends AudioWorkletProcessor {
  // The process method is called for every block of audio data.
  process(inputs, outputs, parameters) {
    // We only care about the first input channel.
    const input = inputs[0];
    
    // If there is audio data in the input channel...
    if (input && input.length > 0 && input[0].length > 0) {
      // The audio data is a Float32Array with values from -1.0 to 1.0.
      // We need to convert it to 16-bit PCM for the OpenAI API.
      const pcmData = input[0];
      const buffer = new Int16Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        // Clamp the value just in case, then scale to 16-bit range.
        const s = Math.max(-1, Math.min(1, pcmData[i]));
        buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      // Post the raw Int16Array buffer back to the main thread.
      // The second argument is a list of transferable objects.
      this.port.postMessage(buffer, [buffer.buffer]);
    }
    
    // Return true to keep the processor alive.
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor); 