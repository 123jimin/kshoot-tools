import * as path from 'node:path';

import {ArgumentParser} from 'argparse';

import {KShootTools} from "./index.js";

function parsePath(path_str: string): string {
    if(path_str === "") return "";
    if(path.isAbsolute(path_str)) return path_str;
    return path.join(process.cwd(), path_str);
}

const parser = new ArgumentParser({
    prog: "kshoot",
    description: "A collection of tools related to KSH and KSON chart files of K-Shoot Mania",
});

parser.add_argument('path', {type: parsePath, help: "Path to the .ksh, .kson, .zip, or a directory"});
// parser.add_argument('--render_out', {type: 'str', help: "Directory to put rendered charts"})

const subparsers = parser.add_subparsers({title: "commands", dest: "command"});

const parser_info = subparsers.add_parser('info', {help: "prints information of given chart(s)"});

const parser_render = subparsers.add_parser('render', {help: "renders given chart(s) and saves image(s)"});
parser_render.add_argument('-o', '--out_dir', {type: parsePath, help: "output directory (next to the charts if omitted)"});

const parser_lint = subparsers.add_parser('lint', {help: "proofreads given chart(s)"});

const args = parser.parse_args();

(async() => {
    const kshoot_tools = new KShootTools();
    await kshoot_tools.load({type: 'path', file_or_dir_path: args.path});

    console.log(kshoot_tools.getSummary());

    switch(args.command) {
        case 'info':
            break;
        case 'render':
            await kshoot_tools.render({ save_to_file: true, out_dir: args.out_dir });
            break;
        case 'lint':
            break;
    }
})();