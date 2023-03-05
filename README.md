# kshoot-tools

NOTE: this tool is work in progress.

This is a collection of tools related to KSH and KSON chart files of K-Shoot Mania. This tool is created with [kshoot.js](https://github.com/123jimin/kshoot.js).

## Features

- Chart stat
- Chart renderer
- Radar renderer
- Sync (offset) calculator

## How to use

### Installation

Download [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) first, then install `kshoot-tools` by executing the following command in a terminal.

```text
npm i -g 123jimin/kshoot-tools
```

### Basic usage

Example 1:

```text
kshoot test/chart.ksh
```

```text
1 chart from "test/"
- [Chart "Astar" (MXM 19) from "chart.ksh"]
```

Example 2:

```text
kshoot test/chart.ksh --stat
```

```text
1 chart from "test/"
- [Chart "Astar" (MXM 19) from "chart.ksh"]

== Stats ==
[Chart "Astar" (MXM 19) from "chart.ksh"]
- Duration: 122.500 s
- BPM: 96-448 (median: 192)
- notes: 1104 (991 chips + 113 holds)
- max density: 64
- lasers: 225 (76 moving lasers + 149 slams)
- one hand: 371
- hand trip: 288
- jacks: 21 (BC: 9, ADLR: 12)
- sofulan: 1184.0 (8 BPM changes)
```

### Chart rendering

```text
kshoot test/chart.ksh render -m=10 -c=12 -o="."
```

The command above creates `chart.ksh.png`, which looks like this:

![Rendered chart](./example/render.png)

### Sync calculator

```text
kshoot test/Astar/inf.ksh sync -v
```

The best offset for the chart will be found based on the music the chart is using.

```text
1 chart from "test/Astar"
- [Chart "Astar" (MXM 19) from "inf.ksh"]
[Chart "Astar" (MXM 19) from "inf.ksh"]: 100 => 151 (+51 ms)
*  -885 ms :  9.417
*  -730 ms :  6.344
*  -574 ms : 18.530
*  -418 ms : 11.789
*  -262 ms : 30.081
*  -260 ms : 30.488
*  -105 ms : 19.400
*   -27 ms :  6.796
*    51 ms : 41.703
*   207 ms : 16.609
*   363 ms : 25.055
*   365 ms : 24.781
*   520 ms :  9.344
*   676 ms : 15.106
*   832 ms :  5.400
*   989 ms :  8.115
```

Note that it will not automatically modify the offset of the chart.

## Planned tools

- [ ] Converter (KSH <-> KSON)
- [ ] Linter
- [ ] Curved laser generator
