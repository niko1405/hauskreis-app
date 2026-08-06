-- Die zwei neuen Enum-Werte, und sie stehen bewusst allein in dieser Datei.
--
-- Postgres darf einen frisch hinzugefügten Enum-Wert nicht in derselben
-- Transaktion benutzen, in der er entstanden ist. Prisma fährt jede
-- Migrationsdatei als eine Transaktion — stünde das Nachziehen der Daten hier
-- mit drin, scheiterte der Lauf mit "unsafe use of new value".

ALTER TYPE "assignment_role" ADD VALUE 'TESTIMONY';

ALTER TYPE "notification_type" ADD VALUE 'TESTIMONY_REMINDER';
