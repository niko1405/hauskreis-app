/**
 * Der Kopf, der bisher fehlte — und der Endpunkt, der seinen behalten darf.
 */
import { NoStoreInterceptor } from './no-store.interceptor';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';

function run(vorhanden?: string) {
  const headers = new Map<string, string>();
  if (vorhanden) headers.set('Cache-Control', vorhanden);

  const response = {
    getHeader: (name: string) => headers.get(name),
    setHeader: (name: string, value: string) => headers.set(name, value),
  };

  const context = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ExecutionContext;

  const next = { handle: () => of({ id: 'x' }) } as CallHandler;

  new NoStoreInterceptor().intercept(context, next);

  return headers.get('Cache-Control');
}

describe('NoStoreInterceptor', () => {
  it('verbietet dem Browser, die Antwort zu behalten', () => {
    expect(run()).toBe('no-store');
  });

  /**
   * Sonst lüde das Handy jedes Profilbild bei jedem Öffnen neu. Bilder haben
   * ihren eigenen Kopf, und der weiß es besser.
   */
  it('lässt einen gesetzten Kopf stehen', () => {
    expect(run('private, max-age=3600')).toBe('private, max-age=3600');
  });
});
