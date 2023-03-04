import decodeAudio from 'audio-decode';
import {FFT} from 'dsp.js';
import * as kshoot from 'kshoot';

import type {LoadedKShootChartContext} from "./index";

const COMPUTE_SAMPLE_RATE = 1000;
const BUFFER_SIZE = (1 << 15);
const BUFFER_SEC = BUFFER_SIZE / COMPUTE_SAMPLE_RATE;

function getChartEnergyMap(chart: kshoot.Chart): Map<kshoot.Pulse, number> {
    const energy_map: Map<kshoot.Pulse, number> = new Map();

    for(const [pulse, notes] of chart.buttonNotes()) {
        energy_map.set(pulse, notes.length);
    }

    for(const [pulse, conducts] of chart.laserConducts()) {
        energy_map.set(pulse, (energy_map.get(pulse) ?? 0) + 0.5 * conducts.filter((conduct) => conduct.action !== kshoot.LaserConductAction.End).length);
    }

    return energy_map;
}

function getMusicEnergy(audio_buffer: AudioBuffer, offset: number): Float32Array|null {
    if(audio_buffer.numberOfChannels === 0) return null;

    const channel_data_x = audio_buffer.getChannelData(0);
    const channel_data_y = audio_buffer.getChannelData(audio_buffer.numberOfChannels < 2 ? 0 : 1);
    const data_len = Math.min(channel_data_x.length, channel_data_y.length);
    
    const ind_begin = Math.ceil(offset * audio_buffer.sampleRate / COMPUTE_SAMPLE_RATE);
    const ind_end = Math.min(data_len, Math.floor((offset + BUFFER_SIZE) * audio_buffer.sampleRate / COMPUTE_SAMPLE_RATE));

    if(ind_begin >= ind_end) {
        return null;
    }

    const energy_buffer = new Float32Array(BUFFER_SIZE*2);

    let [pd_l, pd_r] = [0, 0];
    let [pv_l, pv_r] = [0, 0];
    let [pe_l, pe_r] = [0, 0];

    for(let i=ind_begin; i<ind_end; ++i) {
        const [d_l, d_r]: [number, number] = [channel_data_x[i] ?? 0, channel_data_y[i] ?? 0];

        let [v_l, v_r] = [0, 0];
        if(i > 0) [v_l, v_r] = [d_l - pd_l, d_r - pd_r];

        let [a_l, a_r] = [0, 0];
        if(i > 1) [a_l, a_r] = [v_l - pv_l, v_r - pv_r];

        // Assume that a mass at d_x is attached with a spring.
        // K.E = 1/2 k x^2
        // P.E = 1/2 m v^2 
        // Additionally, at the previous step, it is is assumed that the mass got no external force.
        // ma = -kx, k = -(ma/x)
        // K.E + P.E = 1/2 m (v^2 - ax) 
        let [e_l, e_r] = [v_l**2 - a_l*d_l, v_r**2 - a_r*d_r];
        if(e_l < 0) e_l = 0; if(e_r < 0) e_r = 0;

        const [de_l, de_r] = [e_l - pe_l, e_r - pe_r];
        const e = ((de_l < 0 ? 0 : de_l) + (de_r < 0 ? 0 : de_r)) / 2;
        
        const buffer_ind_r = i * COMPUTE_SAMPLE_RATE / audio_buffer.sampleRate;
        const buffer_ind_f = buffer_ind_r % 1.0;
        const buffer_ind = Math.floor(buffer_ind_r) - offset;

        if(0 <= buffer_ind && buffer_ind < BUFFER_SIZE) {
            energy_buffer[buffer_ind] += e * (1.0 - buffer_ind_f);
            if(buffer_ind+1 < BUFFER_SIZE) {
                energy_buffer[buffer_ind+1] += e * buffer_ind_f;
            }
        }

        [pd_l, pd_r, pv_l, pv_r, pe_l, pe_r] = [d_l, d_r, v_l, v_r, e_l, e_r];
    }

    let prev_energy = energy_buffer[0];
    for(let i=1; i<BUFFER_SIZE; ++i) {
        const curr_ernrgy = energy_buffer[i];
        const alpha = 0.98; // Half-life: -log(2)/log(alpha) ~= 34ms
        prev_energy *= alpha;
        if(curr_ernrgy < prev_energy) {
            energy_buffer[i] = 0; continue;
        } else {
            energy_buffer[i] -= prev_energy;
            prev_energy = curr_ernrgy;
        }
    }

    return energy_buffer;
}

const FFT_BUFFER = {
    X: new FFT(BUFFER_SIZE*2, COMPUTE_SAMPLE_RATE),
    Y: new FFT(BUFFER_SIZE*2, COMPUTE_SAMPLE_RATE),
} as const;

function getCrossCorrelation(x: Float32Array, y: Float32Array): Float32Array {
    FFT_BUFFER.X.forward(x);
    FFT_BUFFER.Y.forward(y);

    for(let i=0; i<BUFFER_SIZE; ++i) {
        const x_r = FFT_BUFFER.X.real[i];
        const x_i = -FFT_BUFFER.X.imag[i];
        const y_r = FFT_BUFFER.Y.real[i];
        const y_i = FFT_BUFFER.Y.imag[i];

        FFT_BUFFER.X.real[i] = x_r * y_r - x_i * y_i;
        FFT_BUFFER.X.imag[i] = x_r * y_i + x_i * y_r;
    }

    return FFT_BUFFER.X.inverse();
}

export class OffsetComputer {
    readonly chart_ctx: LoadedKShootChartContext;
    readonly chart: kshoot.Chart;
    readonly timing: kshoot.Timing;
   
    constructor(chart_ctx: LoadedKShootChartContext) {
        this.chart_ctx = chart_ctx;
        this.chart = chart_ctx.chart;
        this.timing = chart_ctx.timing ?? this.chart.getTiming();
    }

    getTimeByPulse(pulse: kshoot.Pulse): number {
        return this.timing.getTimeByPulse(pulse);
    }
    
    private _chart_energy_map: Map<kshoot.Pulse, number>|null = null;
    get chart_energy_map(): Map<kshoot.Pulse, number> {
        if(this._chart_energy_map) return this.chart_energy_map;
        else return (this._chart_energy_map = getChartEnergyMap(this.chart));
    }

    private _getChartEnergy(): [offset: number, chart_energy: Float32Array] {
        const energy_map = this.chart_energy_map;
        if(energy_map.size === 0) {
            return [0, new Float32Array()];
        }

        const times: [pulse: kshoot.Pulse, sec: number][] = [...energy_map.keys()]
            .sort((x, y) => x === y ? 0 : x < y ? -1 : +1)
            .map((pulse) => [pulse, (this.chart.audio.bgm.offset + this.timing.getTimeByPulse(pulse))/1000]);

        let max_begin_ind = 0;
        let max_energy = 0;

        let range_begin_ind = 0;
        let curr_energy = 0;

        while(range_begin_ind < times.length && times[range_begin_ind][1] < 0) ++range_begin_ind;
    
        for(let range_end_ind = range_begin_ind; range_end_ind < times.length; ++range_end_ind) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const end_energy = energy_map.get(times[range_end_ind][0])!;
            const range_end_sec = times[range_end_ind][1];

            curr_energy += end_energy;

            while(range_begin_ind < range_end_ind) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const begin_energy = energy_map.get(times[range_begin_ind][0])!;
                const range_begin_sec = times[range_begin_ind][1];

                if(range_end_sec < range_begin_sec + BUFFER_SEC) {
                    break;
                }

                curr_energy -= begin_energy;
                ++range_begin_ind;
            }

            if(curr_energy > max_energy) {
                max_energy = curr_energy;
                max_begin_ind = range_begin_ind;
            }
        }

        if(max_energy <= 0) {
            return [0, new Float32Array()];
        }

        const energy_buffer = new Float32Array(BUFFER_SIZE*2);
        const sample_offset = Math.floor(times[max_begin_ind][1] * COMPUTE_SAMPLE_RATE);

        for(let i = max_begin_ind; i < times.length; ++i) {
            const buffer_ind_r = times[i][1] * COMPUTE_SAMPLE_RATE;
            const buffer_ind_f = buffer_ind_r % 1.0;
            const buffer_ind = Math.floor(buffer_ind_r) - sample_offset;
            if(buffer_ind >= BUFFER_SIZE) break;

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const energy = energy_map.get(times[i][0])!;
            energy_buffer[buffer_ind] += energy * (1.0 - buffer_ind_f);
            if(buffer_ind+1 < BUFFER_SIZE) {
                energy_buffer[buffer_ind+1] += energy * buffer_ind_f;
            }
        }

        return [sample_offset, energy_buffer];
    }

    private _music_audio_buffer: AudioBuffer|null = null;
    private async _getMusicAudioBuffer(in_audio_file_buffer?: Buffer): Promise<AudioBuffer|null> {
        const bgm_filename = this.chart.audio.bgm.filename;

        let audio_file_buffer: Buffer|null = null;
        
        if(in_audio_file_buffer) {
            audio_file_buffer = in_audio_file_buffer;
        } else if(bgm_filename) {
            audio_file_buffer = await this.chart_ctx.resolve(bgm_filename);
        }

        if(audio_file_buffer == null) return null;

        try {
            return await decodeAudio(audio_file_buffer);
        } catch(e) {
            return null;
        }
    }

    computeCrossCorrelation(audio_file_buffer?: Buffer): Promise<Float32Array|null>;
    computeCrossCorrelation(audio_buffer?: AudioBuffer): Promise<Float32Array|null>;
    computeCrossCorrelation(audio?: Buffer|AudioBuffer): Promise<Float32Array|null>;
    async computeCrossCorrelation(in_audio_file_buffer?: Buffer|AudioBuffer): Promise<Float32Array|null> {
        const [offset, chart_energy] = this._getChartEnergy();
        if(chart_energy.length === 0) return null;

        const audio_buffer: AudioBuffer|null =
            (in_audio_file_buffer == null ||in_audio_file_buffer instanceof Buffer) ? await this._getMusicAudioBuffer(in_audio_file_buffer) : in_audio_file_buffer;
        if(audio_buffer == null) return null;
        
        const music_energy = getMusicEnergy(audio_buffer, offset);
        if(music_energy == null) return null;

        const correlation = getCrossCorrelation(chart_energy, music_energy);

        return correlation;
    }

    computeOffset(audio_file_buffer?: Buffer): Promise<number|null>;
    computeOffset(audio_buffer?: AudioBuffer): Promise<number|null>;
    async computeOffset(in_audio_file_buffer?: Buffer|AudioBuffer): Promise<number|null> {
        const correlation = await this.computeCrossCorrelation(in_audio_file_buffer);
        if(correlation == null) {
            return null;
        }

        /*
        {
            const {createCanvas} = await import('canvas');
            const canvas = createCanvas(1000, 400);
            const ctx = canvas.getContext('2d');

            ctx.beginPath();
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fill();

            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#0F0";
            ctx.moveTo(0, 400);

            for(let i=0; i<canvas.width; ++i) {
                ctx.lineTo(i, 400 - 5 * (correlation.at(i - canvas.width/2) ?? 0));
            }

            ctx.stroke();
            
            ctx.beginPath();
            ctx.lineWidth = 1;
            ctx.strokeStyle = "#FF0";
            ctx.moveTo(canvas.width/2, 0);
            ctx.lineTo(canvas.width/2, canvas.height);
            ctx.stroke();

            await (await import('node:fs/promises')).writeFile("test.png", canvas.toBuffer());
        }
        */

        let max_dt = 0;
        let max_correlation = 0;

        for(let dt=-500; dt<=500; ++dt) {
            const curr_correlation = (correlation.at(dt) ?? 0) * (2500 / (2500 + dt**2));
            if(curr_correlation > max_correlation) {
                [max_dt, max_correlation] = [dt, curr_correlation];
            }
        }

        return this.chart.audio.bgm.offset + max_dt;
    }
}

export async function computeOffset(chart_ctx: LoadedKShootChartContext): Promise<number|null> {
    return await (new OffsetComputer(chart_ctx)).computeOffset();
}