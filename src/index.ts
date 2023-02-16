import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import * as kshoot from 'kshoot';
export * as kshoot from 'kshoot';

import {Radar, Params as RadarParams} from "./radar.js";
export * as radar from "./radar.js";

import {Renderer, Params as RendererParams} from "./render.js";
export * as render from "./render.js";

export type LoadPathParams = { type: 'path', file_or_dir_path: string };
export type LoadFileParams = { type: 'files', file_paths: string[] };
export type SetDataParams = { type: 'set', data: Record<string, string|Buffer> }
export type LoadDirectoryParams = { type: 'directory', dir_path: string };

export type LoadParams = LoadPathParams | LoadFileParams | SetDataParams | LoadDirectoryParams;

export type RenderParams = RendererParams & { save_to_file?: boolean, out_dir?: string };

export class KShootChartContext {
    readonly context: KShootContext;
    file_path = "";
    file_name = "";
    chart?: kshoot.Chart;
    timing?: kshoot.Timing;

    constructor(context: KShootContext) {
        this.context = context;
    }

    set(source_path: string, chart_data: string|Buffer): LoadedKShootChartContext {
        this.file_path = source_path;
        this.file_name = path.basename(source_path);
        
        const chart = kshoot.parse((typeof chart_data === 'string') ? chart_data : chart_data.toString('utf-8'));
        const timing = chart.getTiming();

        return Object.assign(this, {chart, timing});
    }

    async load(file_path: string): Promise<LoadedKShootChartContext> {
        return this.set(file_path, await fs.readFile(file_path));
    }

    toString(): string {
        if(!this.chart) return `[Invalid chart from "${this.file_name}"]`;
        return `[Chart "${this.chart.meta.title.trim()}" (${this.chart.difficulty_id} ${this.chart.meta.level}) from "${this.file_name}"]`;
    }

    getStatDescription(this: {chart: kshoot.Chart}): string {
        const stat: kshoot.tools.stat.Stat = kshoot.tools.stat.getStat(this.chart);

        return `
            ${this.toString()}
            - Duration: ${(this.chart.getDuration()/1000).toFixed(3)} s
            - BPM: ${this.chart.meta.disp_bpm} (median: ${this.chart.getMedianBPM()})
            - notes: ${stat.notes} (${stat.chips} chips + ${stat.holds} holds)
            - max density: ${stat.max_density}
            - lasers: ${stat.moving_lasers + stat.slams} (${stat.moving_lasers} moving lasers + ${stat.slams} slams)
            - one hand: ${stat.one_hand_notes}
            - hand trip: ${stat.wrong_side_notes}
            - jacks: ${stat.jacks} (BC: ${[1, 2].map((lane) => stat.by_lane[lane].jacks).reduce((x, y) => x+y)}, ADLR: ${[0, 3, 4, 5].map((lane) => stat.by_lane[lane].jacks).reduce((x, y) => x+y)})
            - sofulan: ${stat.bpm_change_intensity.toFixed(1)} (${stat.bpm_changes} BPM changes)
        `.split('\n').map((line) => line.trim()).join('\n').trim();
    }
}

export type LoadedKShootChartContext = KShootChartContext & {chart: kshoot.Chart, timing: kshoot.Timing};

export interface KShootContext {
    dir_path: string;
    charts: LoadedKShootChartContext[];
}

export class KShootTools implements KShootContext {
    dir_path = "";
    charts: LoadedKShootChartContext[] = [];
    
    reset() {
        this.dir_path = "";
        this.charts = [];
    }

    async load(params: LoadParams) {
        switch(params.type) {
            case 'path' : {
                const stat = await fs.stat(params.file_or_dir_path);
                if(stat.isFile()) await this.loadFiles({type: 'files', file_paths: [params.file_or_dir_path]});
                else if(stat.isDirectory()) await this.loadDirectory({type: 'directory', dir_path: params.file_or_dir_path});
                break;
            }
            case 'files': await this.loadFiles(params); break;
            case 'set': this.setData(params); break;
            case 'directory': await this.loadDirectory(params); break;
        }
    }

    async loadFiles(params: LoadFileParams) {
        this.reset();
        if(params.file_paths.length === 0) return;

        let first_path = true;
        for(const file_path of params.file_paths) {
            const file_dir_path = path.dirname(file_path);
            if(first_path) {
                this.dir_path = file_dir_path;
                first_path = false;
            } else if(this.dir_path !== file_dir_path) {
                throw new Error(`Multiple chart files in different directories are not supported!`);
            }
        }

        await Promise.all(params.file_paths.map(async (file_path) => {
            const chart = new KShootChartContext(this);
            this.charts.push(await chart.load(file_path));
        }));

        this.charts.sort((ctx_a, ctx_b) => {
            if(ctx_a.chart.meta.difficulty !== ctx_b.chart.meta.difficulty) {
                return ctx_a.chart.meta.difficulty < ctx_b.chart.meta.difficulty ? -1 : +1;
            }
            return ctx_a.chart.meta.level - ctx_b.chart.meta.level;
        });
    }

    setData(params: SetDataParams) {
        this.reset();

        for(const source_path in params.data) {
            const chart = new KShootChartContext(this);
            this.charts.push(chart.set(source_path, params.data[source_path]));
        }
    }

    async loadDirectory(params: LoadDirectoryParams) {
        this.reset();

        const file_paths = [];
        for(const file_path of await fs.readdir(params.dir_path)) {
            const ext = path.extname(file_path).toLowerCase();
            if(ext === '.ksh' || ext === '.kson') {
                file_paths.push(path.join(params.dir_path, file_path));
            }
        }

        await this.loadFiles({type: 'files', file_paths});
    }

    getSummary(): string {
        const lines = [
            `${this.charts.length} chart${this.charts.length === 1 ? '' : 's'} from "${this.dir_path}"`
        ];
        for(const chart_ctx of this.charts) lines.push(`- ${chart_ctx.toString()}`); 
        return lines.join('\n');
    }

    getStatDescriptions(): string[] {
        const stats: string[] = [];
        for(const chart_ctx of this.charts) {
            stats.push(chart_ctx.getStatDescription());
        }
        return stats;
    }
    
    getRadars(): Radar[] {
        return this.charts.map((chart_ctx) => new Radar(chart_ctx));
    }

    getRenderers(): Renderer[] {
        return this.charts.map((chart_ctx) => new Renderer(chart_ctx));
    }

    async save(out_dir: string, data: (Buffer|string|null)[], pathMap?: (chart_ctx: KShootChartContext & {chart: kshoot.Chart}) => string) {
        if(!pathMap) pathMap = (chart_ctx) => `${chart_ctx.file_name}.png`;

        await Promise.all(data.map(async (data, ind) => {
            if(data == null || !pathMap) return;

            const dir_path = out_dir || this.dir_path ||  process.cwd();
            const file_path = path.join(dir_path, pathMap(this.charts[ind]));

            if(typeof data === 'string') await fs.writeFile(file_path, data, 'utf-8');
            else await fs.writeFile(file_path, data);
        }));
    }
}