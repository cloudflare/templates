/**
 * PostgreSQL identifier validation utilities
 */

// PostgreSQL reserved keywords list
export const POSTGRES_RESERVED_KEYWORDS = [
  "all",
  "analyse",
  "analyze",
  "and",
  "any",
  "array",
  "as",
  "asc",
  "asymmetric",
  "authorization",
  "binary",
  "both",
  "case",
  "cast",
  "check",
  "collate",
  "collation",
  "column",
  "concurrently",
  "constraint",
  "create",
  "cross",
  "current_catalog",
  "current_date",
  "current_role",
  "current_schema",
  "current_time",
  "current_timestamp",
  "current_user",
  "default",
  "deferrable",
  "desc",
  "distinct",
  "do",
  "else",
  "end",
  "except",
  "false",
  "fetch",
  "for",
  "foreign",
  "freeze",
  "from",
  "full",
  "grant",
  "group",
  "having",
  "ilike",
  "in",
  "initially",
  "inner",
  "intersect",
  "into",
  "is",
  "isnull",
  "join",
  "lateral",
  "leading",
  "left",
  "like",
  "limit",
  "localtime",
  "localtimestamp",
  "natural",
  "not",
  "notnull",
  "null",
  "offset",
  "on",
  "only",
  "or",
  "order",
  "outer",
  "overlaps",
  "placing",
  "primary",
  "references",
  "returning",
  "right",
  "select",
  "session_user",
  "similar",
  "some",
  "symmetric",
  "table",
  "tablesample",
  "then",
  "to",
  "trailing",
  "true",
  "union",
  "unique",
  "user",
  "using",
  "variadic",
  "verbose",
  "when",
  "where",
  "window",
  "with",
];

/**
 * Validates a PostgreSQL identifier (table or column name)
 * @param name The name to validate
 * @returns Result object indicating if the name is valid and an optional error message
 */
export function isValidPostgresIdentifier(name: string): {
  valid: boolean;
  message?: string;
} {
  if (!name || typeof name !== "string") {
    return { valid: false, message: "Name is required" };
  }

  if (name.length > 63) {
    return { valid: false, message: "Name exceeds 63 character limit" };
  }

  // Check if it starts with a digit
  if (/^\d/.test(name)) {
    return { valid: false, message: "Name cannot start with a number" };
  }

  // Check for valid characters
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    return {
      valid: false,
      message: "Name can only contain letters, numbers, and underscores",
    };
  }

  // Check against reserved keywords
  if (POSTGRES_RESERVED_KEYWORDS.includes(name.toLowerCase())) {
    return {
      valid: false,
      message: `"${name}" is a PostgreSQL reserved keyword`,
    };
  }

  return { valid: true };
}
