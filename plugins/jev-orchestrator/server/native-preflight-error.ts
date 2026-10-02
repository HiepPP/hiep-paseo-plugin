import { EvaluationError, type EvaluationDiagnostics } from "./evaluation-error";
const codes = {
  parent_runtime: "NATIVE_PARENT_RUNTIME_FAILED",
  evaluation: "NATIVE_EVALUATION_FAILED",
  decision_validation: "NATIVE_DECISION_INVALID",
  policy_revalidation: "NATIVE_POLICY_REVALIDATION_FAILED",
  definition_read: "NATIVE_DEFINITION_READ_FAILED",
  definition_render: "NATIVE_DEFINITION_RENDER_FAILED",
  ticket_write: "NATIVE_TICKET_WRITE_FAILED",
  ticket_publish: "NATIVE_TICKET_PUBLISH_FAILED",
  issuance_validation: "NATIVE_ISSUANCE_REJECTED",
} as const;
export type NativeFailureStage = keyof typeof codes;

// A native spawn named a task that no preflight issued; the parent skipped prepare_native_delegate.
export class NativeTicketMissingError extends Error {
  readonly code = "NATIVE_TICKET_MISSING";
  constructor() {
    super("No issued Jev ticket matches task_name. Call prepare_native_delegate first.");
  }
}

// Never carry an underlying error, task text, credentials or filesystem paths across the bridge.
export class NativePreflightError extends Error {
  readonly code: string;
  readonly evaluation?: EvaluationDiagnostics;
  constructor(
    readonly failureStage: NativeFailureStage,
    timedOut = false,
    cause?: unknown,
  ) {
    super("Jev preflight failed. No ticket issued; do not retry under a new request ID.");
    if (cause instanceof EvaluationError) this.evaluation = cause.diagnostics;
    this.code = timedOut ? "NATIVE_PREFLIGHT_TIMEOUT" : codes[failureStage];
  }
}
