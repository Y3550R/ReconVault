-- ReconVault Database Schema (Prototype)
-- MariaDB 10.13+ / MySQL 8.0+ compatible
-- 21 tables (17 core + sessions + 3 contributor junctions + 2 scan input) + triggers + stored procedures
-- 
-- IMPORTANT: Application must set @current_user_id session variable before
-- INSERT/UPDATE on targets, services, findings for contributor triggers to work:
--   SET @current_user_id = <user_id>;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `finding_contributors`;
DROP TABLE IF EXISTS `service_contributors`;
DROP TABLE IF EXISTS `target_contributors`;
DROP TABLE IF EXISTS `contributors`;
DROP TABLE IF EXISTS `scan_ports`;
DROP TABLE IF EXISTS `scan_hosts`;
DROP TABLE IF EXISTS `finding_services`;
DROP TABLE IF EXISTS `finding_targets`;
DROP TABLE IF EXISTS `findings`;
DROP TABLE IF EXISTS `services`;
DROP TABLE IF EXISTS `targets`;
DROP TABLE IF EXISTS `scans`;
DROP TABLE IF EXISTS `engagement_organizations`;
DROP TABLE IF EXISTS `engagement_members`;
DROP TABLE IF EXISTS `engagements`;
DROP TABLE IF EXISTS `clients`;
DROP TABLE IF EXISTS `pentesters`;
DROP TABLE IF EXISTS `administrators`;
DROP TABLE IF EXISTS `client_organizations`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `sessions`;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- USERS & ROLES (Overlapping subclasses)
-- ============================================================

CREATE TABLE `users` (
    `user_id` INT NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `administrators` (
    `user_id` INT NOT NULL,
    PRIMARY KEY (`user_id`),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pentesters` (
    `user_id` INT NOT NULL,
    PRIMARY KEY (`user_id`),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `client_organizations` (
    `organization_id` INT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `contact_information` TEXT,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`organization_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `clients` (
    `user_id` INT NOT NULL,
    `client_organization_id` INT,
    PRIMARY KEY (`user_id`),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE,
    FOREIGN KEY (`client_organization_id`) REFERENCES `client_organizations`(`organization_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ENGAGEMENTS & ASSIGNMENTS
-- ============================================================

CREATE TABLE `engagements` (
    `engagement_id` INT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT,
    `start_date` DATE NOT NULL,
    `end_date` DATE,
    `status` ENUM('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PLANNED',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`engagement_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `engagement_members` (
    `engagement_id` INT NOT NULL,
    `user_id` INT NOT NULL,
    PRIMARY KEY (`engagement_id`, `user_id`),
    FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`engagement_id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `engagement_organizations` (
    `engagement_id` INT NOT NULL,
    `organization_id` INT NOT NULL,
    PRIMARY KEY (`engagement_id`, `organization_id`),
    FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`engagement_id`) ON DELETE CASCADE,
    FOREIGN KEY (`organization_id`) REFERENCES `client_organizations`(`organization_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TARGETS & SERVICES
-- ============================================================

CREATE TABLE `targets` (
    `target_id` INT NOT NULL AUTO_INCREMENT,
    `engagement_id` INT NOT NULL,
    `ip_type` ENUM('IPV4', 'IPV6') NOT NULL,
    `ip_address` VARCHAR(39) NOT NULL,
    `domain_name` VARCHAR(253),
    `hostname` VARCHAR(63),
    `description` TEXT,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `operating_system` VARCHAR(255),
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`target_id`),
    FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`engagement_id`) ON DELETE CASCADE,
    INDEX `idx_targets_engagement` (`engagement_id`),
    INDEX `idx_targets_ip` (`ip_address`),
    UNIQUE INDEX `uk_targets_engagement_ip` (`engagement_id`, `ip_address`, `ip_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `services` (
    `service_id` INT NOT NULL AUTO_INCREMENT,
    `target_id` INT NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `port` INT NOT NULL,
    `protocol` VARCHAR(20) NOT NULL DEFAULT 'TCP',
    `version` VARCHAR(100),
    `state` ENUM('UNKNOWN', 'OPEN', 'CLOSED', 'FILTERED') NOT NULL DEFAULT 'UNKNOWN',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`service_id`),
    FOREIGN KEY (`target_id`) REFERENCES `targets`(`target_id`) ON DELETE CASCADE,
    INDEX `idx_services_target` (`target_id`),
    INDEX `idx_services_port` (`port`),
    UNIQUE INDEX `uk_services_target_port_proto` (`target_id`, `port`, `protocol`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- FINDINGS
-- ============================================================

CREATE TABLE `findings` (
    `finding_id` INT NOT NULL AUTO_INCREMENT,
    `engagement_id` INT NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NOT NULL,
    `severity` ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO') NOT NULL,
    `status` ENUM('OPEN', 'IN PROGRESS', 'RESOLVED', 'ACCEPTED') NOT NULL DEFAULT 'OPEN',
    `discovered_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `resolved_at` DATETIME,
    `creator_user_id` INT NOT NULL,
    `references` TEXT,
    `cvss_vector` VARCHAR(100),
    `remediation` TEXT,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`finding_id`),
    FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`engagement_id`) ON DELETE CASCADE,
    FOREIGN KEY (`creator_user_id`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT,
    INDEX `idx_findings_engagement` (`engagement_id`),
    INDEX `idx_findings_severity` (`severity`),
    INDEX `idx_findings_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `finding_targets` (
    `finding_id` INT NOT NULL,
    `target_id` INT NOT NULL,
    PRIMARY KEY (`finding_id`, `target_id`),
    FOREIGN KEY (`finding_id`) REFERENCES `findings`(`finding_id`) ON DELETE CASCADE,
    FOREIGN KEY (`target_id`) REFERENCES `targets`(`target_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `finding_services` (
    `finding_id` INT NOT NULL,
    `service_id` INT NOT NULL,
    PRIMARY KEY (`finding_id`, `service_id`),
    FOREIGN KEY (`finding_id`) REFERENCES `findings`(`finding_id`) ON DELETE CASCADE,
    FOREIGN KEY (`service_id`) REFERENCES `services`(`service_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SCANS (must be before CONTRIBUTORS for FK)
-- ============================================================

CREATE TABLE `scans` (
    `scan_id` INT NOT NULL AUTO_INCREMENT,
    `engagement_id` INT NOT NULL,
    `creator_user_id` INT NOT NULL,
    `runner_user_id` INT,
    `canceller_user_id` INT,
    `scan_type` ENUM('HOST', 'PORT') NOT NULL DEFAULT 'PORT',
    `status` ENUM('READY', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'READY',
    `description` TEXT,
    `target_ip_type` ENUM('IPV4', 'IPV6'),
    `target_ip_address` VARCHAR(39),
    `runner_pid` INT,
    `nmap_output` LONGTEXT,
    `error_message` TEXT,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `started_at` DATETIME,
    `finished_at` DATETIME,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`scan_id`),
    FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`engagement_id`) ON DELETE CASCADE,
    FOREIGN KEY (`creator_user_id`) REFERENCES `users`(`user_id`) ON DELETE RESTRICT,
    FOREIGN KEY (`runner_user_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL,
    FOREIGN KEY (`canceller_user_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL,
    INDEX `idx_scans_engagement` (`engagement_id`),
    INDEX `idx_scans_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SCAN INPUT TABLES (per scan_type)
-- ============================================================

CREATE TABLE `scan_hosts` (
    `scan_host_id` INT NOT NULL AUTO_INCREMENT,
    `scan_id` INT NOT NULL,
    `ip_type` ENUM('IPV4', 'IPV6') NOT NULL,
    `ip_address_or_cidr` VARCHAR(43) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`scan_host_id`),
    FOREIGN KEY (`scan_id`) REFERENCES `scans`(`scan_id`) ON DELETE CASCADE,
    INDEX `idx_scan_hosts_scan` (`scan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `scan_ports` (
    `scan_port_id` INT NOT NULL AUTO_INCREMENT,
    `scan_id` INT NOT NULL,
    `port_start` INT NOT NULL,
    `port_end` INT NOT NULL,
    `protocol` VARCHAR(10) NOT NULL DEFAULT 'TCP',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`scan_port_id`),
    FOREIGN KEY (`scan_id`) REFERENCES `scans`(`scan_id`) ON DELETE CASCADE,
    INDEX `idx_scan_ports_scan` (`scan_id`),
    CHECK (`port_start` >= 1 AND `port_start` <= 65535),
    CHECK (`port_end` >= 1 AND `port_end` <= 65535),
    CHECK (`port_end` >= `port_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- CONTRIBUTORS (Polymorphic: PENTESTER or SCAN)
-- ============================================================

CREATE TABLE `contributors` (
    `contributor_id` INT NOT NULL AUTO_INCREMENT,
    `contributor_type` ENUM('SCAN', 'PENTESTER') NOT NULL,
    `user_id` INT,
    `scan_id` INT,
    PRIMARY KEY (`contributor_id`),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL,
    FOREIGN KEY (`scan_id`) REFERENCES `scans`(`scan_id`) ON DELETE SET NULL,
    INDEX `idx_contributors_type_user` (`contributor_type`, `user_id`),
    INDEX `idx_contributors_type_scan` (`contributor_type`, `scan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `target_contributors` (
    `contributor_id` INT NOT NULL,
    `target_id` INT NOT NULL,
    PRIMARY KEY (`contributor_id`, `target_id`),
    FOREIGN KEY (`contributor_id`) REFERENCES `contributors`(`contributor_id`) ON DELETE CASCADE,
    FOREIGN KEY (`target_id`) REFERENCES `targets`(`target_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `service_contributors` (
    `contributor_id` INT NOT NULL,
    `service_id` INT NOT NULL,
    PRIMARY KEY (`contributor_id`, `service_id`),
    FOREIGN KEY (`contributor_id`) REFERENCES `contributors`(`contributor_id`) ON DELETE CASCADE,
    FOREIGN KEY (`service_id`) REFERENCES `services`(`service_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `finding_contributors` (
    `contributor_id` INT NOT NULL,
    `finding_id` INT NOT NULL,
    PRIMARY KEY (`contributor_id`, `finding_id`),
    FOREIGN KEY (`contributor_id`) REFERENCES `contributors`(`contributor_id`) ON DELETE CASCADE,
    FOREIGN KEY (`finding_id`) REFERENCES `findings`(`finding_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SESSION TABLE (express-mysql-session)
-- ============================================================

CREATE TABLE `sessions` (
    `session_id` VARCHAR(128) NOT NULL COLLATE 'utf8mb4_bin',
    `expires` INT UNSIGNED NOT NULL,
    `data` MEDIUMTEXT COLLATE 'utf8mb4_bin',
    PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- ============================================================
-- TRIGGERS
-- ============================================================

DELIMITER $$

-- Target contributors (INSERT)
CREATE TRIGGER `trg_target_after_insert` AFTER INSERT ON `targets`
FOR EACH ROW BEGIN
    INSERT INTO `contributors` (`contributor_type`, `user_id`) VALUES ('PENTESTER', @current_user_id);
    INSERT INTO `target_contributors` (`contributor_id`, `target_id`) VALUES (LAST_INSERT_ID(), NEW.target_id);
END$$

-- Target contributors (UPDATE)
CREATE TRIGGER `trg_target_after_update` AFTER UPDATE ON `targets`
FOR EACH ROW BEGIN
    INSERT INTO `contributors` (`contributor_type`, `user_id`) VALUES ('PENTESTER', @current_user_id);
    INSERT INTO `target_contributors` (`contributor_id`, `target_id`) VALUES (LAST_INSERT_ID(), NEW.target_id);
END$$

-- Service contributors (INSERT)
CREATE TRIGGER `trg_service_after_insert` AFTER INSERT ON `services`
FOR EACH ROW BEGIN
    INSERT INTO `contributors` (`contributor_type`, `user_id`) VALUES ('PENTESTER', @current_user_id);
    INSERT INTO `service_contributors` (`contributor_id`, `service_id`) VALUES (LAST_INSERT_ID(), NEW.service_id);
END$$

-- Service contributors (UPDATE)
CREATE TRIGGER `trg_service_after_update` AFTER UPDATE ON `services`
FOR EACH ROW BEGIN
    INSERT INTO `contributors` (`contributor_type`, `user_id`) VALUES ('PENTESTER', @current_user_id);
    INSERT INTO `service_contributors` (`contributor_id`, `service_id`) VALUES (LAST_INSERT_ID(), NEW.service_id);
END$$

-- Finding contributors (INSERT)
CREATE TRIGGER `trg_finding_after_insert` AFTER INSERT ON `findings`
FOR EACH ROW BEGIN
    INSERT INTO `contributors` (`contributor_type`, `user_id`) VALUES ('PENTESTER', @current_user_id);
    INSERT INTO `finding_contributors` (`contributor_id`, `finding_id`) VALUES (LAST_INSERT_ID(), NEW.finding_id);
END$$

-- Finding contributors (UPDATE)
CREATE TRIGGER `trg_finding_after_update` AFTER UPDATE ON `findings`
FOR EACH ROW BEGIN
    INSERT INTO `contributors` (`contributor_type`, `user_id`) VALUES ('PENTESTER', @current_user_id);
    INSERT INTO `finding_contributors` (`contributor_id`, `finding_id`) VALUES (LAST_INSERT_ID(), NEW.finding_id);
END$$

-- Scan finished_at on terminal status change
CREATE TRIGGER `trg_scan_before_update` BEFORE UPDATE ON `scans`
FOR EACH ROW BEGIN
    IF NEW.status IN ('COMPLETED', 'FAILED', 'CANCELLED') AND OLD.status NOT IN ('COMPLETED', 'FAILED', 'CANCELLED') THEN
        SET NEW.finished_at = NOW();
    END IF;
END$$

DELIMITER ;

-- ============================================================
-- STORED PROCEDURES
-- ============================================================

DELIMITER $$

-- Get Engagement Summary
CREATE PROCEDURE `sp_get_engagement_summary`(IN p_engagement_id INT)
BEGIN
    SELECT
        e.*,
        (SELECT COUNT(*) FROM targets WHERE engagement_id = e.engagement_id) AS target_count,
        (SELECT COUNT(*) FROM services s JOIN targets t ON s.target_id = t.target_id WHERE t.engagement_id = e.engagement_id) AS service_count,
        (SELECT COUNT(*) FROM findings WHERE engagement_id = e.engagement_id) AS finding_count,
        (SELECT COUNT(*) FROM scans WHERE engagement_id = e.engagement_id) AS scan_count
    FROM engagements e
    WHERE e.engagement_id = p_engagement_id;
END$$

-- Get Engagement Findings
CREATE PROCEDURE `sp_get_engagement_findings`(IN p_engagement_id INT)
BEGIN
    SELECT
        f.*,
        GROUP_CONCAT(DISTINCT t.ip_address) AS target_ips,
        GROUP_CONCAT(DISTINCT CONCAT(s.name, ':', s.port)) AS services
    FROM findings f
    LEFT JOIN finding_targets ft ON f.finding_id = ft.finding_id
    LEFT JOIN targets t ON ft.target_id = t.target_id
    LEFT JOIN finding_services fs ON f.finding_id = fs.finding_id
    LEFT JOIN services s ON fs.service_id = s.service_id
    WHERE f.engagement_id = p_engagement_id
    GROUP BY f.finding_id
    ORDER BY
        CASE f.severity
            WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3
            WHEN 'LOW' THEN 4 WHEN 'INFO' THEN 5 ELSE 6 END,
        f.discovered_at DESC;
END$$

-- Get Target Reconnaissance
CREATE PROCEDURE `sp_get_target_recon`(IN p_target_id INT)
BEGIN
    SELECT t.* FROM targets t WHERE t.target_id = p_target_id;
    SELECT * FROM services WHERE target_id = p_target_id ORDER BY port;
    SELECT f.* FROM findings f
    JOIN finding_targets ft ON f.finding_id = ft.finding_id
    WHERE ft.target_id = p_target_id
    ORDER BY
        CASE f.severity
            WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3
            WHEN 'LOW' THEN 4 WHEN 'INFO' THEN 5 ELSE 6 END;
END$$

-- Get Scan Results
CREATE PROCEDURE `sp_get_scan_results`(IN p_scan_id INT)
BEGIN
    SELECT s.* FROM scans s WHERE s.scan_id = p_scan_id;
    -- Scan-to-target/service/finding links deferred (no scan_* junction tables in prototype)
END$$

-- Get User Engagements
CREATE PROCEDURE `sp_get_user_engagements`(IN p_user_id INT, IN p_role VARCHAR(20))
BEGIN
    IF p_role = 'ADMIN' THEN
        SELECT * FROM engagements ORDER BY created_at DESC;
    ELSEIF p_role = 'PENTESTER' THEN
        SELECT e.* FROM engagements e
        JOIN engagement_members em ON e.engagement_id = em.engagement_id
        WHERE em.user_id = p_user_id
        ORDER BY e.created_at DESC;
    ELSEIF p_role = 'CLIENT' THEN
        SELECT e.* FROM engagements e
        JOIN engagement_organizations eo ON e.engagement_id = eo.engagement_id
        JOIN clients c ON eo.organization_id = c.client_organization_id
        WHERE c.user_id = p_user_id
        ORDER BY e.created_at DESC;
    END IF;
END$$

-- Get Open Findings
CREATE PROCEDURE `sp_get_open_findings`(IN p_engagement_id INT, IN p_severity VARCHAR(20))
BEGIN
    SELECT f.* FROM findings f
    WHERE f.status IN ('OPEN', 'IN PROGRESS')
    AND (p_engagement_id IS NULL OR f.engagement_id = p_engagement_id)
    AND (p_severity IS NULL OR f.severity = p_severity)
    ORDER BY
        CASE f.severity
            WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3
            WHEN 'LOW' THEN 4 WHEN 'INFO' THEN 5 ELSE 6 END,
        f.discovered_at DESC;
END$$

DELIMITER ;