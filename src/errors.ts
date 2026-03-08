import type { MockErrorCode } from "./types.js";

export class MockError extends Error {
  readonly code: MockErrorCode;

  constructor(code: MockErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function asMockError(error: unknown): MockError {
  if (error instanceof MockError) {
    return error;
  }
  if (error instanceof Error) {
    return new MockError("MOCK_INTERNAL_ERROR", error.message);
  }
  return new MockError("MOCK_INTERNAL_ERROR", "Unknown mock internal error");
}
