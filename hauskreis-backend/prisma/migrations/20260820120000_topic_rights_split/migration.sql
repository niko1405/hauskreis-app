-- Vorbereitung und Abend-Rolle trennen: das themaweite Schreibrecht wird
-- ausdrücklich vergeben statt automatisch erworben.
--
-- Bis hierher trug `join` jede:n, der eine Einheit hielt, zusätzlich als
-- Mitarbeiter:in ins Thema ein. Damit bekam jemand, der einmal an einem Abend
-- aushalf, Hoheit über ein Thema, das über Monate läuft. Ab jetzt vergibt das
-- nur noch der Owner von Hand (`POST …/topics/:id/collaborators`).
--
-- Alle bestehenden Zeilen sind ausnahmslos so entstanden — es gab nie einen
-- anderen Weg hinein. Sie fallen deshalb weg, damit die neue Regel auch für das
-- gilt, was schon dasteht. Verloren geht dabei nichts: Wer eine Einheit
-- vorbereitet hat, steht in `topic_session_responsible` und darf sie weiterhin
-- bearbeiten — nur eben nicht mehr das ganze Thema.
DELETE FROM "topic_collaborator";

-- Der ETag der Themen-Antwort kommt aus dieser Spalte. Ohne den Sprung zeigten
-- ausgelieferte Antworten nach dem Deploy weiter die alte Mitarbeiter-Liste,
-- weil der Server auf `If-None-Match` mit `304` antwortet.
UPDATE "topic" SET "version" = "version" + 1;
