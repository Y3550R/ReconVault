import { query } from "../db.js";

const ENTITY_SOURCES = {
  targets: {
    table: "target_contributors",
    column: "target_id",
    key: "target_id",
  },
  services: {
    table: "service_contributors",
    column: "service_id",
    key: "service_id",
  },
  findings: {
    table: "finding_contributors",
    column: "finding_id",
    key: "finding_id",
  },
};

function getSource(entityType) {
  const source = ENTITY_SOURCES[entityType];

  if (!source) {
    throw new Error(`Unknown contributor entity type: ${entityType}`);
  }

  return source;
}

function normalizeIds(ids) {
  return [...new Set(
    (Array.isArray(ids) ? ids : [])
      .map((id) => Number(id))
      .filter((id) => Number.isSafeInteger(id) && id > 0)
  )];
}

function contributorIdentity(row) {
  if (row.contributor_type === "SCAN") {
    return `scan:${row.scan_id ?? row.contributor_id}`;
  }

  return `user:${row.user_id ?? row.contributor_id}`;
}

/**
 * Load the distinct contributors for a batch of targets, services or findings.
 * The database records a new contributor row on every write, so results are
 * collapsed per entity and contributor identity before being returned.
 *
 * @returns {Promise<Map<number, object[]>>}
 */
export async function getContributorsByEntity(entityType, entityIds) {
  const source = getSource(entityType);
  const ids = normalizeIds(entityIds);
  const contributorsByEntity = new Map(ids.map((id) => [id, []]));

  if (!ids.length) {
    return contributorsByEntity;
  }

  const placeholders = ids.map(() => "?").join(", ");
  const rows = await query(
    `SELECT link.${source.column} AS entity_id,
            c.contributor_id,
            c.contributor_type,
            c.user_id,
            u.username,
            c.scan_id,
            s.scan_type,
            s.status AS scan_status
     FROM ${source.table} link
     JOIN contributors c ON c.contributor_id = link.contributor_id
     LEFT JOIN users u ON u.user_id = c.user_id
     LEFT JOIN scans s ON s.scan_id = c.scan_id
     WHERE link.${source.column} IN (${placeholders})
       AND (
           (c.contributor_type = 'PENTESTER' AND c.user_id IS NOT NULL)
           OR (c.contributor_type = 'SCAN' AND c.scan_id IS NOT NULL)
       )
     ORDER BY
        CASE c.contributor_type WHEN 'PENTESTER' THEN 0 ELSE 1 END,
        u.username,
        c.scan_id`,
    ids
  );

  const seenByEntity = new Map(ids.map((id) => [id, new Set()]));

  for (const row of rows) {
    const entityId = Number(row.entity_id);
    const contributors = contributorsByEntity.get(entityId);

    if (!contributors) continue;

    const seen = seenByEntity.get(entityId);
    const identity = contributorIdentity(row);

    if (seen.has(identity)) continue;

    seen.add(identity);
    contributors.push({
      contributor_type: row.contributor_type,
      user_id: row.user_id,
      username: row.username,
      scan_id: row.scan_id,
      scan_type: row.scan_type,
      scan_status: row.scan_status,
    });
  }

  return contributorsByEntity;
}

/**
 * Attach a `contributors` array to each entity returned by a controller.
 * Returns the same array so callers can use the result directly.
 */
export async function attachContributors(entityType, entities) {
  if (!Array.isArray(entities) || !entities.length) {
    return entities;
  }

  const source = getSource(entityType);
  const contributorsByEntity = await getContributorsByEntity(
    entityType,
    entities.map((entity) => entity?.[source.key])
  );

  for (const entity of entities) {
    const entityId = Number(entity?.[source.key]);
    entity.contributors = contributorsByEntity.get(entityId) ?? [];
  }

  return entities;
}
