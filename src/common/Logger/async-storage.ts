import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  requestId: string;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();