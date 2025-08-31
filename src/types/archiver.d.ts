// Minimal ambient typings for 'archiver' to satisfy TS and ESLint under moduleResolution: 'Bundler'
declare module "archiver" {
  import type { Writable } from "stream";

  export interface Archiver extends NodeJS.ReadWriteStream {
    on(event: "error", listener: (err: Error) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
    pipe(stream: Writable): Writable;
    directory(src: string, dest?: string | false): this;
    finalize(): Promise<void> | void;
  }

  export interface Options {
    zlib?: { level?: number };
    // keep minimal for our use
  }

  function archiver(format: "zip", options?: Options): Archiver;

  export = archiver;
}