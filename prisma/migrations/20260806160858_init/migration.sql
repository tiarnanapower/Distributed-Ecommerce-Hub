-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobTitle" TEXT,
    "role" TEXT NOT NULL DEFAULT 'COMPANY_ADMIN',
    "avatarColor" TEXT NOT NULL DEFAULT '#2563eb',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "activeCompanyId" TEXT,
    "activeStoreId" TEXT,
    "activeChannelId" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT,
    "reportingCurrency" TEXT NOT NULL DEFAULT 'USD',
    "defaultLocale" TEXT NOT NULL DEFAULT 'en-US',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "logoInitials" TEXT NOT NULL DEFAULT 'CC',
    "accentColor" TEXT NOT NULL DEFAULT '#2563eb',
    "planTier" TEXT NOT NULL DEFAULT 'Enterprise',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "OrganisationMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'COMPANY_ADMIN',
    "companyScopeJson" TEXT NOT NULL DEFAULT '[]',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrganisationMembership_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrganisationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "businessModel" TEXT NOT NULL DEFAULT 'B2C',
    "reportingCurrency" TEXT NOT NULL DEFAULT 'USD',
    "headquarters" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#2563eb',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Company_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "countriesCsv" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Region_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Region_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL DEFAULT '#0f172a',
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Brand_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isProduction" BOOLEAN NOT NULL DEFAULT false,
    "guardrailLevel" TEXT NOT NULL DEFAULT 'STANDARD',
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Environment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StoreGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'OPERATIONAL',
    "colorHex" TEXT NOT NULL DEFAULT '#64748b',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "StoreGroup_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoreGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StoreGroupMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeGroupId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreGroupMember_storeGroupId_fkey" FOREIGN KEY ("storeGroupId") REFERENCES "StoreGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoreGroupMember_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StoreConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "regionId" TEXT,
    "brandId" TEXT,
    "environmentId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "storeHash" TEXT,
    "connectionType" TEXT NOT NULL DEFAULT 'INDEPENDENT',
    "hierarchyMode" TEXT NOT NULL DEFAULT 'INDEPENDENT',
    "classification" TEXT NOT NULL DEFAULT 'B2C',
    "masterConnectionId" TEXT,
    "templateId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "healthStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "healthMessage" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "countryCode" TEXT NOT NULL DEFAULT 'US',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "primaryDomain" TEXT,
    "controlPanelUrl" TEXT,
    "platformPlan" TEXT,
    "msfEnabled" BOOLEAN NOT NULL DEFAULT false,
    "storefrontLimit" INTEGER,
    "storefrontsUsed" INTEGER,
    "catalogVersion" TEXT,
    "activeThemeName" TEXT,
    "activeThemeVersion" TEXT,
    "lastSuccessfulSyncAt" DATETIME,
    "lastFailedSyncAt" DATETIME,
    "lastErrorSummary" TEXT,
    "lastVerifiedAt" DATETIME,
    "connectedAt" DATETIME,
    "notes" TEXT,
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "StoreConnection_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoreConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoreConnection_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StoreConnection_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StoreConnection_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StoreConnection_masterConnectionId_fkey" FOREIGN KEY ("masterConnectionId") REFERENCES "StoreConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StoreConnection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ConfigurationTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StorefrontChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalChannelId" INTEGER,
    "externalSiteId" INTEGER,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'bigcommerce',
    "channelType" TEXT NOT NULL DEFAULT 'storefront',
    "status" TEXT NOT NULL DEFAULT 'active',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isListableFromUI" BOOLEAN NOT NULL DEFAULT true,
    "siteUrl" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "countryCode" TEXT NOT NULL DEFAULT 'US',
    "themeName" TEXT,
    "catalogMode" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "productCount" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "StorefrontChannel_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StorefrontChannel_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StoreRelationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "establishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detachedAt" DATETIME,
    "notes" TEXT,
    CONSTRAINT "StoreRelationship_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoreRelationship_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoreRelationship_childId_fkey" FOREIGN KEY ("childId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConfigurationTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "scopeLevel" TEXT NOT NULL DEFAULT 'ORGANISATION',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sourceConnectionId" TEXT,
    "valuesJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "ConfigurationTemplate_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConfigurationTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConfigurationTemplate_sourceConnectionId_fkey" FOREIGN KEY ("sourceConnectionId") REFERENCES "StoreConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InheritancePolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "resourceCategory" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'MASTER_STORE',
    "sourceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InheritancePolicy_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResourceOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "channelId" TEXT,
    "channelScope" TEXT NOT NULL DEFAULT 'store',
    "resourceCategory" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "resourceLabel" TEXT,
    "valueJson" TEXT NOT NULL,
    "previousValueJson" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "setByUserId" TEXT,
    "setAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceChangedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ResourceOverride_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ResourceOverride_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ResourceOverride_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ResourceOverride_setByUserId_fkey" FOREIGN KEY ("setByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StoreCapability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "channelId" TEXT,
    "capabilityKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requiredScope" TEXT,
    "channelApplicable" BOOLEAN NOT NULL DEFAULT false,
    "storeEligible" BOOLEAN NOT NULL DEFAULT true,
    "planDependency" TEXT,
    "unavailableReason" TEXT,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "isReversible" BOOLEAN NOT NULL DEFAULT true,
    "verificationSource" TEXT NOT NULL DEFAULT 'STATIC_REGISTRY',
    "lastVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreCapability_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoreCapability_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoreCapability_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CredentialRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "credentialType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "maskedHint" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "scopesJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "lastValidatedAt" DATETIME,
    "lastValidationError" TEXT,
    "rotatedAt" DATETIME,
    "expiresAt" DATETIME,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CredentialRecord_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CredentialRecord_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CredentialRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "companyId" TEXT,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "resourceCategory" TEXT,
    "correlationId" TEXT NOT NULL,
    "isDryRun" BOOLEAN NOT NULL DEFAULT false,
    "initiatedByUserId" TEXT,
    "sourceConnectionId" TEXT,
    "deploymentId" TEXT,
    "scheduledFor" DATETIME,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "dryRunResultJson" TEXT,
    "parametersJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SyncJob_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SyncJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SyncJob_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SyncJob_sourceConnectionId_fkey" FOREIGN KEY ("sourceConnectionId") REFERENCES "StoreConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SyncJob_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncJobTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "channelId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    CONSTRAINT "SyncJobTarget_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SyncJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SyncJobTarget_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SyncJobTarget_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncJobItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "targetId" TEXT,
    "connectionId" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "resourceLabel" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "message" TEXT,
    "durationMs" INTEGER,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncJobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SyncJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SyncJobItem_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "SyncJobTarget" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SyncJobItem_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "resourceCategory" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "strategy" TEXT NOT NULL DEFAULT 'COPY_ONCE',
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "sourceConnectionId" TEXT,
    "sourceTemplateId" TEXT,
    "createdByUserId" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvalRequestId" TEXT,
    "scheduledFor" DATETIME,
    "dryRunAt" DATETIME,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "dryRunSummaryJson" TEXT,
    "blastRadiusJson" TEXT,
    "rollbackInfoJson" TEXT,
    "preserveLocalOverrides" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deployment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deployment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deployment_sourceConnectionId_fkey" FOREIGN KEY ("sourceConnectionId") REFERENCES "StoreConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deployment_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "ConfigurationTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deployment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeploymentTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deploymentId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "channelId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "plannedCount" INTEGER NOT NULL DEFAULT 0,
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "hasLocalOverrides" BOOLEAN NOT NULL DEFAULT false,
    "requiresManualAction" BOOLEAN NOT NULL DEFAULT false,
    "unsupportedReason" TEXT,
    "errorSummary" TEXT,
    CONSTRAINT "DeploymentTarget_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeploymentTarget_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeploymentTarget_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeploymentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deploymentId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "resourceLabel" TEXT,
    "changeType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "validationJson" TEXT,
    "isDestructive" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    CONSTRAINT "DeploymentItem_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeploymentItem_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "DeploymentTarget" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT,
    "changeSummary" TEXT,
    "targetScope" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requesterId" TEXT NOT NULL,
    "approverId" TEXT,
    "decisionComment" TEXT,
    "decidedAt" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApprovalRequest_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApprovalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApprovalRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Conflict" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "resourceCategory" TEXT NOT NULL,
    "conflictType" TEXT NOT NULL,
    "sourceConnectionId" TEXT,
    "targetConnectionId" TEXT NOT NULL,
    "channelId" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "resourceLabel" TEXT,
    "sourceValueJson" TEXT,
    "targetValueJson" TEXT,
    "diffJson" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "Conflict_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Conflict_sourceConnectionId_fkey" FOREIGN KEY ("sourceConnectionId") REFERENCES "StoreConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Conflict_targetConnectionId_fkey" FOREIGN KEY ("targetConnectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Conflict_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConflictResolution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conflictId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resolvedByUserId" TEXT,
    "note" TEXT,
    "appliedJobId" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'RECORDED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConflictResolution_conflictId_fkey" FOREIGN KEY ("conflictId") REFERENCES "Conflict" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConflictResolution_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "channelId" TEXT,
    "externalProductId" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productType" TEXT NOT NULL DEFAULT 'physical',
    "brandName" TEXT,
    "price" TEXT NOT NULL DEFAULT '0.00',
    "salePrice" TEXT,
    "retailPrice" TEXT,
    "costPrice" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "inventoryLevel" INTEGER,
    "inventoryTracking" TEXT NOT NULL DEFAULT 'none',
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "availability" TEXT NOT NULL DEFAULT 'available',
    "categoriesJson" TEXT NOT NULL DEFAULT '[]',
    "channelsJson" TEXT NOT NULL DEFAULT '[]',
    "customFieldsJson" TEXT NOT NULL DEFAULT '[]',
    "imageUrl" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "weight" TEXT,
    "variantCount" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'DEMO',
    "externalModifiedAt" DATETIME,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductSnapshot_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductSnapshot_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductSnapshot_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "masterConnectionId" TEXT NOT NULL,
    "masterProductId" INTEGER NOT NULL,
    "masterSku" TEXT NOT NULL,
    "targetConnectionId" TEXT NOT NULL,
    "targetProductId" INTEGER,
    "targetSku" TEXT,
    "mappingStatus" TEXT NOT NULL DEFAULT 'MAPPED',
    "matchStrategy" TEXT NOT NULL DEFAULT 'SKU',
    "confidence" REAL NOT NULL DEFAULT 1,
    "driftFieldsJson" TEXT NOT NULL DEFAULT '[]',
    "lastComparedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductMapping_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductMapping_masterConnectionId_fkey" FOREIGN KEY ("masterConnectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductMapping_targetConnectionId_fkey" FOREIGN KEY ("targetConnectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CategoryMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "masterConnectionId" TEXT NOT NULL,
    "masterCategoryId" INTEGER NOT NULL,
    "masterPath" TEXT NOT NULL,
    "targetConnectionId" TEXT NOT NULL,
    "targetCategoryId" INTEGER,
    "targetPath" TEXT,
    "mappingStatus" TEXT NOT NULL DEFAULT 'MAPPED',
    "matchStrategy" TEXT NOT NULL DEFAULT 'PATH',
    "lastComparedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CategoryMapping_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CategoryMapping_masterConnectionId_fkey" FOREIGN KEY ("masterConnectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CategoryMapping_targetConnectionId_fkey" FOREIGN KEY ("targetConnectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceListSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalPriceListId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "currencyCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "assignmentsJson" TEXT NOT NULL DEFAULT '[]',
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceListSnapshot_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PriceListSnapshot_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PricingEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "channelId" TEXT,
    "channelScope" TEXT NOT NULL DEFAULT 'store',
    "sku" TEXT NOT NULL,
    "externalProductId" INTEGER,
    "variantSku" TEXT,
    "currencyCode" TEXT NOT NULL,
    "basePrice" TEXT NOT NULL,
    "salePrice" TEXT,
    "retailPrice" TEXT,
    "costPrice" TEXT,
    "priceListExternalId" INTEGER,
    "priceListName" TEXT,
    "customerGroupExternalId" INTEGER,
    "customerGroupName" TEXT,
    "effectiveFrom" DATETIME,
    "effectiveTo" DATETIME,
    "origin" TEXT NOT NULL DEFAULT 'BASE',
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PricingEntry_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PricingEntry_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PricingEntry_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "channelId" TEXT,
    "locationExternalId" INTEGER,
    "locationName" TEXT,
    "sku" TEXT NOT NULL,
    "externalProductId" INTEGER,
    "externalVariantId" INTEGER,
    "productName" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "safetyStock" INTEGER NOT NULL DEFAULT 0,
    "buffer" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
    "strategy" TEXT NOT NULL DEFAULT 'INDEPENDENT',
    "dataSource" TEXT NOT NULL DEFAULT 'DEMO',
    "externalUpdatedAt" DATETIME,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryRecord_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryRecord_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryRecord_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "channelId" TEXT,
    "externalOrderId" INTEGER NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "statusLabel" TEXT NOT NULL,
    "statusCategory" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'unknown',
    "fulfilmentStatus" TEXT NOT NULL DEFAULT 'unfulfilled',
    "refundStatus" TEXT NOT NULL DEFAULT 'none',
    "currencyCode" TEXT NOT NULL,
    "subtotal" TEXT NOT NULL DEFAULT '0.00',
    "shippingTotal" TEXT NOT NULL DEFAULT '0.00',
    "taxTotal" TEXT NOT NULL DEFAULT '0.00',
    "discountTotal" TEXT NOT NULL DEFAULT '0.00',
    "grandTotal" TEXT NOT NULL DEFAULT '0.00',
    "refundedTotal" TEXT NOT NULL DEFAULT '0.00',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "customerExternalId" INTEGER,
    "customerName" TEXT,
    "customerEmailMasked" TEXT,
    "countryCode" TEXT,
    "paymentMethod" TEXT,
    "orderSource" TEXT,
    "staffNotes" TEXT,
    "placedAt" DATETIME NOT NULL,
    "externalUpdatedAt" DATETIME,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "OrderSnapshot_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderSnapshot_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderSnapshot_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderLineSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" TEXT NOT NULL,
    "lineTotal" TEXT NOT NULL,
    "externalProductId" INTEGER,
    "variantLabel" TEXT,
    CONSTRAINT "OrderLineSnapshot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "actor" TEXT,
    CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "channelId" TEXT,
    "externalCustomerId" INTEGER NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "emailMasked" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "phoneMasked" TEXT,
    "company" TEXT,
    "customerGroupExternalId" INTEGER,
    "customerGroupName" TEXT,
    "countryCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "acceptsMarketing" BOOLEAN NOT NULL DEFAULT false,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "lifetimeValue" TEXT NOT NULL DEFAULT '0.00',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "storeCredit" TEXT NOT NULL DEFAULT '0.00',
    "externalCreatedAt" DATETIME,
    "lastOrderAt" DATETIME,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerSnapshot_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerSnapshot_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerSnapshot_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerGroupTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isDefaultGroup" BOOLEAN NOT NULL DEFAULT false,
    "discountType" TEXT NOT NULL DEFAULT 'NONE',
    "discountValue" TEXT NOT NULL DEFAULT '0.00',
    "categoryAccessJson" TEXT NOT NULL DEFAULT '{"type":"all"}',
    "priceListRefsJson" TEXT NOT NULL DEFAULT '[]',
    "channelAssignmentJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerGroupTemplate_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerGroupTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerGroupMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "templateId" TEXT,
    "connectionId" TEXT NOT NULL,
    "externalGroupId" INTEGER,
    "externalGroupName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNMANAGED',
    "discountSummary" TEXT,
    "memberCount" INTEGER,
    "lastDeployedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerGroupMapping_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerGroupMapping_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CustomerGroupTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CustomerGroupMapping_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ThemeRelease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "packageFileName" TEXT,
    "packageSizeBytes" INTEGER,
    "checksum" TEXT,
    "releaseNotes" TEXT,
    "compatibilityJson" TEXT NOT NULL DEFAULT '{}',
    "isSimulated" BOOLEAN NOT NULL DEFAULT true,
    "uploadedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ThemeRelease_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ThemeRelease_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ThemeAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "channelId" TEXT,
    "themeReleaseId" TEXT,
    "activeThemeName" TEXT NOT NULL,
    "activeThemeVersion" TEXT NOT NULL,
    "externalThemeUuid" TEXT,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "hasLocalModifications" BOOLEAN NOT NULL DEFAULT false,
    "localModificationSummary" TEXT,
    "configSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "previewUrl" TEXT,
    "deployedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ThemeAssignment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ThemeAssignment_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ThemeAssignment_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ThemeAssignment_themeReleaseId_fkey" FOREIGN KEY ("themeReleaseId") REFERENCES "ThemeRelease" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "connectionId" TEXT,
    "channelId" TEXT,
    "scopeLevel" TEXT NOT NULL DEFAULT 'STORE',
    "scopeRefId" TEXT,
    "contentType" TEXT NOT NULL,
    "externalId" TEXT,
    "contentKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "bodyJson" TEXT NOT NULL DEFAULT '{}',
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "checksum" TEXT,
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "inheritedFromId" TEXT,
    "scheduledFor" DATETIME,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentSnapshot_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentSnapshot_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentSnapshot_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalyticsSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "connectionId" TEXT,
    "channelId" TEXT,
    "channelScope" TEXT NOT NULL DEFAULT 'store',
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "granularity" TEXT NOT NULL DEFAULT 'DAY',
    "currencyCode" TEXT NOT NULL,
    "revenue" TEXT NOT NULL DEFAULT '0.00',
    "refundValue" TEXT NOT NULL DEFAULT '0.00',
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "refundCount" INTEGER NOT NULL DEFAULT 0,
    "unitsSold" INTEGER NOT NULL DEFAULT 0,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "returningCustomers" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER,
    "conversionRate" REAL,
    "source" TEXT NOT NULL DEFAULT 'DEMO',
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalyticsSnapshot_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnalyticsSnapshot_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnalyticsSnapshot_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromotionSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "channelId" TEXT,
    "externalPromotionId" INTEGER,
    "name" TEXT NOT NULL,
    "promotionType" TEXT NOT NULL DEFAULT 'AUTOMATIC',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "couponCode" TEXT,
    "redemptionType" TEXT NOT NULL DEFAULT 'AUTOMATIC',
    "discountSummary" TEXT NOT NULL,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "usageLimit" INTEGER,
    "channelsJson" TEXT NOT NULL DEFAULT '[]',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromotionSnapshot_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PromotionSnapshot_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PromotionSnapshot_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StorefrontChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProvisioningPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "intendedStoreName" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "regionName" TEXT,
    "brandName" TEXT,
    "environmentName" TEXT NOT NULL DEFAULT 'Production',
    "kind" TEXT NOT NULL DEFAULT 'INDEPENDENT_STORE',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "templateId" TEXT,
    "connectionId" TEXT,
    "parentConnectionId" TEXT,
    "createdByUserId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProvisioningPlan_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProvisioningPlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProvisioningPlan_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProvisioningPlan_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProvisioningStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "automation" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "docsUrl" TEXT,
    "notes" TEXT,
    "completedAt" DATETIME,
    "completedByUserId" TEXT,
    CONSTRAINT "ProvisioningStep_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ProvisioningPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ManualActionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "connectionId" TEXT,
    "deploymentId" TEXT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "currentValue" TEXT,
    "desiredValue" TEXT,
    "docsUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completedByUserId" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ManualActionItem_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ManualActionItem_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConnectorDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "longDescription" TEXT NOT NULL,
    "logoSlug" TEXT NOT NULL,
    "logoColor" TEXT NOT NULL DEFAULT '0f172a',
    "docsUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMING_SOON',
    "integrationType" TEXT NOT NULL DEFAULT 'API',
    "supportsMultiStore" BOOLEAN NOT NULL DEFAULT false,
    "tagsCsv" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT,
    "companyId" TEXT,
    "connectionId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionLabel" TEXT,
    "actionHref" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" DATETIME,
    "correlationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    CONSTRAINT "Notification_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "companyId" TEXT,
    "connectionId" TEXT,
    "channelId" TEXT,
    "actorUserId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "resourceLabel" TEXT,
    "beforeSummary" TEXT,
    "afterSummary" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
    "errorSummary" TEXT,
    "ipHash" TEXT,
    "sessionId" TEXT,
    "correlationId" TEXT,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StoreConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutStage" TEXT NOT NULL DEFAULT 'EXPERIMENTAL',
    "category" TEXT NOT NULL DEFAULT 'Platform',
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeatureFlag_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filtersJson" TEXT NOT NULL DEFAULT '{}',
    "columnsJson" TEXT NOT NULL DEFAULT '[]',
    "sortJson" TEXT NOT NULL DEFAULT '[]',
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedView_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_slug_key" ON "Organisation"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationMembership_organisationId_userId_key" ON "OrganisationMembership"("organisationId", "userId");

-- CreateIndex
CREATE INDEX "Company_organisationId_idx" ON "Company"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_organisationId_slug_key" ON "Company"("organisationId", "slug");

-- CreateIndex
CREATE INDEX "Region_organisationId_idx" ON "Region"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Region_companyId_code_key" ON "Region"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_organisationId_slug_key" ON "Brand"("organisationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Environment_organisationId_slug_key" ON "Environment"("organisationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "StoreGroup_organisationId_slug_key" ON "StoreGroup"("organisationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "StoreGroupMember_storeGroupId_connectionId_key" ON "StoreGroupMember"("storeGroupId", "connectionId");

-- CreateIndex
CREATE INDEX "StoreConnection_organisationId_companyId_idx" ON "StoreConnection"("organisationId", "companyId");

-- CreateIndex
CREATE INDEX "StoreConnection_storeHash_idx" ON "StoreConnection"("storeHash");

-- CreateIndex
CREATE INDEX "StoreConnection_masterConnectionId_idx" ON "StoreConnection"("masterConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConnection_organisationId_slug_key" ON "StoreConnection"("organisationId", "slug");

-- CreateIndex
CREATE INDEX "StorefrontChannel_organisationId_idx" ON "StorefrontChannel"("organisationId");

-- CreateIndex
CREATE INDEX "StorefrontChannel_externalChannelId_idx" ON "StorefrontChannel"("externalChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontChannel_connectionId_name_key" ON "StorefrontChannel"("connectionId", "name");

-- CreateIndex
CREATE INDEX "StoreRelationship_organisationId_idx" ON "StoreRelationship"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreRelationship_parentId_childId_relationshipType_key" ON "StoreRelationship"("parentId", "childId", "relationshipType");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigurationTemplate_organisationId_slug_key" ON "ConfigurationTemplate"("organisationId", "slug");

-- CreateIndex
CREATE INDEX "InheritancePolicy_organisationId_resourceCategory_idx" ON "InheritancePolicy"("organisationId", "resourceCategory");

-- CreateIndex
CREATE UNIQUE INDEX "InheritancePolicy_scopeType_scopeId_resourceCategory_key" ON "InheritancePolicy"("scopeType", "scopeId", "resourceCategory");

-- CreateIndex
CREATE INDEX "ResourceOverride_organisationId_resourceCategory_idx" ON "ResourceOverride"("organisationId", "resourceCategory");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceOverride_connectionId_channelScope_resourceCategory_resourceKey_key" ON "ResourceOverride"("connectionId", "channelScope", "resourceCategory", "resourceKey");

-- CreateIndex
CREATE INDEX "StoreCapability_organisationId_capabilityKey_idx" ON "StoreCapability"("organisationId", "capabilityKey");

-- CreateIndex
CREATE UNIQUE INDEX "StoreCapability_connectionId_capabilityKey_key" ON "StoreCapability"("connectionId", "capabilityKey");

-- CreateIndex
CREATE INDEX "CredentialRecord_organisationId_idx" ON "CredentialRecord"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "CredentialRecord_connectionId_credentialType_status_key" ON "CredentialRecord"("connectionId", "credentialType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SyncJob_correlationId_key" ON "SyncJob"("correlationId");

-- CreateIndex
CREATE INDEX "SyncJob_organisationId_status_idx" ON "SyncJob"("organisationId", "status");

-- CreateIndex
CREATE INDEX "SyncJob_jobType_idx" ON "SyncJob"("jobType");

-- CreateIndex
CREATE UNIQUE INDEX "SyncJobTarget_jobId_connectionId_channelId_key" ON "SyncJobTarget"("jobId", "connectionId", "channelId");

-- CreateIndex
CREATE INDEX "SyncJobItem_jobId_status_idx" ON "SyncJobItem"("jobId", "status");

-- CreateIndex
CREATE INDEX "Deployment_organisationId_status_idx" ON "Deployment"("organisationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentTarget_deploymentId_connectionId_channelId_key" ON "DeploymentTarget"("deploymentId", "connectionId", "channelId");

-- CreateIndex
CREATE INDEX "DeploymentItem_deploymentId_changeType_idx" ON "DeploymentItem"("deploymentId", "changeType");

-- CreateIndex
CREATE INDEX "ApprovalRequest_organisationId_status_idx" ON "ApprovalRequest"("organisationId", "status");

-- CreateIndex
CREATE INDEX "Conflict_organisationId_status_idx" ON "Conflict"("organisationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Conflict_targetConnectionId_resourceCategory_resourceKey_conflictType_key" ON "Conflict"("targetConnectionId", "resourceCategory", "resourceKey", "conflictType");

-- CreateIndex
CREATE INDEX "ConflictResolution_conflictId_idx" ON "ConflictResolution"("conflictId");

-- CreateIndex
CREATE INDEX "ProductSnapshot_organisationId_sku_idx" ON "ProductSnapshot"("organisationId", "sku");

-- CreateIndex
CREATE INDEX "ProductSnapshot_connectionId_sku_idx" ON "ProductSnapshot"("connectionId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSnapshot_connectionId_externalProductId_key" ON "ProductSnapshot"("connectionId", "externalProductId");

-- CreateIndex
CREATE INDEX "ProductMapping_organisationId_mappingStatus_idx" ON "ProductMapping"("organisationId", "mappingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMapping_masterConnectionId_masterProductId_targetConnectionId_key" ON "ProductMapping"("masterConnectionId", "masterProductId", "targetConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryMapping_masterConnectionId_masterCategoryId_targetConnectionId_key" ON "CategoryMapping"("masterConnectionId", "masterCategoryId", "targetConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceListSnapshot_connectionId_externalPriceListId_key" ON "PriceListSnapshot"("connectionId", "externalPriceListId");

-- CreateIndex
CREATE INDEX "PricingEntry_organisationId_sku_idx" ON "PricingEntry"("organisationId", "sku");

-- CreateIndex
CREATE INDEX "PricingEntry_connectionId_sku_idx" ON "PricingEntry"("connectionId", "sku");

-- CreateIndex
CREATE INDEX "InventoryRecord_organisationId_status_idx" ON "InventoryRecord"("organisationId", "status");

-- CreateIndex
CREATE INDEX "InventoryRecord_connectionId_sku_idx" ON "InventoryRecord"("connectionId", "sku");

-- CreateIndex
CREATE INDEX "OrderSnapshot_organisationId_placedAt_idx" ON "OrderSnapshot"("organisationId", "placedAt");

-- CreateIndex
CREATE INDEX "OrderSnapshot_connectionId_statusCategory_idx" ON "OrderSnapshot"("connectionId", "statusCategory");

-- CreateIndex
CREATE UNIQUE INDEX "OrderSnapshot_connectionId_externalOrderId_key" ON "OrderSnapshot"("connectionId", "externalOrderId");

-- CreateIndex
CREATE INDEX "OrderLineSnapshot_orderId_idx" ON "OrderLineSnapshot"("orderId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_idx" ON "OrderEvent"("orderId");

-- CreateIndex
CREATE INDEX "CustomerSnapshot_organisationId_emailHash_idx" ON "CustomerSnapshot"("organisationId", "emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSnapshot_connectionId_externalCustomerId_key" ON "CustomerSnapshot"("connectionId", "externalCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerGroupTemplate_organisationId_name_key" ON "CustomerGroupTemplate"("organisationId", "name");

-- CreateIndex
CREATE INDEX "CustomerGroupMapping_organisationId_status_idx" ON "CustomerGroupMapping"("organisationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerGroupMapping_connectionId_externalGroupName_key" ON "CustomerGroupMapping"("connectionId", "externalGroupName");

-- CreateIndex
CREATE UNIQUE INDEX "ThemeRelease_organisationId_name_version_key" ON "ThemeRelease"("organisationId", "name", "version");

-- CreateIndex
CREATE INDEX "ThemeAssignment_organisationId_state_idx" ON "ThemeAssignment"("organisationId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "ThemeAssignment_connectionId_channelId_key" ON "ThemeAssignment"("connectionId", "channelId");

-- CreateIndex
CREATE INDEX "ContentSnapshot_organisationId_contentType_idx" ON "ContentSnapshot"("organisationId", "contentType");

-- CreateIndex
CREATE INDEX "ContentSnapshot_connectionId_contentType_idx" ON "ContentSnapshot"("connectionId", "contentType");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_organisationId_periodStart_idx" ON "AnalyticsSnapshot"("organisationId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsSnapshot_connectionId_channelScope_periodStart_granularity_key" ON "AnalyticsSnapshot"("connectionId", "channelScope", "periodStart", "granularity");

-- CreateIndex
CREATE INDEX "PromotionSnapshot_organisationId_status_idx" ON "PromotionSnapshot"("organisationId", "status");

-- CreateIndex
CREATE INDEX "ProvisioningPlan_organisationId_status_idx" ON "ProvisioningPlan"("organisationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProvisioningStep_planId_position_key" ON "ProvisioningStep"("planId", "position");

-- CreateIndex
CREATE INDEX "ManualActionItem_organisationId_status_idx" ON "ManualActionItem"("organisationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorDefinition_slug_key" ON "ConnectorDefinition"("slug");

-- CreateIndex
CREATE INDEX "ConnectorDefinition_category_idx" ON "ConnectorDefinition"("category");

-- CreateIndex
CREATE INDEX "Notification_organisationId_isRead_idx" ON "Notification"("organisationId", "isRead");

-- CreateIndex
CREATE INDEX "AuditEvent_organisationId_createdAt_idx" ON "AuditEvent"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceType_resourceId_idx" ON "AuditEvent"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditEvent_correlationId_idx" ON "AuditEvent"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_organisationId_key_key" ON "FeatureFlag"("organisationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SavedView_userId_entity_name_key" ON "SavedView"("userId", "entity", "name");
