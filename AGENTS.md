# OpenCode `AGENTS.md` - ReconVault System Architecture and Implementation Guide

This document serves as the comprehensive instruction manual and architectural reference for autonomous agents working on the ReconVault repository. It details every systemic requirement, database structure, and user flow required for the application. These instructions are subject to explicit user direction; agents may deviate from, override, or modify this document when specifically instructed by the user, and should update it accordingly when such changes are intended to be persistent.

## 1. Project Overview
*   **Project Name**: ReconVault - Offensive Security Reconnaissance Asset Manager.
*   **System Description**: ReconVault is a simple network reconnaissance asset management system designed for offensive security work. 
*   **Core Features**: Capabilities include initializing a network scope, adding/removing host systems, host port and service scanning, and service vulnerability finding.
*   **Target Users**: The system is built for Penetration Testers and Clients.
*   **Primary Objective**: The purpose of the system is to share information about a network with other team members and the client, specifically maintaining security and organization.

## 2. Users, Roles, and Access Control
Roles are treated as overlapping subclasses, meaning a single user can belong to multiple roles simultaneously. Roles function as permission levels determining system abilities.

*   **Administrator (System Administrator)**:
    *   Registers and manages system users.
    *   Registers and manages client organizations.
    *   Creates and manages engagements.
    *   Assigns Pentesters and Clients to specific engagements.
*   **Pentester (Penetration Testers)**:
    *   Adds and removes targets (hosts).
    *   Adds and removes discovered services on a target.
    *   Creates and deletes findings in the engagement.
    *   Creates and performs authorized service scans on selected targets and ports.
    *   Accesses assigned engagements.
*   **Client (Clients)**:
    *   Accesses engagements related specifically to their organization.
    *   Views engagement results, which include discovered targets, services, and security findings.

## 3. User Flows and System Abilities
*   **User Login Flow**: A user arrives at the login page and submits a username and password. The server queries the database (SELECT on users) to check if the credential exists and is active, verifying the password against the stored Argon2id hash. If it does not exist, a 401 Unauthorized is returned; if it exists, the user is routed to the Engagement List page.
*   **Engagement Listing Flow**: When a user arrives at the Engagement List page, the server checks if the user is an admin. If they are an admin, the server serves every engagement; if they are not, it serves only the user's assigned engagements.
*   **Administrator Abilities Flow**: Upon logging in successfully, an Administrator arrives in the Administrator section where they can route to Register/Manage Users, Register/Manage Client Organizations, Create/Manage Engagements, and Assign/Remove User/Organization to/from Engagement.
    *   *Register/Manage User*: Admin creates/modifies a user. Server verifies Admin status and data validity, triggering INSERT/UPDATE on users and role tables.
    *   *Register/Manage Client Org*: Server verifies Admin status, triggering INSERT/UPDATE on client_organizations.
    *   *Create/Manage Engagement*: Server verifies Admin status, triggering INSERT/UPDATE on engagements.
    *   *Assign/Remove to/from Engagement*: Server verifies Admin status and entity existence, triggering INSERT/DELETE on engagement_members or engagement_organizations.
*   **Pentester Abilities Flow**: A Pentester selects an assigned engagement and arrives in the Engagement Dashboard. From here, they can Add/Manage Targets, Record/Manage Services, Create/Edit Scans, and Record/Edit Findings.
    *   *Add/Manage Target*: Submits an IPv4/IPv6 address. Server verifies engagement assignment, triggering INSERT/UPDATE on targets.
    *   *Record/Manage Service*: Manually submits a discovered service. Server verifies engagement and target, triggering INSERT on services.
    *   *Record/Edit Finding*: Submits vulnerability details. Server verifies engagement and targets, triggering INSERT/UPDATE on findings.
    *   *Create/Edit Scan*: Submits targets with rules. Server verifies engagement and targets, triggering INSERT/UPDATE on scans.
    *   *Initiate Scan*: Pentester initiates a scan. Server verifies engagement and scan readiness, triggering UPDATE on scans and INSERT/UPDATE on targets, services, and findings.
*   **Client Abilities Flow**: A Client selects an assigned engagement, arrives in the Engagement Dashboard, and can Review Engagements.
    *   *Review Engagement*: Server verifies the Client's organization is associated with the engagement, triggering SELECT on engagements, targets, services, findings.

## 4. User Interface Pages and CRUD Mapping
*   **Page 1: Login**: Used by unauthenticated users to authenticate. Performs a Read (SELECT) on users.
*   **Page 2: Engagement List/Management**: Used by All Roles. Provides a list of assigned engagements. Admins can manage engagements. Performs Read (SELECT), Create (INSERT), Update (UPDATE), and Delete (DELETE) on engagements.
*   **Page 3: Engagement Dashboard**: Used by All Roles. Displays detailed assessment data. Performs Read (SELECT) on engagements, pentesters, client_organizations, targets, services, findings, and scans.
*   **Page 4: Engagement Team**: Used by Administrator. Assigns/removes pentesters and client organizations. Performs Create (INSERT) and Delete (DELETE) on engagement_members and engagement_organizations. Performs Read (SELECT) on users and client_organizations.
*   **Page 5: Target List/Management**: Used by Client, Pentester. Views assessment targets; Pentesters can add/edit. Performs Create (INSERT), Read (SELECT), Update (UPDATE), and Delete (DELETE) on targets.
*   **Page 6: Target Details**: Used by Client, Pentester. Views target details and services; Pentesters add/edit services. Performs Create (INSERT) on services, Read (SELECT) on targets, services, users, and scans, Update (UPDATE) on targets and services, and Delete (DELETE) on services.
*   **Page 7: Finding List/Management**: Used by Client, Pentester. Views findings; Pentesters manage security findings. Performs Create (INSERT), Update (UPDATE), and Delete (DELETE) on findings. Performs Read (SELECT) on findings, targets, and services.
*   **Page 8: Finding Details**: Used by Client, Pentester. Displays detailed information about a finding; Pentesters update it. Performs Read (SELECT) on findings, targets, services, users, and scans. Performs Update (UPDATE) on findings.
*   **Page 9: Scan Management**: Used by Pentester. Create, run, and review recon scans. Performs Create (INSERT), Read (SELECT), and Update (UPDATE) on scans. Performs Read (SELECT) on users.
*   **Page 10: User Management**: Used by Administrator. Manage system users. Performs Create (INSERT) and Update (UPDATE) on users. Performs Read (SELECT) on users, administrators, pentesters, clients, and client_organizations. Performs Create/Delete on administrators, pentesters, clients.
*   **Page 11: Client Organization Management**: Used by Administrator. Manage client organizations. Performs Create (INSERT), Read (SELECT), and Update (UPDATE) on client_organizations.

## 5. Logical Database Design
### Entities List
1.  **User**: Attributes include User_ID (PK), Username, Password_Hash, Status. Overlapping subclasses are Administrator, Pentester, Client. Client has a Client_Organization_ID (FK).
2.  **Client Organization**: Attributes include Organization_ID (PK), Name, Contact_Information.
3.  **Engagement**: Attributes include Engagement_ID (PK), Name, Description, Start_Date, End_Date, Status.
4.  **Target**: Attributes include Target_ID (PK), Engagement_ID (FK), IP_Type, IP_Address, Domain_Name, Hostname, Description, Status, Operating_System. Multivalued attribute: Contributor.
5.  **Service**: Attributes include Service_ID (PK), Target_ID (FK), Port, Protocol, Name, Version, State. Multivalued attribute: Contributor.
6.  **Finding**: Attributes include Finding_ID (PK), Title, Description, Severity, Status, Discovered_At, Resolved_At. Multivalued attributes: Target_ID (FK), Service_ID (FK), Contributor.
7.  **Scan**: Attributes include Scan_ID (PK), Engagement_ID (FK), Creator_User_ID (FK), Runner_User_ID (FK), Canceller_User_ID (FK), Scan_Type, Started_At, Completed_At, Status.

### Relationship Sets
*   Administrator, Pentester, and Client are Overlapping & Total Subclasses of User.
*   Client belongs to Client Organization (N:1).
*   Pentester is assigned to Engagement (M:N).
*   Client Organization is involved in Engagement (M:N).
*   Engagement contains Target, Finding, Scan (1:N).
*   Target runs Service (1:N).
*   Finding includes Target, Service (M:N).
*   Pentester, Scan contributes to Target, Service, Finding (M:N).
*   Scan observes Target, Service (M:N).
*   Scan writes up Finding (M:N).
*   Pentester manages Scan (1:N).

## 6. Physical Database Design (MySQL)
Agents must implement the exact schema details defined below.

*   **`users`**
    *   `user_id`: INT, Nullable: no, Key: PK, Notes: Auto Increment.
    *   `username`: VARCHAR(50), Nullable: no, Notes: Unique.
    *   `password_hash`: VARCHAR(255), Nullable: no, Notes: Stores Argon2id password hash.
    *   `status`: ENUM('ACTIVE', 'INACTIVE'), Nullable: no.
*   **`administrators`**
    *   `user_id`: INT, Nullable: no, Key: PK, FK, References: users.user_id.
*   **`pentesters`**
    *   `user_id`: INT, Nullable: no, Key: PK, FK, References: users.user_id.
*   **`clients`**
    *   `user_id`: INT, Nullable: no, Key: PK, FK, References: users.user_id.
    *   `client_organization_id`: INT, Nullable: yes, Key: FK, References: client_organizations.organization_id.
*   **`client_organizations`**
    *   `organization_id`: INT, Nullable: no, Key: PK, Notes: Auto Increment.
    *   `name`: VARCHAR(150), Nullable: no.
    *   `contact_information`: TEXT, Nullable: yes.
*   **`engagements`**
    *   `engagement_id`: INT, Nullable: no, Key: PK, Notes: Auto Increment.
    *   `name`: VARCHAR(150), Nullable: no.
    *   `description`: TEXT, Nullable: yes.
    *   `start_date`: DATE, Nullable: no.
    *   `end_date`: DATE, Nullable: yes.
    *   `status`: ENUM('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'), Nullable: no.
*   **`engagement_members`**
    *   `engagement_id`: INT, Nullable: no, Key: PK, FK, References: engagements.engagement_id, Notes: Part of composite primary key.
    *   `user_id`: INT, Nullable: no, Key: PK, FK, References: users.user_id, Notes: Part of composite primary key.
*   **`engagement_organizations`**
    *   `engagement_id`: INT, Nullable: no, Key: PK, FK, References: engagements.engagement_id, Notes: Part of composite primary key.
    *   `organization_id`: INT, Nullable: no, Key: PK, FK, References: client_organizations.organization_id, Notes: Part of composite primary key.
*   **`targets`**
    *   `target_id`: INT, Nullable: no, Key: PK, Notes: Auto Increment.
    *   `engagement_id`: INT, Nullable: no, Key: FK, References: engagements.engagement_id.
    *   `ip_type`: ENUM('IPV4', 'IPV6'), Nullable: no.
    *   `ip_address`: VARCHAR(39), Nullable: no, Notes: IPv4 or IPv6.
    *   `domain_name`: VARCHAR(253), Nullable: yes.
    *   `hostname`: VARCHAR(63), Nullable: yes.
    *   `description`: TEXT, Nullable: yes.
    *   `status`: ENUM('ACTIVE', 'INACTIVE'), Nullable: no.
    *   `operating_system`: VARCHAR(255), Nullable: yes.
*   **`services`**
    *   `service_id`: INT, Nullable: no, Key: PK, Notes: Auto Increment.
    *   `target_id`: INT, Nullable: no, Key: FK, References: targets.target_id.
    *   `name`: VARCHAR(100), Nullable: no.
    *   `port`: INT, Nullable: no, Notes: 1-65535.
    *   `protocol`: VARCHAR(20), Nullable: no.
    *   `version`: VARCHAR(100), Nullable: yes.
    *   `state`: ENUM('UNKNOWN', 'OPEN', 'CLOSED', 'FILTERED'), Nullable: no.
*   **`findings`**
    *   `finding_id`: INT, Nullable: no, Key: PK, Notes: Auto Increment.
    *   `title`: VARCHAR(200), Nullable: no.
    *   `description`: TEXT, Nullable: no.
    *   `severity`: ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'), Nullable: no.
    *   `status`: ENUM('OPEN', 'IN PROGRESS', 'RESOLVED', 'ACCEPTED'), Nullable: no.
    *   `discovered_at`: DATETIME, Nullable: no.
    *   `resolved_at`: DATETIME, Nullable: yes.
*   **`finding_targets`**
    *   `finding_id`: INT, Nullable: no, Key: PK, FK, References: findings.finding_id, Notes: Part of composite primary key.
    *   `target_id`: INT, Nullable: no, Key: PK, FK, References: targets.target_id, Notes: Part of composite primary key.
*   **`finding_services`**
    *   `finding_id`: INT, Nullable: no, Key: PK, FK, References: findings.finding_id, Notes: Part of composite primary key.
    *   `service_id`: INT, Nullable: no, Key: PK, FK, References: services.service_id, Notes: Part of composite primary key.
*   **`contributors`**
    *   `contributor_id`: INT, Nullable: no, Key: PK, Notes: Auto Increment.
    *   `contributor_type`: ENUM('SCAN', 'PENTESTER'), Nullable: no.
    *   `user_id`: INT, Nullable: yes, Key: FK, References: users.user_id.
    *   `scan_id`: INT, Nullable: yes, Key: FK, References: scan.scan_id.
*   **`target_contributors`**
    *   `contributor_id`: INT, Nullable: no, Key: PK, FK, References: contributors.contributor_id, Notes: Part of composite primary key.
    *   `target_id`: INT, Nullable: no, Key: PK, FK, References: targets.target_id, Notes: Part of composite primary key.
*   **`service_contributors`**
    *   `contributor_id`: INT, Nullable: no, Key: PK, FK, References: contributors.contributor_id, Notes: Part of composite primary key.
    *   `service_id`: INT, Nullable: no, Key: PK, FK, References: services.service_id, Notes: Part of composite primary key.
*   **`finding_contributors`**
    *   `contributor_id`: INT, Nullable: no, Key: PK, FK, References: contributors.contributor_id, Notes: Part of composite primary key.
    *   `finding_id`: INT, Nullable: no, Key: PK, FK, References: findings.finding_id, Notes: Part of composite primary key.
*   **`scans`**
    *   `scan_id`: INT, Nullable: no, Key: PK, Notes: Auto Increment.
    *   `engagement_id`: INT, Nullable: no, Key: FK, References: engagements.engagement_id.
    *   `creator_user_id`: INT, Nullable: no, Key: FK, References: users.user_id, Notes: Pentester who created the scan.
    *   `runner_user_id`: INT, Nullable: yes, Key: FK, References: users.user_id, Notes: Pentester who starts running the scan.
    *   `canceller_user_id`: INT, Nullable: yes, Key: FK, References: users.user_id, Notes: Pentester who cancels the scan while it's running.
    *   `created_at`: DATETIME, Nullable: no.
    *   `started_at`: DATETIME, Nullable: yes.
    *   `finished_at`: DATETIME, Nullable: yes.
    *   `status`: ENUM('READY', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'), Nullable: no.

## 7. Technology Stack, Procedures, and Triggers
*   **Frontend**: HTML, CSS, JavaScript, and Bootstrap are used because they are simple and easy to work with.
*   **Server**: Node.js and Express are utilized, as recommended for stability and reliability in small-sized projects.
*   **Database**: MySQL 8 acts as a simple and reliable DBMS with extensive built-in features.

### Stored Procedures
*   `Get Engagement Summary`: Retrieves an overview of an engagement, including targets, services, findings, and scans.
*   `Get Engagement Findings`: Retrieves all findings associated with an engagement, including affected targets and services.
*   `Get Target Reconnaissance`: Retrieves reconnaissance information for a target, including discovered services and related findings.
*   `Get Scan Results`: Retrieves targets, services, and findings associated with a particular scan.
*   `Get User Engagements`: Retrieves engagements accessible to a specified Pentester or Client.
*   `Get Open Findings`: Retrieves unresolved findings, with optional filtering by engagement or severity.

### Triggers
*   `AFTER INSERT/UPDATE on Target`: Automatically records who created or edited a Target's detail.
*   `AFTER INSERT/UPDATE on Service`: Automatically records who created or edited a Service's detail.
*   `AFTER INSERT/UPDATE on Finding`: Automatically records who created or edited a Finding.
*   `AFTER UPDATE on Scan`: Automatically update a Scan's finished datetime once its status changes.

## 8. Security Standards
*   **Salted Password Hashing (Argon2id)**: Passwords are hashed using the Argon2id algorithm with a unique salt for each user before storage. This prevents plaintext password storage and helps protect against precomputed hash attacks.
*   **Role-Based Access Control**: Restricts functionality according to Administrator, Pentester, or Client roles.
*   **Engagement Access Control**: Pentesters can only access engagements they are assigned to.
*   **Client Access Control**: Clients can only access engagements associated with their Client Organization.
*   **Input Validation**: Validates user input before processing database operations.
*   **Parameterized Queries**: Prevents SQL injection by using parameterized queries/prepared statements.
*   **Session Management**: Uses secure sessions, expiration, and session invalidation upon logout.
*   **Secure Error Handling**: Displays generic error messages to users while keeping detailed diagnostic information in protected server logs.
*   **HTTPS Communication**: Encrypts communication between the frontend and backend when deployed.
