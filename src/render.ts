import * as path from 'node:path';
import * as url from 'node:url';

import {createCanvas, registerFont, type Canvas, type CanvasRenderingContext2D} from 'canvas';

import * as kshoot from 'kshoot';

export interface Params {
    max_columns: number;
    pulses_per_column: kshoot.Pulse;
    start: kshoot.Pulse;
}

enum LayerInd {
    FXLong, BTLong, FXShort, Laser, BTShort,
    Measure, Lane,
    MAX,
}

export class Column {
    readonly width: number = 131;
    height = 769;

    readonly chart: kshoot.Chart;
    readonly timing: kshoot.Timing;

    range: kshoot.PulseRange = [0n, 4n * kshoot.PULSES_PER_WHOLE];

    readonly layers: [canvas: Canvas, ctx: CanvasRenderingContext2D][] = [];

    constructor(renderer: Renderer, range?: kshoot.PulseRange) {
        this.chart = renderer.chart;
        this.timing = renderer.timing;

        if(range) {
            this.range = range;
        }

        this.height = Math.ceil(Number(this.range[1]-this.range[0])/5) + 1;

        for(let i: LayerInd = 0; i < LayerInd.MAX; ++i) {
            const canvas = createCanvas(this.width, this.height);
            this.layers.push([canvas, canvas.getContext('2d')]);
        }
        
        this.drawLane();
    }

    reset(new_range: kshoot.PulseRange) {
        const resize_canvas = new_range[1] - new_range[0] !== this.range[1] - this.range[0];

        this.range = new_range;

        if(resize_canvas) {
            this.height = Math.ceil(Number(this.range[1]-this.range[0])/5) + 1;

            for(let i: LayerInd = 0; i < LayerInd.MAX; ++i) {
                const canvas = this.layers[i][0];
                canvas.height = this.height;
            }
            
            this.drawLane();
        }
    }

    drawLane() {
        const ctx = this.layers[LayerInd.Lane][1];
        ctx.clearRect(0, 0, this.width, this.height);

        ctx.beginPath();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(214, 214, 214, 0.5)";
        for(let i=0; i<=4; ++i) {
            ctx.moveTo(45.5 + i*10, 0);
            ctx.lineTo(45.5 + i*10, this.height);
        }
        ctx.stroke();
    }

    drawMeasures(column_index: number) {
        const ctx = this.layers[LayerInd.Measure][1];
        ctx.clearRect(0, 0, this.width, this.height);

        ctx.beginPath();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgb(56, 56, 56)";

        const measure_lines: [kshoot.Pulse, kshoot.MeasureIdx][] = [];
        for(const [pulse, measure] of this.timing.measures(this.range)) {
            measure_lines.push([pulse, measure.idx]);
            if(pulse + measure.length === this.range[1]) measure_lines.push([pulse + measure.length, measure.idx+1n]);

            for(let beat_pulse = measure.beat_length; beat_pulse < measure.length; beat_pulse += measure.beat_length) {
                const y = this.height - Number(pulse + beat_pulse - this.range[0])/5 - 0.5;
                ctx.moveTo(45.5, y);
                ctx.lineTo(84.5, y);
            }
        }

        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = "rgb(255, 255, 0)";
        ctx.fillStyle = 'rgb(255, 255, 255)';

        ctx.font = "bold 10px monospace";
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';

        for(const [pulse, idx] of measure_lines) {
            const y = this.height - Number(pulse - this.range[0])/5 - 0.5;
            ctx.moveTo(45.5, y);
            ctx.lineTo(84.5, y);

            ctx.fillText(`${idx+1n}`, 42, y);
        }
        
        ctx.stroke();

        ctx.fillStyle = 'rgb(0, 255, 0)';
        ctx.textAlign = 'left';

        const start_bpm_pulse = this.timing.bpm_by_pulse.nextLowerKey(this.range[0]) ?? 0n;
        for(const [pulse, bpm_info] of this.timing.bpm_by_pulse.entries(start_bpm_pulse)) {
            const y = this.height - Number((column_index === 0 && pulse < this.range[0] ? this.range[0] : pulse) - this.range[0])/5 - 0.5;
            const bpm = bpm_info.bpm;
            ctx.fillText(`${bpm === Math.floor(bpm) ? bpm.toString() : bpm.toFixed(2)}`, 88, y);
        }
    }
    
    drawButtonNote(pulse: kshoot.Pulse, button: kshoot.ButtonObject) {
        const layer_ind: LayerInd = button.lane < 4 ?
            (button.length === 0n ? LayerInd.BTShort : LayerInd.BTLong) :
            (button.length === 0n ? LayerInd.FXShort : LayerInd.FXLong);
        const ctx = this.layers[layer_ind][1];

        const lane = button.lane;
        const x = 45 + 10*(lane >= 4 ? (lane-4)*2 : lane);
        const y = this.height - Number(pulse - this.range[0])/5 - 1;

        ctx.save();
        ctx.translate(x, y);

        ctx.beginPath();
        if(button.length > 0) {
            const height = Number(button.length) / 5;
            if(lane < 4) {
                ctx.fillStyle = "rgb(201, 216, 237)";
                ctx.fillRect(1, -height, 9, height);
            } else {
                ctx.fillStyle = "rgb(197, 107, 23)";
                ctx.fillRect(1, -height, 19, height);
            }
        } else {
            if(lane < 4) {
                ctx.lineWidth = 1;
                ctx.strokeStyle = "#808080";
                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(1, -3, 9, 3);
                ctx.strokeRect(1.5, -2.5, 8, 2);
            } else {
                ctx.lineWidth = 1;
                ctx.strokeStyle = "rgb(136, 98, 0)";
                ctx.fillStyle = "rgb(244, 129, 28)";
                ctx.fillRect(1, -5, 19, 5);
                ctx.strokeRect(1.5, -4.5, 18, 4);
            }
        }

        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    drawButtonNotes() {
        for(const layer_ind of [LayerInd.FXLong, LayerInd.BTLong, LayerInd.FXShort, LayerInd.BTShort]) {
            this.layers[layer_ind][1].clearRect(0, 0, this.width, this.height);
        }

        for(const [pulse, notes] of this.chart.buttonNotes(this.range)) {
            for(const note of notes) {
                this.drawButtonNote(pulse, note);
            }
        }
    }

    drawLaserNote(pulse: kshoot.Pulse, laser: kshoot.LaserObject) {
        const ctx = this.layers[LayerInd.Laser][1];
        const y = this.height - Number(pulse - this.range[0])/5 - 1;
        const color = ["rgba(0, 143, 180, 0.8)", "rgba(240, 8, 175, 0.8)"][laser.lane];

        const height = Number(laser.length) / 5;
        const is_slam = laser.v[0] !== laser.v[1];
        const is_head = pulse === laser.section_pulse;

        const getPos = (v: number): number => {
            v = v * laser.width - laser.width/2;
            return (v + 0.5) * 50;
        };

        const pos_v0 = getPos(laser.v[0]);
        const pos_v1 = getPos(laser.v[1]);
        const pos_ve = getPos(laser.ve);

        ctx.save();
        ctx.translate(36, y);

        if(is_head) {
            ctx.save();
            ctx.translate(pos_v0, 0);
            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 9, 5);
            ctx.fill();
            ctx.fillStyle = "rgba(255, 255, 255, 1.0)";
            ctx.fillRect(1, 0, 7, 5);
            ctx.fill();
            ctx.restore();
        }

        ctx.beginPath();
        ctx.fillStyle = color;

        let slam_offset = 0;
        if(is_slam) {
            slam_offset = 6;
            
            if(laser.v[0] < laser.v[1]) {
                ctx.moveTo(pos_v1 + 9, -slam_offset);
                ctx.lineTo(pos_v1 + 9, 0);
                ctx.lineTo(pos_v0, 0);
                ctx.lineTo(pos_v0, -slam_offset);
                ctx.lineTo(pos_v1, -slam_offset);
            } else {
                ctx.moveTo(pos_v1 + 9, -slam_offset);
                ctx.lineTo(pos_v0 + 9, -slam_offset);
                ctx.lineTo(pos_v0 + 9, 0);
                ctx.lineTo(pos_v1, 0);
                ctx.lineTo(pos_v1, -slam_offset);
            }
        } else {
            ctx.moveTo(pos_v1, 0);
        }

        
        if(height === 0) {
            ctx.lineTo(pos_v1, -slam_offset-4);
            ctx.lineTo(pos_v1 + 9, -slam_offset-4);
            ctx.lineTo(pos_v1 + 9, -slam_offset);
        } else {
            ctx.lineTo(pos_ve, -height);
            ctx.lineTo(pos_ve + 9, -height);
            ctx.lineTo(pos_v1 + 9, -slam_offset);
        }

        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    drawLaserNotes() {
        const ctx = this.layers[LayerInd.Laser][1];
        ctx.clearRect(0, 0, this.width, this.height);
        ctx.globalCompositeOperation = 'screen';
        
        for(const [pulse, lasers] of this.chart.laserNotes(this.range)) {
            for(const laser of lasers) {
                this.drawLaserNote(pulse, laser);
            }
        }
    }

    render(column_index: number, target: CanvasRenderingContext2D, x: number, y: number) {
        this.drawMeasures(column_index);
        this.drawButtonNotes();
        this.drawLaserNotes();

        for(let i: LayerInd = 0; i < LayerInd.MAX; ++i) {
            switch(i) {
                case LayerInd.Measure:
                case LayerInd.Laser:
                    target.globalCompositeOperation = 'screen';
                    break;
                default:
                    target.globalCompositeOperation = 'source-over';
            }
            target.drawImage(this.layers[i][0], x, y);
        }
    }
}

export class Renderer {
    readonly chart: kshoot.Chart;
    readonly timing: kshoot.Timing;

    constructor(args: {chart: kshoot.Chart, timing?: kshoot.Timing}) {
        this.chart = args.chart;
        this.timing = args.timing ?? this.chart.getTiming();
    }

    chooseStart(columns: number, pulses_per_column: kshoot.Pulse): kshoot.Pulse {
        const visible_pulses: kshoot.Pulse = pulses_per_column * BigInt(columns);
        const [chart_begin, chart_end] = [this.chart.getFirstNotePulse(), this.chart.getLastNotePulse()];

        // Show the entire chart if possible
        const chart_begin_measure = this.timing.getMeasureInfoByPulse(chart_begin);
        if(chart_end <= visible_pulses) return 0n;
        if(chart_end <= chart_begin_measure.pulse + visible_pulses) return chart_begin_measure.pulse;

        const stat = kshoot.tools.stat.getButtonOnlyStat(this.chart, this.timing);
        const [highlight_begin, highlight_end] = stat.peak_note_density_range;
        
        // Put the highlight in a later part of the visible chart
        let init_candidate = (highlight_begin + highlight_end) / 2n - visible_pulses / 2n;
        if(visible_pulses > highlight_end - highlight_begin) init_candidate -= (visible_pulses - (highlight_end - highlight_begin))/3n;
        let candidate = this.timing.getMeasureInfoByPulse(init_candidate >= 0n ? init_candidate : 0n);

        if(candidate.pulse <= chart_begin && chart_end <= candidate.pulse + visible_pulses) {
            return candidate.pulse;
        }

        while(candidate.pulse > 0n && candidate.pulse + visible_pulses > chart_end) {
            const prev_candidate = this.timing.getMeasureInfoByIdx(candidate.idx - 1n);
            if(prev_candidate.pulse + visible_pulses <= chart_end) break;
            candidate = prev_candidate;
        }

        while(candidate.pulse < chart_begin) {
            const next_candidate = this.timing.getMeasureInfoByIdx(candidate.idx + 1n);
            if(chart_begin < next_candidate.pulse) break;
            candidate = next_candidate;
        }

        return candidate.pulse;
    }

    renderButton(ctx: CanvasRenderingContext2D, length: number) {
        if(length === 0) {
            ctx.beginPath();
            ctx.fillRect(0, -3, 9, 3);
            ctx.strokeRect(0, -3, 9, 3);

            ctx.fill(); ctx.stroke();
            return;
        }
    }

    async render(params: Partial<Params>): Promise<Buffer> {
        const max_columns = params.max_columns ?? 9;
        const pulses_per_column = params.pulses_per_column ?? kshoot.PULSES_PER_WHOLE * 4n;

        if(params.start == null) {
            params.start = this.chooseStart(max_columns, pulses_per_column);
        }

        const canvas = createCanvas(max_columns*131, Math.ceil(Number(pulses_per_column)/5) + 20);
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fill();

        const column = new Column(this);

        const offset = params.start ?? 0n;
        for(let i=0; i<max_columns; ++i) {
            const tick_begin = offset + BigInt(i) * pulses_per_column;
            const tick_end = tick_begin + pulses_per_column;
            column.reset([tick_begin, tick_end]);

            column.render(i, ctx, i*column.width, 12);
        }

        return canvas.toBuffer();
    }
}

const RES_DIR = url.fileURLToPath(new URL("../res/", import.meta.url));

registerFont(path.join(RES_DIR, "Concert_One/ConcertOne-Regular.ttf"), {family: "ConcertOne", style: 'regular'});