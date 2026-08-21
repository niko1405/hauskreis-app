import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';

/**
 * Keine zweite, unsichtbare Zwischenablage unter der App.
 *
 * Die JSON-Antworten trugen bisher **gar keinen** `Cache-Control` — nur die
 * beiden Bild-Endpunkte setzen einen. Eine Antwort ohne diesen Kopf, aber mit
 * `ETag`, darf der Browser trotzdem behalten: Er legt sie in seinen eigenen
 * Zwischenspeicher, fragt beim nächsten Mal mit seinem eigenen
 * `If-None-Match` nach, und wenn der Server `304` sagt, reicht er den **selbst
 * gespeicherten** Körper heraus. Der liegt auf der Platte und überlebt damit
 * auch das Schließen der App.
 *
 * Genau so sah es aus: Beim Öffnen stand ein alter Stand da, ein Zug zum
 * Aktualisieren brachte den richtigen, und nach dem nächsten Start war der
 * alte wieder zurück. Zwei Zwischenspeicher übereinander, von denen nur der
 * obere (`@tanstack/react-query`) weiß, wann er zu leeren ist.
 *
 * `no-store` nimmt den unteren weg. Die Ersparnis durch `304` bleibt
 * vollständig erhalten — sie hing nie am Browser: Der Client legt den ETag
 * neben die Daten in seinen eigenen Cache und schickt ihn selbst mit
 * (`client.ts`, `use-resource.ts`).
 *
 * Nebenbei ist es das Richtige für die Sache selbst: Wer wann wo ist, wer für
 * wen betet, wer welches Geschenk besorgt — das gehört nicht in den
 * Plattenspeicher eines Browsers, aus dem es niemand mehr herausbekommt.
 *
 * Ein Endpunkt, der es besser weiß, behält seinen Kopf: Die Profilbilder und
 * das Kopfbild setzen `private, max-age=3600` ausdrücklich, und ein Bild, das
 * sich fast nie ändert, jedes Mal neu zu laden wäre auf dem Handy teuer.
 */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();

    // Vor dem Handler und nicht danach: Bei einem `304` beantwortet Express
    // die Anfrage selbst, sobald der Körper geschrieben wird — ein Kopf, den
    // wir erst hinterher setzen, käme dafür zu spät.
    if (!response.getHeader('Cache-Control')) {
      response.setHeader('Cache-Control', 'no-store');
    }

    return next.handle();
  }
}
