'use strict';

/**
 * Centralised application error hierarchy — Phase 9.4
 *
 * isOperational = true  → expected business errors (safe to send message to client)
 * isOperational = false → programmer errors (send generic message, log full stack)
 */

class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR') {
    super(message);
    this.name        = this.constructor.name;
    this.statusCode  = statusCode;
    this.errorCode   = errorCode;
    this.isOperational = true;
    // Capture clean stack trace (excludes this constructor frame)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

class ValidationError extends AppError {
  constructor(message, field) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTH_REQUIRED');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'ACCESS_DENIED');
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

class ServiceUnavailableError extends AppError {
  constructor(serviceName = 'Upstream service') {
    super(`${serviceName} is temporarily unavailable`, 503, 'SERVICE_UNAVAILABLE');
  }
}

class RateLimitError extends AppError {
  constructor() {
    super('Too many requests. Please slow down.', 429, 'RATE_LIMITED');
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500, 'DB_ERROR');
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  ServiceUnavailableError,
  RateLimitError,
  DatabaseError,
};
