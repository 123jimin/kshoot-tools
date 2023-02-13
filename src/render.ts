import {createCanvas, loadImage, type Canvas, type CanvasRenderingContext2D} from 'canvas';
import { create } from 'domain';
import * as kshoot from 'kshoot';

export interface Params {
    max_columns?: number;
    pulses_per_column?: kshoot.Pulse;
}

export interface PulseRange {
    begin: kshoot.Pulse;
    end: kshoot.Pulse;
}

export class Renderer {
    readonly chart: kshoot.Chart;

    constructor(chart: kshoot.Chart) {
        this.chart = chart;
    }

    renderMeasures(range: PulseRange, ctx: CanvasRenderingContext2D) {

    }

    renderButtons(range: PulseRange, ctx: CanvasRenderingContext2D) {
        for(const [pulse, notes] of this.chart.buttonNotes()) {
            if(pulse >= range.end) break;

            for(const note of notes) {
                if(pulse + note.length < range.begin) continue;

                if(note.lane < 4) {
                    ctx.fillStyle = 'white';
                    if(note.length > 0) {
                        ctx.fillRect(11 + note.lane * 20, Number(range.end - pulse - note.length), 18, Number(note.length))
                    } else {
                        ctx.fillRect(11 + note.lane * 20, Number(range.end - pulse) - 3, 18, 6)
                    }
                } else {
                    ctx.fillStyle = 'orange';
                }
            }

            ctx.fill();
        }
    }

    renderLasers(range: PulseRange, ctx: CanvasRenderingContext2D) {

    }

    renderRange(range: PulseRange): Canvas {
        const canvas = createCanvas(100, Number(range.end - range.begin));
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fill();

        this.renderButtons(range, ctx);

        return canvas;
    }

    async render(params: Params): Promise<Buffer> {
        const canvas = this.renderRange({begin: kshoot.PULSES_PER_WHOLE * 4n, end: kshoot.PULSES_PER_WHOLE * 8n });

        return canvas.toBuffer();
    }
}