import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import * as kshoot from 'kshoot';

import {Renderer, Params as RendererParams} from "./render.js";
export * as render from "./render.js";

export type LoadPathParams = { type: 'path', file_or_dir_path: string };
export type LoadFileParams = { type: 'files', file_paths: string[] };
export type LoadDirectoryParams = { type: 'directory', dir_path: string };

export type LoadParams = LoadPathParams | LoadFileParams | LoadDirectoryParams;

export type RenderParams = RendererParams & { save_to_file?: boolean, out_dir?: string };

export class KShootChartContext {
    readonly context: KShootContext;
    file_path = "";
    file_name = "";
    chart?: kshoot.Chart;

    constructor(context: KShootContext) {
        this.context = context;
    }

    async load(file_path: string) {
        this.file_path = file_path;
        this.file_name = path.basename(file_path);
        this.chart = kshoot.parse(await fs.readFile(file_path, 'utf-8'));
    }

    toString(): string {
        if(!this.chart) return `[Invalid chart from "${this.file_name}"]`;
        return `[Chart "${this.chart.meta.title.trim()}" (${this.chart.difficulty_id} ${this.chart.meta.level}) from "${this.file_name}"]`;
    }
}

export interface KShootContext {

}

export class KShootTools implements KShootContext {
    dir_path = "";
    charts: (KShootChartContext & {chart: kshoot.Chart})[] = [];
    
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
            await chart.load(file_path);
            if(chart.chart) this.charts.push(chart as (KShootChartContext & {chart: kshoot.Chart}));
        }));

        this.charts.sort((ctx_a, ctx_b) => {
            if(ctx_a.chart.meta.difficulty !== ctx_b.chart.meta.difficulty) {
                return ctx_a.chart.meta.difficulty < ctx_b.chart.meta.difficulty ? -1 : +1;
            }
            return ctx_a.chart.meta.level - ctx_b.chart.meta.level;
        });
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
        for(const chart_ctx of this.charts) lines.push(` - ${chart_ctx.toString()}`); 
        return lines.join('\n');
    }
    
    async render(params: RenderParams): Promise<Record<string, Buffer>> {
        const ret: Record<string, Buffer> = {};
        await Promise.all(this.charts.map(async (chart_ctx) => {
            const renderer = new Renderer(chart_ctx.chart);
            const buffer = await renderer.render(params);

            if(params.save_to_file) {
                const dir_path = params.out_dir ?? (this.dir_path || process.cwd());
                const image_file_name = `${chart_ctx.file_name}.png`;

                await fs.writeFile(path.join(dir_path, image_file_name), buffer);
            }

            ret[chart_ctx.file_name] = buffer;
        }));
        return ret;
    }
}