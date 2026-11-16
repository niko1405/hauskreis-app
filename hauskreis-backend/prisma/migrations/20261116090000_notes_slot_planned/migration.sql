-- Die Nachbereitung wird geplant wie die übrigen Bausteine.
--
-- Bisher stand der Hinweis „Nachbereitung hinzufügen?" an jedem Abend ohne
-- Thema ab Terminbeginn, und der Baustein ging erst mit dem Speichern an. Jetzt
-- entscheidet der Baustein selbst, ob der Hinweis dasteht: von Hand angelegte
-- Abende haben ihn nicht, erzeugte ohne Thema (der Lobpreisabend) schon.
--
-- Damit die erzeugten Abende ohne Thema ihren Hinweis behalten — vergangene wie
-- kommende —, bekommen sie den Baustein nachträglich. Von Hand angelegte
-- bleiben aus, wie es die neue Vorgabe sagt. Wo schon eine Nachbereitung steht,
-- ist er ohnehin an.

UPDATE "meeting"
SET "has_notes_slot" = true
WHERE "generated" = true
  AND "has_topic_slot" = false
  AND "has_notes_slot" = false;
