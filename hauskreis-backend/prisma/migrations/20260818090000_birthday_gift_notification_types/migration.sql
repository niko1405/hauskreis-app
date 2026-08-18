-- Die drei neuen Benachrichtigungsarten, und sie stehen bewusst allein in
-- dieser Datei.
--
-- Postgres darf einen frisch hinzugefügten Enum-Wert nicht in derselben
-- Transaktion benutzen, in der er entstanden ist. Prisma fährt jede
-- Migrationsdatei als eine Transaktion — stünde die nächste Migration hier mit
-- drin, scheiterte der Lauf mit "unsafe use of new value". Dieselbe Trennung
-- wie bei `20260806100000_testimony_role_enums`.

ALTER TYPE "notification_type" ADD VALUE 'BIRTHDAY_GIFT_ASSIGNED';

ALTER TYPE "notification_type" ADD VALUE 'BIRTHDAY_GIFT_REMINDER';

ALTER TYPE "notification_type" ADD VALUE 'BIRTHDAY_GIFT_DECIDED';
