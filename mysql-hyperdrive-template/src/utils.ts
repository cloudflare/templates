/**
 * MySQL identifier validation utilities
 */

// MySQL reserved keywords list
export const MYSQL_RESERVED_KEYWORDS = [
  'accessible', 'add', 'all', 'alter', 'analyze', 'and', 'as', 'asc', 'asensitive', 
  'before', 'between', 'bigint', 'binary', 'blob', 'both', 'by', 'call', 'cascade', 
  'case', 'change', 'char', 'character', 'check', 'collate', 'column', 'condition', 
  'constraint', 'continue', 'convert', 'create', 'cross', 'cube', 'cume_dist', 
  'current_date', 'current_time', 'current_timestamp', 'current_user', 'cursor', 
  'database', 'databases', 'day_hour', 'day_microsecond', 'day_minute', 'day_second', 
  'dec', 'decimal', 'declare', 'default', 'delayed', 'delete', 'dense_rank', 'desc', 
  'describe', 'deterministic', 'distinct', 'distinctrow', 'div', 'double', 'drop', 
  'dual', 'each', 'else', 'elseif', 'empty', 'enclosed', 'escaped', 'except', 'exists', 
  'exit', 'explain', 'false', 'fetch', 'first_value', 'float', 'float4', 'float8', 
  'for', 'force', 'foreign', 'from', 'fulltext', 'function', 'generated', 'get', 'grant', 
  'group', 'grouping', 'groups', 'having', 'high_priority', 'hour_microsecond', 
  'hour_minute', 'hour_second', 'if', 'ignore', 'in', 'index', 'infile', 'inner', 
  'inout', 'insensitive', 'insert', 'int', 'int1', 'int2', 'int3', 'int4', 'int8', 
  'integer', 'interval', 'into', 'io_after_gtids', 'io_before_gtids', 'is', 'iterate', 
  'join', 'json_table', 'key', 'keys', 'kill', 'lag', 'last_value', 'lead', 'leading', 
  'leave', 'left', 'like', 'limit', 'linear', 'lines', 'load', 'localtime', 'localtimestamp', 
  'lock', 'long', 'longblob', 'longtext', 'loop', 'low_priority', 'master_bind', 
  'master_ssl_verify_server_cert', 'match', 'maxvalue', 'mediumblob', 'mediumint', 
  'mediumtext', 'middleint', 'minute_microsecond', 'minute_second', 'mod', 'modifies', 
  'natural', 'not', 'no_write_to_binlog', 'nth_value', 'ntile', 'null', 'numeric', 
  'of', 'on', 'optimize', 'optimizer_costs', 'option', 'optionally', 'or', 'order', 
  'out', 'outer', 'outfile', 'over', 'partition', 'percent_rank', 'persist', 'persist_only', 
  'precision', 'primary', 'procedure', 'purge', 'range', 'rank', 'read', 'reads', 
  'read_write', 'real', 'recursive', 'references', 'regexp', 'release', 'rename', 
  'repeat', 'replace', 'require', 'resignal', 'restrict', 'return', 'revoke', 'right', 
  'rlike', 'row', 'rows', 'row_number', 'schema', 'schemas', 'second_microsecond', 
  'select', 'sensitive', 'separator', 'set', 'show', 'signal', 'smallint', 'spatial', 
  'specific', 'sql', 'sqlexception', 'sqlstate', 'sqlwarning', 'sql_big_result', 
  'sql_calc_found_rows', 'sql_small_result', 'ssl', 'starting', 'stored', 'straight_join', 
  'system', 'table', 'terminated', 'then', 'tinyblob', 'tinyint', 'tinytext', 'to', 
  'trailing', 'trigger', 'true', 'undo', 'union', 'unique', 'unlock', 'unsigned', 
  'update', 'usage', 'use', 'using', 'utc_date', 'utc_time', 'utc_timestamp', 'values', 
  'varbinary', 'varchar', 'varcharacter', 'varying', 'virtual', 'when', 'where', 
  'while', 'window', 'with', 'write', 'xor', 'year_month', 'zerofill'
];

/**
 * Validates a MySQL identifier (table or column name)
 * @param name The name to validate
 * @returns Result object indicating if the name is valid and an optional error message
 */
export function isValidMySQLIdentifier(name: string): { valid: boolean; message?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, message: 'Name is required' };
  }

  if (name.length > 64) {
    return { valid: false, message: 'Name exceeds 64 character limit' };
  }

  // Check if it starts with a digit
  if (/^\d/.test(name)) {
    return { valid: false, message: 'Name cannot start with a number' };
  }

  // Check for valid characters
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    return { valid: false, message: 'Name can only contain letters, numbers, and underscores' };
  }

  // Check against reserved keywords
  if (MYSQL_RESERVED_KEYWORDS.includes(name.toLowerCase())) {
    return { valid: false, message: `"${name}" is a MySQL reserved keyword` };
  }

  return { valid: true };
}
