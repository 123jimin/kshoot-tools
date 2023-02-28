import * as kshoot from 'kshoot';

const NUMPY_HEADER = Buffer.from([0x93, 0x4E, 0x55, 0x4D, 0x50, 0x59, 0x01, 0x00]);
const COLUMN_SIZE = 10;

export class NumpyChart {
    offset = 0; // Note: always should be non-negative
    resolution = 60;
    timing: Readonly<kshoot.Timing> = new kshoot.Timing(kshoot.kson.schema.BeatInfo.parse({}));
    data: Float32Array = new Float32Array();

    private _length = 0;
    get length(): number { return this._length; }

    setInterval(ind: number, start_ms: number, end_ms: number) {
        const start_find = (start_ms * this.resolution) / 1000;
        const start_ind = Math.floor(start_find);
        const end_find = (end_ms * this.resolution) / 1000;
        const end_ind = Math.floor(end_find);

        for(let i=start_ind; i<=end_ind; ++i) {
            let value = 1.0;
            if(start_ind !== end_ind) {
                if(i === start_ind) {
                    value = 1.0 - (start_find % 1.0);
                } else if(i === end_ind) {
                    value = end_find % 1.0;
                }
            }
            this.data[COLUMN_SIZE*i + ind] = value;
        }
    }

    getTimeByPulse(pulse: kshoot.Pulse): number {
        return this.offset + this.timing.getTimeByPulse(pulse);
    }

    setChart(chart: kshoot.Chart) {
        this.timing = chart.getTiming();
        const last_note_ms = this.getTimeByPulse(chart.getLastNotePulse());

        this._length = Math.floor((last_note_ms*this.resolution)/1000) + 2;
        this.data = new Float32Array(this._length*COLUMN_SIZE);

        // Export notes
        for(const [pulse, notes] of chart.buttonNotes()) {
            const note_start_ms = this.getTimeByPulse(pulse);
            for(const note of notes) {
                let note_end_ms = note.length === 0n ? note_start_ms : this.getTimeByPulse(pulse + note.length);
                if(note_end_ms < note_start_ms + 1000 / this.resolution) note_end_ms = note_start_ms + 1000 / this.resolution;
                this.setInterval(note.lane, note_start_ms, note_end_ms);
            }
        }

        // Export lasers
        for(let lane=0; lane<2; ++lane) {
            const section_ind = 6 + lane*2;
            const value_ind = 7 + lane*2;
            for(const [section_pulse, section, section_width] of chart.note.laser[lane]) {
                if(section.size === 0) continue;
                const section_start_ms = this.getTimeByPulse(section_pulse);
                const section_start_ind = Math.floor((section_start_ms * this.resolution) / 1000);

                const last_entry = section.nextLowerPair(void 0);
                if(last_entry == null) continue;

                const posToFloat = (pos: number): number => 2*section_width*(pos-0.5);

                const [pulse_len, last_data] = last_entry;
                let section_end_ms = this.getTimeByPulse(section_pulse + pulse_len);
                if(last_data[0][0] !== last_data[0][1]) {
                    section_end_ms += 1000 / this.resolution;
                }
                const section_end_ind = Math.floor((section_end_ms * this.resolution) / 1000);

                this.setInterval(section_ind, section_start_ms, section_end_ms);
                const it = section[Symbol.iterator]();
                let [curr_pulse, curr_point]: [kshoot.Pulse, kshoot.kson.GraphValue] = it.next().value;
                let next_entry: [kshoot.Pulse, kshoot.kson.GraphValue]|null = it.next().value;

                let curr_ms = this.getTimeByPulse(section_pulse+curr_pulse);
                let next_ms = next_entry == null ? null : this.getTimeByPulse(section_pulse+next_entry[0]);

                for(let i=section_start_ind; i<=section_end_ind; ++i) {
                    const ms = (i * 1000) / this.resolution;
                    if(ms < curr_ms) {
                        this.data[COLUMN_SIZE*i + value_ind] = posToFloat(curr_point[0]);
                        continue;
                    }

                    while(next_entry != null && next_ms != null && next_ms <= ms) {
                        [curr_pulse, curr_point] = next_entry;
                        curr_ms = next_ms;

                        next_entry = it.next().value;
                        next_ms = next_entry == null ? null : this.getTimeByPulse(section_pulse+next_entry[0]);
                    }
                    
                    if(next_entry == null || next_ms == null) {
                        this.data[COLUMN_SIZE*i + value_ind] = posToFloat(curr_point[1]);
                    } else {
                        let lerp_t = (ms - curr_ms) / (next_ms - curr_ms);
                        if(lerp_t < 0) lerp_t = 0;
                        else if(lerp_t > 1) lerp_t = 1;
                        const lerp_value = curr_point[1] + (next_entry[1][0] - curr_point[1]) * lerp_t;
                        this.data[COLUMN_SIZE*i + value_ind] = posToFloat(lerp_value);
                    }
                }
            }
        }
    }

    export(): Buffer {
        const header_str = `{'descr':'<f4','fortran_order':False,'shape':(${this.length},${COLUMN_SIZE})}`;

        const header_buffer = Buffer.alloc(NUMPY_HEADER.length + 2 + header_str.length);
        NUMPY_HEADER.copy(header_buffer);
        
        header_buffer.writeUInt16LE(header_str.length, NUMPY_HEADER.length);
        header_buffer.write(header_str, NUMPY_HEADER.length + 2, 'ascii');

        return Buffer.concat([header_buffer, new Uint8Array(this.data.buffer)]);
    }
}

export function fromChart(chart: kshoot.Chart): NumpyChart {
    const seq = new NumpyChart();
    seq.setChart(chart);

    return seq;
}