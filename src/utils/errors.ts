export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 422);
  }
}

export class FileTooLargeError extends AppError {
  constructor(maxBytes: number) {
    super(
      `File exceeds the maximum allowed size of ${maxBytes} bytes`,
      413,
    );
  }
}

export class InvalidMimeTypeError extends AppError {
  constructor(received: string, allowed: string[]) {
    super(
      `Invalid file type "${received}". Allowed types: ${allowed.join(', ')}`,
      415,
    );
  }
}
