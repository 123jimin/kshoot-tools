import * as path from 'node:path';
import * as url from 'node:url';

import {registerFont, createCanvas, type CanvasRenderingContext2D} from 'canvas';

import * as kshoot from 'kshoot';

export interface RadarConstructorChartArgs {
    chart: kshoot.Chart;
    timing?: kshoot.Timing;
}

export interface RadarConstructorManualArgs {
    stat: RadarStat;
    difficulty?: string;
    level?: string|number;
}

export type RadarConstructorArgs = RadarConstructorChartArgs | RadarConstructorManualArgs;

export interface RadarStat {
    notes: number;
    peak: number;
    tsumami: number;
    one_hand: number;
    hand_trip: number;
    tricky: number;
}

export const RadarStat = Object.freeze({
    rawFromChart(chart: kshoot.Chart, timing?: kshoot.Timing): RadarStat {
        const stat = kshoot.tools.stat.getStat(chart, timing);
        const duration = chart.getDuration() / 1000;
        
        const bc_jacks = [1, 2].map((lane) => stat.by_button_lane[lane].jacks).reduce((x, y) => x+y);
        const adlr_jacks = [0, 3, 4, 5].map((lane) => stat.by_button_lane[lane].jacks).reduce((x, y) => x+y);
    
        // TODO: find more accurate formulas for TRICKY and other values
        return {
            notes: (stat.chips + stat.holds) / duration,
            peak: stat.peak_note_density,
            tsumami: (stat.slant_laser_chains + stat.slams) / duration,
            one_hand: stat.one_hand_notes / duration,
            hand_trip: stat.wrong_side_notes / duration,
            tricky: (bc_jacks + 2*adlr_jacks + 4000*stat.bpm_inverse_differences) / duration,
        };
    },
    fromRaw(radar_stat: RadarStat): RadarStat {
        radar_stat.notes = (16.663 * radar_stat.notes + 38.798) / 1.5;
        radar_stat.peak = (2.1644 * radar_stat.peak + 42.113) / 1.5;
        radar_stat.tsumami = (20 * radar_stat.tsumami + 18) / 1.5;
        radar_stat.one_hand = (64.817 * radar_stat.one_hand) / 1.5 + 10;
        radar_stat.hand_trip = (168.25 * radar_stat.hand_trip) / 1.5 + 10;
        radar_stat.tricky = (177.18 * radar_stat.tricky) / 1.5 + 10;

        return radar_stat;
    },
    fromChart(chart: kshoot.Chart, timing?: kshoot.Timing): RadarStat {
        return RadarStat.clamp(RadarStat.fromRaw(RadarStat.rawFromChart(chart, timing)));
    },
    clamp(radar_stat: RadarStat): RadarStat {
        for(const str_k in radar_stat) {
            const k = str_k as keyof RadarStat;
    
            if(radar_stat[k] < 10) radar_stat[k] = 10;
            if(radar_stat[k] >= 1000) radar_stat[k] = 1000;
        }
    
        return radar_stat;
    },
    createEmpty(): RadarStat {
        return RadarStat.clamp(RadarStat.fromRaw({
            notes: 0, peak: 0, tsumami: 0, one_hand: 0, hand_trip: 0, tricky: 0,
        }))
    },
    toString(radar_stat: RadarStat, no_round = false): string {
        const arr: string[] = [];
        for(const k of (['notes', 'peak', 'tsumami', 'tricky', 'hand_trip', 'one_hand'] as const)) {
            const value = radar_stat[k];
            arr.push(`${k}: ${no_round ? value.toFixed(3) : Math.round(value).toString()}`)
        }
    
        return `{${arr.join(', ')}}`;
    },
});

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
    shape: Shape = {width: 500, height: 450, size: 150};
    stat: RadarStat;
    difficulty?: string;
    level?: string;

    constructor(args: RadarConstructorArgs) {
        this.stat = ('stat' in args) ? args.stat : ('chart' in args) ? RadarStat.fromChart(args.chart, args.timing) : RadarStat.createEmpty();
        this.difficulty = ('difficulty' in args) ? args.difficulty : ('chart' in args) ? args.chart.difficulty_id.toUpperCase() : (void 0);
        this.level = ('level' in args) ? `${args.level}` : ('chart' in args) ? args.chart.meta.level.toString() : (void 0); 
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

        if(this.difficulty) {
            ctx.font = "72px ConcertOne";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
            ctx.fillText(this.difficulty, 0, 0);
        }

        if(this.level) {
            ctx.font = "96px ConcertOne";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
            ctx.fillText(this.level.padStart(2, '0'), 0, -20);
        }

        ctx.restore();
    }

    toString() {
        return RadarStat.toString(this.stat);
    }

    renderRadar(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.translate(this.shape.width/2, this.shape.height/2);

        const stats = [
            this.stat.notes, this.stat.peak, this.stat.tsumami, this.stat.tricky, this.stat.hand_trip, this.stat.one_hand, 
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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