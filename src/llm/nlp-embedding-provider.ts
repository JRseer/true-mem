import { fork, type ChildProcess } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { log } from '../logger.js';
import type { EmbeddingProvider, LlmAuxiliaryResult } from './provider.js';

function defaultWorkerPath(): string {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    return resolve(dirname(currentFile), '..', 'memory', 'embedding-worker.js');
  } catch {
    return resolve(__dirname, '..', 'memory', 'embedding-worker.js');
  }
}

export interface NlpEmbeddingProviderConfig {
  readonly providerId?: string | undefined;
  readonly model?: string | undefined;
  readonly dimension?: number | undefined;
  readonly workerPath?: string | undefined;
  readonly timeoutMs?: number | undefined;
}

interface EmbedRequest {
  readonly resolveBatch: (data: number[][]) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export class NlpEmbeddingProvider implements EmbeddingProvider {
  readonly providerId: string;
  readonly model: string;
  readonly dimension: number;
  readonly localOnly: boolean = true;

  private readonly workerPath: string;
  private readonly timeoutMs: number;
  private worker: ChildProcess | null = null;
  private pendingRequests: Map<string, EmbedRequest> = new Map();
  private requestCounter: number = 0;
  private initialized: boolean = false;

  constructor(config: NlpEmbeddingProviderConfig = {}) {
    this.providerId = config.providerId ?? 'local-nlp';
    this.model = config.model ?? 'Xenova/all-MiniLM-L6-v2';
    this.dimension = config.dimension ?? 384;
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.workerPath = config.workerPath ?? defaultWorkerPath();
  }

  async embed(text: string): Promise<LlmAuxiliaryResult<Float32Array>> {
    const result = await this.embedBatch([text]);
    return {
      data: result.data[0] ?? new Float32Array(this.dimension),
      model: result.model,
      providerId: result.providerId,
      isFallback: result.isFallback,
      metrics: result.metrics,
    };
  }

  async embedBatch(texts: readonly string[]): Promise<LlmAuxiliaryResult<readonly Float32Array[]>> {
    if (texts.length === 0) {
      return {
        data: [],
        model: this.model,
        providerId: this.providerId,
        isFallback: false,
      };
    }

    try {
      await this.ensureWorker();
      const vectors = await this.requestEmbeddings([...texts]);

      return {
        data: vectors.map(v => new Float32Array(v)),
        model: this.model,
        providerId: this.providerId,
        isFallback: false,
      };
    } catch (error) {
      log(`NLP embedding failed; falling back to hash-based embedding: ${error instanceof Error ? error.message : String(error)}`);
      return this.hashFallbackBatch(texts);
    }
  }

  async dispose(): Promise<void> {
    if (this.worker && this.worker.connected) {
      this.worker.send({ type: 'shutdown' });
      this.worker = null;
      this.initialized = false;
    }
    this.pendingRequests.clear();
  }

  private async ensureWorker(): Promise<void> {
    if (this.initialized && this.worker?.connected) return;

    return new Promise<void>((resolve, reject) => {
      try {
        this.worker = fork(this.workerPath, [], {
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          env: { ...process.env, WORKER_MODEL: this.model },
        });

        const readyHandler = (msg: any) => {
          if (msg.type === 'ready') {
            this.worker?.off('message', readyHandler);
            this.initialized = true;
            log('NLP embedding worker ready');
            resolve();
          } else if (msg.type === 'error') {
            this.worker?.off('message', readyHandler);
            reject(new Error(`Worker init failed: ${msg.error}`));
          }
        };

        this.worker.on('message', (msg: any) => this.handleWorkerMessage(msg));
        this.worker.once('message', readyHandler);
        this.worker.on('error', (err) => {
          this.worker?.off('message', readyHandler);
          reject(new Error(`Worker process error: ${err.message}`));
        });
        this.worker.on('exit', (code) => {
          if (code !== 0 && !this.initialized) {
            reject(new Error(`Worker exited with code ${code}`));
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private async requestEmbeddings(texts: string[]): Promise<number[][]> {
    const requestId = `nlp-${++this.requestCounter}-${Date.now()}`;

    return new Promise<number[][]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`NLP embedding request ${requestId} timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      this.pendingRequests.set(requestId, { resolveBatch: resolve, reject, timer });
      this.worker?.send({ type: 'embed', texts, requestId });
    });
  }

  private handleWorkerMessage(msg: any): void {
    if (msg.type === 'embeddings' && msg.requestId) {
      const pending = this.pendingRequests.get(msg.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.requestId);
        pending.resolveBatch(msg.embeddings as number[][]);
      }
    }
  }

  private hashFallbackBatch(texts: readonly string[]): LlmAuxiliaryResult<readonly Float32Array[]> {
    return {
      data: texts.map(text => hashEmbed(text, this.dimension)),
      model: this.model,
      providerId: this.providerId,
      isFallback: true,
      metrics: { totalTokens: texts.join(' ').length },
    };
  }
}

function hashEmbed(text: string, dimension: number): Float32Array {
  const vector = new Float32Array(dimension);
  const chars = text.normalize('NFC');

  for (let i = 0; i < chars.length; i++) {
    const code = chars.charCodeAt(i);
    for (let dim = 0; dim < dimension; dim++) {
      const idx = ((code * (dim + 1) + i * 31 + dim * 17) % dimension + dimension) % dimension;
      vector[idx] = (vector[idx]!) + 0.01;
    }
  }

  let norm = 0;
  for (let i = 0; i < dimension; i++) norm += (vector[i]!) * (vector[i]!);
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dimension; i++) vector[i] = (vector[i]!) / norm;

  return vector;
}
