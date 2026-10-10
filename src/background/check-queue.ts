import { logDebug, logError } from "@/core/log";
import type { MarketplaceId } from "@/core/marketplaces";
import type { RunCheck } from "./checker";

type Priority = "popup" | "cookie";

interface CheckRequest {
  readonly id: MarketplaceId;
  readonly manual: boolean;
  readonly priority: Priority;
}

export interface CheckQueue {
  readonly request: (request: CheckRequest) => Promise<void>;
}

interface Job {
  readonly request: CheckRequest;
  readonly done: Promise<void>;
  readonly resolve: () => void;
}

function createJob(request: CheckRequest): Job {
  let resolveJob: (() => void) | undefined;
  const done = new Promise<void>((resolve) => {
    resolveJob = resolve;
  });
  return { request, done, resolve: () => resolveJob?.() };
}

function supersedeWaitingPopups(waiting: readonly Job[]): void {
  for (const dropped of waiting.filter((other) => other.request.priority === "popup")) {
    logDebug(`queue: superseded ${dropped.request.id}`);
    dropped.resolve();
  }
}

function logRequest(request: CheckRequest): void {
  logDebug(`queue: request ${request.id} (${request.priority}, manual=${String(request.manual)})`);
}

export function createCheckQueue(run: RunCheck): CheckQueue {
  let waiting: readonly Job[] = [];
  let current: Job | undefined;
  let pumping = false;

  const pump = async (): Promise<void> => {
    if (pumping) {
      return;
    }
    pumping = true;
    for (let job = waiting[0]; job !== undefined; job = waiting[0]) {
      waiting = waiting.slice(1);
      current = job;
      logDebug(`queue: run ${job.request.id}`);
      try {
        await run(job.request.id, job.request.manual);
      } catch (error) {
        logError(`Check for ${job.request.id} threw`, error);
      }
      current = undefined;
      job.resolve();
    }
    pumping = false;
  };

  const enqueue = (request: CheckRequest): Job => {
    const job = createJob(request);
    if (request.priority === "cookie") {
      waiting = [...waiting, job];
      return job;
    }
    supersedeWaitingPopups(waiting);
    waiting = [job, ...waiting.filter((other) => other.request.priority === "cookie")];
    return job;
  };

  return {
    request: (request) => {
      logRequest(request);
      if (current?.request.id === request.id && request.priority === "popup") {
        logDebug(`queue: dedupe ${request.id}`);
        return current.done;
      }
      const queued = waiting.find((job) => job.request.id === request.id);
      if (
        queued !== undefined &&
        !(queued.request.priority === "cookie" && request.priority === "popup")
      ) {
        logDebug(`queue: dedupe ${request.id}`);
        return queued.done;
      }
      if (queued !== undefined) {
        logDebug(`queue: replaced cookie job ${request.id}`);
        waiting = waiting.filter((job) => job !== queued);
        queued.resolve();
      }
      const job = enqueue(request);
      void pump();
      return job.done;
    },
  };
}
