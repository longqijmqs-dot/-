-- Message 表加 attachments 字段（JSON，默认空数组）
-- MariaDB 的 JSON 是 LONGTEXT 别名，不支持 DEFAULT 表达式，改为可空，代码层兜底空数组
ALTER TABLE `messages` ADD COLUMN `attachments` JSON NULL;