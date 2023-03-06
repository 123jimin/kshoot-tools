#!/usr/bin/env node

import * as path from 'node:path';

import {ArgumentParser} from 'argparse';

import {KShootTools, computeCrossCorrelation, npy} from "./index.js";
import {drawDebugImage} from './offset-computer.js';

function parsePath(path_str: string): string {
    if(path_str === "") return "";
    if(path.isAbsolute(path_str)) return path_str;
    return path.join(process.cwd(), path_str);
}

const parser = new ArgumentParser({
    prog: "kshoot",
    description: "A collection of tools related to KSH and KSON chart files of K-Shoot Mania",
});

parser.add_argument('path', {type: parsePath, help: "path to the .ksh, .kson, .zip, or a directory"});
parser.add_argument('--stat', {action: 'store_true', help: "print stats"});
parser.add_argument('-x', '--extract', {action: 'store_true', help: "set this flag if the provided file is an .zip"});

const subparsers = parser.add_subparsers({title: "commands", dest: "command"});

const parser_radar = subparsers.add_parser('radar', {help: "calculate radar stats"});
parser_radar.add_argument('--raw', {action: 'store_true', help: "do not normalize the values"});
parser_radar.add_argument('-o', '--out_dir', {type: parsePath, help: "save the radar image (next to the charts if it's an empty string)"})

const parser_render = subparsers.add_parser('render', {help: "renders given chart(s) and saves image(s)"});
parser_render.add_argument('-c', '--columns', {type: parseInt, help: "# of columns to draw"});
parser_render.add_argument('--pulses_per_column', {type: BigInt, help: "# of KSON pulses per column"});
parser_render.add_argument('-m', '--start_measure', {type: BigInt, help: "set the beginning point (with measure no.)"});
parser_render.add_argument('-p', '--start_pulse', {type: BigInt, help: "set the beginning point (with KSON pulses)"});
parser_render.add_argument('-o', '--out_dir', {type: parsePath, help: "output directory (next to the charts if omitted)"});

const parser_convert = subparsers.add_parser('convert', {help: "converts the format of the chart(s)"});
parser_convert.add_argument('format', {choices: ['ksh', 'kson', 'npy'], help: "which format to convert the chart(s) into"});
parser_convert.add_argument('-o', '--out_dir', {type: parsePath, help: "output directory (next to the charts if omitted)"});

const parser_sync = subparsers.add_parser('sync', {help: "calculate the proper offset for the chart(s)"});
parser_sync.add_argument('-v', '--verbose', {action: 'store_true', help: "print detailed information"});
parser_sync.add_argument('--debug_image_dir', {type: parsePath, help: "output directory for debug image(s)"});

const args = parser.parse_args();

(async() => {
    const kshoot_tools = new KShootTools();
    if(args.extract) {
        await kshoot_tools.load({type: 'archive', file_path: args.path as string});
    } else {
        await kshoot_tools.load({type: 'path', file_or_dir_path: args.path});
    }

    console.log(kshoot_tools.getSummary());

    if(args.stat) {
        console.log();
        console.log("== Stats ==");
        console.log(kshoot_tools.getStatDescriptions().join('\n'));
    }

    switch(args.command) {
        case 'radar': {
            console.log();
            console.log("== Radars ==");
            const radars = kshoot_tools.getRadars();
            for(let i=0; i<radars.length; ++i) {
                console.log(`${kshoot_tools.charts[i].toString()} ${radars[i].toString()}`);
            }

            if(args.out_dir != null) {
                await kshoot_tools.save(args.out_dir, await Promise.all(radars.map(radar => radar.render({}))), 'png');
                console.log(args.out_dir ? `Images saved under ${args.out_dir}` : "Images saved next to chart(s)");
            }
            break;
        }
        case 'render': {
            const renderers = kshoot_tools.getRenderers();
            await kshoot_tools.save(args.out_dir, await Promise.all(renderers.map((renderer => renderer.render({
                start: args.start_measure ? renderer.timing.getMeasureInfoByIdx(args.start_measure-1n).pulse : args.start_pulse,
                pulses_per_column: args.pulses_per_column,
                max_columns: args.columns,
            })))), 'png');
            console.log(args.out_dir ? `Images saved under ${args.out_dir}` : "Images saved next to chart(s)");
            break;
        }
        case 'convert': {
            const format: 'kson'|'ksh'|'npy' = args.format;
            const exported: (string|Buffer)[] = kshoot_tools.charts.map((chart_ctx) => {
                switch(format) {
                    case 'npy':
                        return npy.fromChart(chart_ctx.chart).export();
                    default:
                        return chart_ctx.chart.export(format);
                }
            });
            await kshoot_tools.save(args.out_dir, exported, format);
            break;
        }
        case 'sync': {
            if(args.debug_image_dir) {
                await kshoot_tools.save(args.debug_image_dir, await Promise.all(kshoot_tools.charts.map(drawDebugImage)), 'png');
                break;
            }

            await Promise.all(kshoot_tools.charts.map(async (chart_ctx) => {
                const corr = await computeCrossCorrelation(chart_ctx);
                if(corr == null) {
                    console.log(`${chart_ctx.toString()}: can't compute offset`);
                } else {
                    const delta = corr.bestOffset();
                    const delta_str = delta < 0 ? delta.toString() : '+' + delta.toString();

                    const new_offset = chart_ctx.chart.audio.bgm.offset + delta;
                    console.log(`${chart_ctx.toString()}: ${chart_ctx.chart.audio.bgm.offset} => ${new_offset} (${delta_str} ms)`);

                    if(args.verbose) {
                        const peaks = [...corr.peaks()].sort((x, y) => y[1] - x[1]).slice(0, 16).sort((x, y) => x[0] - y[0]);
                        for(const [offset, value] of peaks) {
                            console.log(`* ${offset.toString().padStart(5)} ms : ${value.toFixed(3).padStart(6)}`);
                        }
                    }
                }
            }));
            break;
        }
    }
})();