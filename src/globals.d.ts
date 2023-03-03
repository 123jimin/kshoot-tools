declare module 'audio-decode' {
    export default function audioDecode(buf: Buffer): Promise<unknown>;
}