import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { AppConfigService } from '../config/config.service';

/** Die Werkzeuge, die wir dem Modell erlauben. Mehr braucht es hier nicht. */
export type GeminiTool = { type: 'url_context' } | { type: 'google_search' };

/**
 * Zugang zur Gemini API — nur so viel davon, wie die Lied-Suche braucht.
 *
 * Nach dem Vorbild von `NotificationService`: fehlt der Schlüssel, schaltet
 * sich der Dienst ab, statt den Start zu verhindern. Eine App, die ohne
 * Gemini-Konto nicht mehr hochkommt, wäre für eine Bequemlichkeit beim
 * Lied-Anlegen ein schlechter Tausch.
 */
@Injectable()
export class GeminiClient implements OnModuleInit {
  private readonly logger = new Logger(GeminiClient.name);
  private client?: GoogleGenAI;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit(): void {
    const apiKey = this.config.get('GEMINI_API_KEY');

    if (!apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY ist nicht gesetzt — die Lied-Suche ist deaktiviert.',
      );
      return;
    }

    this.client = new GoogleGenAI({ apiKey });
  }

  get isEnabled(): boolean {
    return this.client !== undefined;
  }

  /**
   * Eine Frage, eine Antwort, festes Format.
   *
   * Das Ergebnis wird gegen `schema` geparst — dasselbe Schema geht als JSON
   * Schema mit in die Anfrage. Das Modell hält sich meistens daran; verlassen
   * wollen wir uns darauf nicht, deshalb wird trotzdem geprüft.
   *
   * Rückgabe `null` heißt „hat nicht geklappt" und nie mehr als das. Fällt
   * Google aus, ist der Schlüssel abgelaufen oder das Kontingent leer, soll im
   * Lied-Formular ein Vorschlag ausbleiben — kein 500er.
   */
  async ask<T>(params: {
    input: string;
    schema: z.ZodType<T>;
    tools: GeminiTool[];
    /**
     * Wie lange gewartet wird. Kein gemeinsamer Wert, weil die beiden Fragen
     * unterschiedlich lange brauchen: einen Seitenkopf auswerten dauert etwa
     * eine Sekunde, eine Suche mit anschließender Auswahl einige.
     */
    timeoutMs: number;
    systemInstruction?: string;
    /** Für die Verbrauchszeile im Log — sonst stehen dort nur nackte Zahlen. */
    label: string;
  }): Promise<T | null> {
    if (!this.client) return null;

    const startedAt = Date.now();

    try {
      const interaction = await this.client.interactions.create(
        {
          model: this.config.get('GEMINI_MODEL'),
          input: params.input,
          system_instruction: params.systemInstruction,
          tools: params.tools,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: toJsonSchema(params.schema),
          },
          generation_config: {
            // Titel von einer Seite ablesen und aus Suchtreffern den richtigen
            // wählen ist keine Denkaufgabe. Denk-Tokens werden als Ausgabe
            // abgerechnet und kosten außerdem Wartezeit vor dem Knopf.
            thinking_level: 'minimal',
            // Drei Kandidaten als JSON brauchen ein paar hundert Tokens. Die
            // Grenze bremst nichts Gewolltes, verhindert aber, dass eine aus
            // dem Ruder gelaufene Antwort den Knopf blockiert und Geld kostet.
            max_output_tokens: 800,
          },
        },
        // Kein automatischer zweiter Versuch: Er verdoppelt die Wartezeit vor
        // einem Knopf, an dem jemand steht, und kostet noch einmal dasselbe.
        // Wer nichts bekommt, drückt lieber selbst noch einmal.
        { timeout: params.timeoutMs, maxRetries: 0 },
      );

      this.logUsage(params.label, interaction.usage, startedAt);

      const text = interaction.output_text;
      if (!text) {
        this.logger.warn('Gemini hat eine leere Antwort geliefert.');
        return null;
      }

      const parsed = params.schema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        this.logger.warn(
          `Gemini-Antwort passt nicht zum Schema: ${z.prettifyError(parsed.error)}`,
        );
        return null;
      }

      return parsed.data;
    } catch (error) {
      this.logger.warn(
        `Gemini-Anfrage fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Was der Aufruf gekostet hat, in einer Zeile.
   *
   * Es gibt sonst keinen Weg, das zu erfahren, außer es aus der Monatsrechnung
   * zurückzurechnen — und dort steht nur eine Summe. Die Suchanfragen stehen
   * getrennt, weil sie separat abgerechnet werden und nicht an der Tokenzahl
   * abzulesen sind: ein Aufruf kann mehrere Suchen ausführen.
   */
  private logUsage(
    label: string,
    usage: { [key: string]: unknown } | undefined,
    startedAt: number,
  ): void {
    if (!usage) return;

    const searches = (
      (usage.grounding_tool_count as { count?: number }[] | undefined) ?? []
    ).reduce((sum, entry) => sum + (entry.count ?? 0), 0);

    this.logger.log(
      `${label}: ${Date.now() - startedAt} ms, ` +
        `${usage.total_input_tokens ?? 0} Tokens rein, ` +
        `${usage.total_output_tokens ?? 0} raus ` +
        `(davon ${usage.total_thought_tokens ?? 0} gedacht)` +
        (searches > 0 ? `, ${searches} Suchanfragen` : ''),
    );
  }
}

/**
 * Zod → JSON Schema für das `response_format`.
 *
 * `$schema` fliegt raus: Gemini nimmt eine Teilmenge von JSON Schema entgegen
 * und quittiert unbekannte Schlüssel auf oberster Ebene mit einem 400er.
 */
function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    io: 'output',
  });

  return rest;
}
