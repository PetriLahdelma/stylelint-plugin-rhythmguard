/** The usage text printed by `rhythmguard --help`. */
export const HELP: string;

/** Run the rhythmguard CLI against `process.argv`. Exits the process on completion or error. */
export function main(): void;

declare const cli: { HELP: string; main: typeof main };

export default cli;
