import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable, map } from 'rxjs';
import { formatEtag } from './etag';

function hasVersion(body: unknown): body is { version: number } {
  return (
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    typeof (body as { version?: unknown }).version === 'number'
  );
}

/**
 * Publishes the entity version as the response ETag.
 *
 * Any single-entity response carrying a `version` gets `ETag: W/"<version>"`,
 * which is the value clients send back as `If-Match`. Setting the header
 * ourselves also takes precedence over Express's own content hash, so a
 * resource has exactly one ETag no matter which endpoint returned it.
 *
 * Collections keep Express's content-hash ETag — there is no single version to
 * describe them, and you never write to a collection URL anyway. Conditional
 * GETs keep working either way: Express compares `If-None-Match` against
 * whichever ETag ends up on the response and answers 304 itself.
 */
@Injectable()
export class EtagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((body: unknown) => {
        if (hasVersion(body) && !response.getHeader('ETag')) {
          response.setHeader('ETag', formatEtag(body.version));
        }

        return body;
      }),
    );
  }
}
