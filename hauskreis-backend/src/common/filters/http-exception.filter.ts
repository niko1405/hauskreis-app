import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';

interface ErrorBody {
  statusCode: number;
  message: string;
  path: string;
  /// Nur gesetzt, wenn die Ausnahme selbst einen mitgibt — siehe `errorSchema`.
  code?: string;
  errors?: { field: string; message: string }[];
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.buildBody(exception, request.url);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(body.statusCode).json(body);
  }

  private buildBody(exception: unknown, path: string): ErrorBody {
    if (exception instanceof ZodValidationException) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        path,
        errors: this.formatZodError(exception.getZodError()),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const detail =
        typeof payload === 'string'
          ? { message: payload }
          : (payload as { message?: string | string[]; code?: string });
      const message = detail.message ?? exception.message;

      return {
        statusCode: status,
        message: Array.isArray(message) ? message.join(', ') : message,
        path,
        // `HttpException` reicht ein Objekt unverändert durch; ein `code` darin
        // ist die einzige Möglichkeit, einen Fall maschinenlesbar zu machen,
        // ohne für ihn einen eigenen Statuscode zu erfinden.
        ...(detail.code ? { code: detail.code } : {}),
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      path,
    };
  }

  private formatZodError(error: unknown): { field: string; message: string }[] {
    if (!(error instanceof ZodError)) {
      return [];
    }

    return error.issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
  }
}
