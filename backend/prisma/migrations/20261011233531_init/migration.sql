-- CreateTable
CREATE TABLE `User` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(100) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `role` ENUM('ADMINISTRATOR', 'CLINICIAN', 'RESEARCHER') NOT NULL DEFAULT 'CLINICIAN',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_role_idx`(`role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Patient` (
    `id` CHAR(36) NOT NULL,
    `syntheticId` VARCHAR(24) NOT NULL,
    `firstName` VARCHAR(80) NOT NULL,
    `lastName` VARCHAR(80) NOT NULL,
    `dateOfBirth` DATE NOT NULL,
    `sex` ENUM('FEMALE', 'MALE', 'OTHER', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `researchCohort` VARCHAR(80) NOT NULL,
    `caseStatus` ENUM('ACTIVE', 'MONITORING', 'CLOSED') NOT NULL DEFAULT 'ACTIVE',
    `summary` TEXT NULL,
    `isSynthetic` BOOLEAN NOT NULL DEFAULT true,
    `createdById` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Patient_syntheticId_key`(`syntheticId`),
    INDEX `Patient_lastName_firstName_idx`(`lastName`, `firstName`),
    INDEX `Patient_caseStatus_idx`(`caseStatus`),
    INDEX `Patient_researchCohort_idx`(`researchCohort`),
    INDEX `Patient_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClinicalRecord` (
    `id` CHAR(36) NOT NULL,
    `patientId` CHAR(36) NOT NULL,
    `authorId` CHAR(36) NOT NULL,
    `type` ENUM('OBSERVATION', 'DIAGNOSTIC_NOTE', 'LAB_RESULT', 'PROCEDURE', 'FOLLOW_UP') NOT NULL DEFAULT 'OBSERVATION',
    `severity` ENUM('ROUTINE', 'ELEVATED', 'URGENT') NOT NULL DEFAULT 'ROUTINE',
    `title` VARCHAR(160) NOT NULL,
    `content` TEXT NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ClinicalRecord_patientId_recordedAt_idx`(`patientId`, `recordedAt`),
    INDEX `ClinicalRecord_authorId_idx`(`authorId`),
    INDEX `ClinicalRecord_type_idx`(`type`),
    INDEX `ClinicalRecord_severity_idx`(`severity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClinicalRecordRevision` (
    `id` CHAR(36) NOT NULL,
    `recordId` CHAR(36) NOT NULL,
    `version` INTEGER NOT NULL,
    `type` ENUM('OBSERVATION', 'DIAGNOSTIC_NOTE', 'LAB_RESULT', 'PROCEDURE', 'FOLLOW_UP') NOT NULL,
    `severity` ENUM('ROUTINE', 'ELEVATED', 'URGENT') NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `content` TEXT NOT NULL,
    `editedById` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ClinicalRecordRevision_recordId_version_key`(`recordId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MedicalImage` (
    `id` CHAR(36) NOT NULL,
    `patientId` CHAR(36) NOT NULL,
    `uploadedById` CHAR(36) NOT NULL,
    `originalName` VARCHAR(255) NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(60) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `modality` ENUM('XRAY', 'CT', 'MRI', 'ULTRASOUND', 'DERMATOSCOPY', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `description` VARCHAR(500) NULL,
    `processingStatus` ENUM('UPLOADED', 'ANALYZING', 'ANALYZED', 'FAILED') NOT NULL DEFAULT 'UPLOADED',
    `isSynthetic` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MedicalImage_storageKey_key`(`storageKey`),
    INDEX `MedicalImage_patientId_createdAt_idx`(`patientId`, `createdAt`),
    INDEX `MedicalImage_processingStatus_idx`(`processingStatus`),
    INDEX `MedicalImage_sha256_idx`(`sha256`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalysisResult` (
    `id` CHAR(36) NOT NULL,
    `imageId` CHAR(36) NOT NULL,
    `requestedById` CHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'UNAVAILABLE') NOT NULL DEFAULT 'PENDING',
    `mode` ENUM('EXPERIMENTAL_INFERENCE', 'DEMONSTRATION') NOT NULL DEFAULT 'EXPERIMENTAL_INFERENCE',
    `modelName` VARCHAR(80) NULL,
    `modelVersion` VARCHAR(80) NULL,
    `weightsSource` VARCHAR(160) NULL,
    `predictions` JSON NULL,
    `preprocessing` JSON NULL,
    `contextSnapshot` JSON NULL,
    `inferenceMs` INTEGER NULL,
    `totalMs` INTEGER NULL,
    `errorMessage` VARCHAR(500) NULL,
    `isSynthetic` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `AnalysisResult_imageId_idx`(`imageId`),
    INDEX `AnalysisResult_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `AnalysisResult_requestedById_idx`(`requestedById`),
    INDEX `AnalysisResult_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityLog` (
    `id` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NULL,
    `action` VARCHAR(60) NOT NULL,
    `entityType` VARCHAR(40) NOT NULL,
    `entityId` CHAR(36) NULL,
    `summary` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActivityLog_createdAt_idx`(`createdAt`),
    INDEX `ActivityLog_entityType_entityId_idx`(`entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Patient` ADD CONSTRAINT `Patient_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClinicalRecord` ADD CONSTRAINT `ClinicalRecord_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `Patient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClinicalRecord` ADD CONSTRAINT `ClinicalRecord_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClinicalRecordRevision` ADD CONSTRAINT `ClinicalRecordRevision_recordId_fkey` FOREIGN KEY (`recordId`) REFERENCES `ClinicalRecord`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClinicalRecordRevision` ADD CONSTRAINT `ClinicalRecordRevision_editedById_fkey` FOREIGN KEY (`editedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MedicalImage` ADD CONSTRAINT `MedicalImage_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `Patient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MedicalImage` ADD CONSTRAINT `MedicalImage_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnalysisResult` ADD CONSTRAINT `AnalysisResult_imageId_fkey` FOREIGN KEY (`imageId`) REFERENCES `MedicalImage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnalysisResult` ADD CONSTRAINT `AnalysisResult_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
