import {createCanvas, loadImage, type Canvas, type CanvasRenderingContext2D} from 'canvas';

import * as kshoot from 'kshoot';

export interface Params {
    max_columns?: number;
    pulses_per_column?: kshoot.Pulse;
}

export class Renderer {
    readonly chart: kshoot.Chart;

    constructor(chart: kshoot.Chart) {
        this.chart = chart;
    }

    renderBackground(range: kshoot.PulseRange, ctx: CanvasRenderingContext2D) {

    }

    renderButtons(range: kshoot.PulseRange, ctx: CanvasRenderingContext2D) {
        for(const [pulse, notes] of this.chart.buttonNotes(range)) {
            for(const note of notes) {
                if(note.lane < 4) {
                    ctx.fillStyle = 'white';
                    if(note.length > 0) {
                        ctx.fillRect(11 + note.lane * 20, Number(range[1] - pulse - note.length), 18, Number(note.length))
                    } else {
                        ctx.fillRect(11 + note.lane * 20, Number(range[1] - pulse) - 3, 18, 6)
                    }
                } else {
                    ctx.fillStyle = 'orange';
                }
            }

            ctx.fill();
        }
    }

    renderLasers(range: kshoot.PulseRange, ctx: CanvasRenderingContext2D) {

    }

    renderRange(range: kshoot.PulseRange): Canvas {
        const canvas = createCanvas(100, Number(range[1] - range[0]));
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fill();

        this.renderBackground(range, ctx);
        this.renderButtons(range, ctx);
        this.renderLasers(range, ctx);

        return canvas;
    }

    async render(params: Params): Promise<Buffer> {
        const canvas = this.renderRange([kshoot.PULSES_PER_WHOLE * 4n, kshoot.PULSES_PER_WHOLE * 8n]);

        return canvas.toBuffer();
    }
}