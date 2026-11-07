export type ApiErrorDetails = {
  code: string;
  message: string;
  requestId: string;
};

export type ApiErrorEnvelope = {
  error: ApiErrorDetails;
};

export type ApiValidationIssue = {
  location: "request" | "field";
  code: string;
};

export type ApiValidationErrorEnvelope = ApiErrorEnvelope & {
  validation: {
    issues: ApiValidationIssue[];
    truncated: boolean;
  };
};

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
