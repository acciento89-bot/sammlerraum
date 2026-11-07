export type EnqueueOptions = {
  singletonKey?: string;
  retryLimit?: number;
  priority?: number;
};

export interface QueueClient {
  enqueue<T extends object>(name: string, payload: T, options?: EnqueueOptions): Promise<string>;
}

export type JobHandler<T> = (payload: T) => Promise<void>;
