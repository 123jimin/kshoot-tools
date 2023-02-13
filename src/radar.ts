import {createCanvas, loadImage, type Canvas, type CanvasRenderingContext2D} from 'canvas';

import * as kshoot from 'kshoot';

export interface Shape {
    width: number;
    height: number;
}

export interface Params {
}

export class Radar {
    readonly chart: kshoot.Chart;
    readonly shape: Shape;

    constructor(chart: kshoot.Chart) {
        this.chart = chart;
        this.shape = {
            width: 500, height: 500,
        };
    }

    renderBackground(ctx: CanvasRenderingContext2D) {
        ctx.clearRect(0, 0, this.shape.width, this.shape.height);
    }

    async render(params: Params): Promise<Buffer> {
        const canvas = createCanvas(this.shape.width, this.shape.height);
        const ctx = canvas.getContext('2d');

        this.renderBackground(ctx);

        return canvas.toBuffer();
    }
}