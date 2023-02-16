import * as path from 'node:path';
import * as url from 'node:url';

import {registerFont, createCanvas, type Canvas, type CanvasRenderingContext2D} from 'canvas';

import * as kshoot from 'kshoot';

export interface RadarStat {
    notes: number;
    peak: number;
    tsumami: number;
    one_hand: number;
    hand_trip: number;
    tricky: number;
}

export interface Shape {
    width: number;
    height: number;
    size: number;
}

export type Params = unknown;

const HEXAGON_DIRS = Object.freeze([
    [0, -1],
    [Math.sqrt(3)/2, -1/2],
    [Math.sqrt(3)/2, +1/2],
    [0, +1],
    [-Math.sqrt(3)/2, +1/2],
    [-Math.sqrt(3)/2, -1/2],
] as const);

export class Radar {
    readonly chart: kshoot.Chart;
    readonly timing: kshoot.Timing;

    readonly shape: Shape;
    readonly stat: kshoot.tools.stat.Stat;

    constructor(args: {chart: kshoot.Chart, timing?: kshoot.Timing}) {
        this.chart = args.chart;
        this.timing = args.timing ?? this.chart.getTiming();

        this.shape = {
            width: 500, height: 450, size: 150,
        };

        this.stat = kshoot.tools.stat.getStat(this.chart);
    }

    renderBackground(ctx: CanvasRenderingContext2D) {
        ctx.clearRect(0, 0, this.shape.width, this.shape.height);
        
        ctx.save();
        ctx.translate(this.shape.width/2, this.shape.height/2);

        ctx.beginPath();
        ctx.strokeStyle = "rgb(255, 255, 255)";
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";

        for(let i=0; i<6; ++i) {
            const [dx, dy] = HEXAGON_DIRS[i];
            (i === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, this.shape.size * dx, this.shape.size * dy);
        }

        ctx.closePath();  
        
        ctx.fill(); ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = "rgb(255, 255, 255)";
        ctx.lineWidth = 1.5;

        const half_tick_len = this.shape.size*0.02;
        for(const [dx, dy] of HEXAGON_DIRS) {
            ctx.moveTo(0, 0);
            ctx.lineTo(this.shape.size * dx, this.shape.size * dy);

            for(let i=1; i<=3; ++i) {
                const [ox, oy] = [i*this.shape.size/4 * dx, i*this.shape.size/4 * dy];
                const [px, py] = [dy, -dx];

                ctx.moveTo(ox - half_tick_len * px, oy - half_tick_len * py);
                ctx.lineTo(ox + half_tick_len * px, oy + half_tick_len * py);
            }
        }

        ctx.stroke();

        ctx.restore();
    }

    getRadarStat(): RadarStat {
        const stat = this.stat;

        const bc_jacks = [1, 2].map((lane) => stat.by_lane[lane].jacks).reduce((x, y) => x+y);
        const adlr_jacks = [0, 3, 4, 5].map((lane) => stat.by_lane[lane].jacks).reduce((x, y) => x+y);

        // TODO: find more accurate formulas
        return {
            notes: 454 + stat.chips + 0.12 * stat.holds + 0.04 * stat.hold_chains - 0.24 * stat.one_hand_notes,
            peak: 12 + stat.max_density,
            tsumami: 125 + stat.slams + 1.8 * stat.moving_lasers + 0.6 * stat.moving_laser_chains,
            one_hand: 55 + stat.one_hand_notes,
            hand_trip: 55 + stat.wrong_side_notes,
            tricky: 10 + 0.02 * stat.bpm_change_intensity + bc_jacks + 2.0 * adlr_jacks,
        };
    }

    getScaledRadarStat(): RadarStat {
        const radar_stat = this.getRadarStat();

        // TODO: find proper normalization values
        radar_stat.notes /= 1000 / 100;
        radar_stat.peak /= 63 / 100;
        radar_stat.tsumami /= 860 / 100;
        radar_stat.one_hand /= 3;
        radar_stat.hand_trip /= 3;
        radar_stat.tricky /= 50 / 100;

        for(const str_k in radar_stat) {
            const k = str_k as keyof RadarStat;

            if(radar_stat[k] < 10) radar_stat[k] = 10;
            if(radar_stat[k] >= 1000) radar_stat[k] = 1000;
        }

        return radar_stat;
    }

    toString(raw?: boolean) {
        if(raw) {
            const radar_stat = this.getRadarStat();
            return `{notes: ${radar_stat.notes}, peak: ${radar_stat.peak}, tsumami: ${radar_stat.tsumami}, one_hand: ${radar_stat.one_hand}, hand_trip: ${radar_stat.hand_trip}, tricky: ${radar_stat.tricky}}`;
        } else {
            const radar_stat = this.getScaledRadarStat();
            for(const k_str in radar_stat) {
                const k = k_str as keyof RadarStat;
                radar_stat[k] = Math.round(radar_stat[k]);
            }
            return `{notes: ${radar_stat.notes}, peak: ${radar_stat.peak}, tsumami: ${radar_stat.tsumami}, one_hand: ${radar_stat.one_hand}, hand_trip: ${radar_stat.hand_trip}, tricky: ${radar_stat.tricky}}`;
        }
    }

    renderRadar(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.translate(this.shape.width/2, this.shape.height/2);

        const radar_stat = this.getScaledRadarStat();
        const stats = [
            radar_stat.notes, radar_stat.peak, radar_stat.tsumami, radar_stat.tricky, radar_stat.hand_trip, radar_stat.one_hand, 
        ];
        
        const gradient = ctx.createRadialGradient(0, 0, this.shape.size * 0.8, 0, 0, this.shape.size * 1.25);
        gradient.addColorStop(0, "rgba(38, 121, 255, 0.7)");
        gradient.addColorStop(0.75, "rgba(128, 64, 128, 0.7)");
        gradient.addColorStop(1, "rgba(255, 0, 0, 0.7)")

        ctx.beginPath();
        ctx.fillStyle = gradient;

        for(let i=0; i<6; ++i) {
            const [dx, dy] = HEXAGON_DIRS[i];

            const len = stats[i]/100 * this.shape.size;
            (i === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, len*dx, len*dy);
        }

        ctx.fill();

        ctx.restore();
    }

    renderForeground(ctx: CanvasRenderingContext2D) {
        const labels = [
            ["NOTES", "cyan"],
            ["PEAK", "red"],
            ["TSUMAMI", "violet"],
            ["TRICKY", "yellow"],
            ["HAND\nTRIP", "#BF46EB"],
            [" ONE\nHAND", "lime"],
        ] as const;
        
        ctx.save();
        ctx.translate(this.shape.width/2, this.shape.height/2);

        ctx.font = "30px ConcertOne";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 3;
        
        for(let i=0; i<6; ++i) {
            const [dx, dy] = HEXAGON_DIRS[i];
            const [tx, ty] = [1.35*this.shape.size * dx, 1.35*this.shape.size * dy];

            ctx.fillStyle = labels[i][1];
            ctx.strokeText(labels[i][0], tx, ty);
            ctx.fillText(labels[i][0], tx, ty);
        }

        ctx.restore();
    }

    async render(params: Params): Promise<Buffer> {
        const canvas = createCanvas(this.shape.width, this.shape.height);
        const ctx = canvas.getContext('2d');

        this.renderBackground(ctx);
        this.renderRadar(ctx);
        this.renderForeground(ctx);

        return canvas.toBuffer();
    }
}

const RES_DIR = url.fileURLToPath(new URL("../res/", import.meta.url));

registerFont(path.join(RES_DIR, "Concert_One/ConcertOne-Regular.ttf"), {family: "ConcertOne", style: 'regular'});