declare module 'audio-decode' {
    export default function audioDecode(buf: Buffer): Promise<AudioBuffer>;
}

declare module 'dsp.js' {
    export class FourierTransform {
        bufferSize: number;
        sampleRate: number;
        bandwidth: number;

        spectrum: Float64Array;
        real: Float64Array;
        imag: Float64Array;

        peakBand: number;
        peak: number;

        constructor(bufferSize: number, sampleRate: number);

        getBandFrequency(index: number): number;
        calculateSpectrum(): void;
    }
    export class FFT extends FourierTransform {
        constructor(bufferSize: number, sampleRate: number);
        forward(buffer: Float32Array|number[]): void;
        inverse(real?: Float32Array|number[], image?: Float32Array|number[]): Float32Array;
    }
}