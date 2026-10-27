-- Add File table (PRD 6.6)
-- File metadata; actual file content stored on local disk

CREATE TABLE `files` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `conversation_id` BIGINT UNSIGNED NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `stored_name` VARCHAR(255) NOT NULL,
  `url` VARCHAR(512) NOT NULL,
  `size_bytes` BIGINT NOT NULL,
  `mime_type` VARCHAR(128) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `files_user_id_created_at_idx` (`user_id`, `created_at`),
  INDEX `files_conversation_id_idx` (`conversation_id`),
  CONSTRAINT `files_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `files_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
