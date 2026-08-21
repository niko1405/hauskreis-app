-- „Mein Testimony habe ich schon erzählt."
--
-- Sein Testimony erzählt man einmal. Wer dran war, gehört deshalb nicht mehr in
-- die Vorschläge — und wer dran war, weiß die App aus den Abenden, die sie
-- kennt. Die kennt sie aber erst, seit es sie gibt: In einem Hauskreis, der
-- Jahre älter ist als die App, hätte sonst die halbe Gruppe ihr Testimony ein
-- zweites Mal vor sich.
--
-- Dieses Häkchen ist deshalb genau das, was die Daten nicht hergeben: „vorher,
-- außerhalb dieser App". Alles andere wird gerechnet.
ALTER TABLE "person"
  ADD COLUMN "testimony_told_before" BOOLEAN NOT NULL DEFAULT false;
