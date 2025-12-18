export interface Options {
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
  target?: string;
}

export type ThreadSleepFunction = (ms: number) => number;
