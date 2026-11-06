export interface StorageProvider {
  put(key: string, bytes: Uint8Array): Promise<void>;
  read(key: string, options?: { maxBytes: number; signal?: AbortSignal }): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
