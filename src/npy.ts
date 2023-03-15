import * as kshoot from 'kshoot';

enum NoteColumn {
    EMPTY,
    CHIP,
    HOLD,
    MAX,
}

enum LaserColumn {
    EMPTY,
    STATIONARY,
    MOVING,
    X_VALUE,
    MAX,
}

const NUMPY_HEADER = Buffer.from([0x93, 0x4E, 0x55, 0x4D, 0x50, 0x59, 0x01, 0x00]);

const LASER_BASE_IND = NoteColumn.MAX * 6;
const COLUMN_SIZE = LASER_BASE_IND + LaserColumn.MAX * 2;

export class NumpyChart {
    offset = 0; // Note: always should be non-negative
    resolution = 60;
    timing: Readonly<kshoot.Timing> = new kshoot.Timing(kshoot.kson.schema.BeatInfo.parse({}));
    data: Float32Array = new Float32Array();

    private _length = 0;
    get length(): number { return this._length; }

    private _note_bookkeep: number[] = [0, 0, 0, 0, 0, 0];
    setNoteInterval(ind: number, sub_ind: number, start_ms: number, end_ms: number) {
        const start_find = (start_ms * this.resolution) / 1000;
        let start_ind = Math.round(start_find);
        const end_find = (end_ms * this.resolution) / 1000;
        let end_ind = Math.round(end_find);

        if(start_ind < this._note_bookkeep[ind]) {
            start_ind = this._note_bookkeep[ind];
        }

        if(end_ind <= start_ind) {
            end_ind = start_ind+1;
        }

        const empty_lane = ind*3;
        const fill_lane = empty_lane + sub_ind;

        for(let i=start_ind; i<end_ind; ++i) {
            this.data[COLUMN_SIZE*i + fill_lane] = 1;
            this.data[COLUMN_SIZE*i + empty_lane] = 0;
        }

        this._note_bookkeep[ind] = end_ind;
    }

    getTimeByPulse(pulse: kshoot.Pulse): number {
        return this.offset + this.timing.getTimeByPulse(pulse);
    }

    setChart(chart: kshoot.Chart) {
        const MS_PER_ROW = 1000 / this.resolution;

        this.timing = chart.getTiming();
        const last_note_ms = this.getTimeByPulse(chart.getLastNotePulse());

        this._length = Math.floor((last_note_ms*this.resolution)/1000) + 2;
        this.data = new Float32Array(this._length*COLUMN_SIZE);

        this._note_bookkeep = [0, 0, 0, 0, 0, 0, 0, 0];

        for(let i=0; i<this._length; ++i) {
            for(let j=0; j<6; ++j) {
                this.data[COLUMN_SIZE*i + NoteColumn.MAX*j] = 1.0;
            }
            for(let j=0; j<2; ++j) {
                this.data[COLUMN_SIZE*i + LASER_BASE_IND + LaserColumn.MAX*j] = 1.0;
            }
        }

        // Export notes
        for(const [pulse, notes] of chart.buttonNotes()) {
            const note_start_ms = this.getTimeByPulse(pulse);
            for(const note of notes) {
                if(note.length === 0n) {
                    this.setNoteInterval(note.lane, NoteColumn.CHIP, note_start_ms, note_start_ms);
                } else {
                    let note_end_ms = this.getTimeByPulse(pulse + note.length);
                    if(note_end_ms < note_start_ms + MS_PER_ROW) note_end_ms = note_start_ms + MS_PER_ROW;
                    this.setNoteInterval(note.lane, NoteColumn.HOLD, note_start_ms, note_end_ms);
                }
            }
        }

        // Export lasers
        for(let lane=0; lane<2; ++lane) {
            const column_empty = LASER_BASE_IND + lane*LaserColumn.MAX + LaserColumn.EMPTY;
            const column_stationary = LASER_BASE_IND + lane*LaserColumn.MAX + LaserColumn.STATIONARY;
            const column_moving = LASER_BASE_IND + lane*LaserColumn.MAX + LaserColumn.MOVING;
            const column_x_value = LASER_BASE_IND + lane*LaserColumn.MAX + LaserColumn.X_VALUE;

            let bookkeep = 0;
            for(const [section_pulse, section, section_width] of chart.note.laser[lane]) {
                if(section.size === 0) continue;
                const section_start_ms = this.getTimeByPulse(section_pulse);
                const section_start_ind = Math.round((section_start_ms * this.resolution) / 1000);

                const section_points: kshoot.kson.GraphSectionPoint[] = [...section];
                if(section_points.length === 0) continue;

                const posToFloat = (pos: number): number => section_width*(pos-0.5);
                
                if(bookkeep < section_start_ind) {
                    bookkeep = section_start_ind;
                }

                let prev_inter_column = column_stationary;

                for(let i=0; i<section_points.length; ++i) {
                    const curr_point = section_points[i];
                    const next_point = i+1 === section_points.length ? null : section_points[i+1];
                    const inter_column = next_point && next_point[1][0] !== curr_point[1][1] ? column_moving : column_stationary;

                    if(curr_point[1][0] !== curr_point[1][1]) {
                        this.data[COLUMN_SIZE*bookkeep + column_moving] = 1;
                        this.data[COLUMN_SIZE*bookkeep + column_empty] = 0;
                        this.data[COLUMN_SIZE*bookkeep + column_x_value] = posToFloat(curr_point[1][0]);

                        this.data[COLUMN_SIZE*(bookkeep+1) + inter_column] = 1;
                        this.data[COLUMN_SIZE*(bookkeep+1) + column_empty] = 0;
                        this.data[COLUMN_SIZE*bookkeep + column_x_value] = posToFloat(curr_point[1][1]);
                        bookkeep += 2;
                    }

                    if(!next_point) {
                        if(curr_point[1][0] === curr_point[1][1]) {
                            this.data[COLUMN_SIZE*bookkeep + prev_inter_column] = 1;
                            this.data[COLUMN_SIZE*bookkeep + column_empty] = 1;
                            this.data[COLUMN_SIZE*bookkeep + column_x_value] = posToFloat(curr_point[1][0]);    
                        }
                        break;
                    }

                    const next_ms = this.getTimeByPulse(section_pulse + next_point[0]);
                    let next_ind = Math.round((next_ms * this.resolution) / 1000);
                    if(next_ind <= bookkeep) next_ind = bookkeep + 1;

                    const pos_from = posToFloat(curr_point[1][1]);
                    const pos_to = posToFloat(next_point[1][1]);

                    for(let t=bookkeep; t<next_ind; ++t) {
                        const lerp = t / (next_ind - bookkeep);

                        this.data[COLUMN_SIZE*t + inter_column] = 1;
                        this.data[COLUMN_SIZE*t + column_empty] = 0;
                        this.data[COLUMN_SIZE*bookkeep + column_x_value] = (1-lerp)*pos_from + lerp*pos_to;
                    }

                    bookkeep = next_ind;
                    prev_inter_column = inter_column;
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