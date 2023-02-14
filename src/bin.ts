import * as path from 'node:path';

import {ArgumentParser} from 'argparse';

import {KShootTools, radar} from "./index.js";

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

const subparsers = parser.add_subparsers({title: "commands", dest: "command"});

const parser_radar = subparsers.add_parser('radar', {help: "calculate radar stats"});
parser_radar.add_argument('--raw', {action: 'store_true', help: "do not normalize the values"});
parser_radar.add_argument('-o', '--out_dir', {type: parsePath, help: "save the radar image (next to the charts if it's an empty string)"})

const parser_render = subparsers.add_parser('render', {help: "renders given chart(s) and saves image(s)"});
parser_render.add_argument('-o', '--out_dir', {type: parsePath, help: "output directory (next to the charts if omitted)"});

const args = parser.parse_args();

(async() => {
    const kshoot_tools = new KShootTools();
    await kshoot_tools.load({type: 'path', file_or_dir_path: args.path});

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
                kshoot_tools.save(args.out_dir, await Promise.all(radars.map(radar => radar.render({}))));
            }
            break;
        }
    }
})();