-- Ein Konto löschen, ohne das Archiv zu zerlöchern.
--
-- Der Austritt gab es schon: `active = false`, die Zeile bleibt stehen, damit
-- vergangene Abende weiter zeigen, wer gehostet hat. Was blieb, waren Name,
-- E-Mail und Geburtsdatum — und genau die will loswerden, wer sein Konto
-- löscht.
--
-- Hart löschen geht dafür nicht. Die Fremdschlüssel stehen bewusst zweigeteilt:
-- `SetNull` für die Zuschreibung (Gastgeber, Themen-Owner, wer ein Lied
-- eingetragen hat), `Cascade` für die Mitgliedschaft (wer welche Einheit
-- gehalten hat, Anwesenheiten, Actionstep-Haken). Ein `DELETE` nähme beides
-- mit: der Abend verlöre seinen Gastgeber *und* die Einheit ihre
-- Gehalten-von-Zeile. Also wird anonymisiert statt gelöscht.

-- Nullable heißt „anonymisiert". Der zusammengesetzte Index bleibt und trägt
-- beliebig viele davon: in Postgres ist NULL in einem eindeutigen Index von
-- jedem anderen NULL verschieden — dieselbe Eigenschaft, auf der schon
-- topic_session.meeting_id steht.
ALTER TABLE "person" ALTER COLUMN "email" DROP NOT NULL;

-- Neben `active = false` nötig: ein Austritt behält den Namen im Archiv, ein
-- Löschen nicht. Ohne diese Spalte ließen sich die beiden Zustände nicht
-- auseinanderhalten.
ALTER TABLE "person" ADD COLUMN "anonymized_at" TIMESTAMP(3);
