export interface BaseEmailPayload {
  email: string;
}

export interface EmailStrategy<T extends BaseEmailPayload = BaseEmailPayload> {
    send(payload: T): Promise<void>;
}