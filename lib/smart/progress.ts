export type WorkflowProgress = { step: string; message: string; state: 'running' | 'done'; ticketId?: string };
export type ProgressReporter = (progress: WorkflowProgress) => void | Promise<void>;
