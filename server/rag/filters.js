'use strict';

/**
 * Shared chunk filtering utility.
 * Used by all retrievers to constrain search scope by date range or week number.
 *
 * @param {Array} entries - Index entries with metadata
 * @param {object} filters - { dateFrom?: string, dateTo?: string, week?: number }
 * @returns {Array} Filtered entries
 */
function filterEntries(entries, filters) {
  if (!filters) return entries;

  const { dateFrom, dateTo, week } = filters;
  const hasFilter = dateFrom || dateTo || week != null;
  if (!hasFilter) return entries;

  return entries.filter(entry => {
    const meta = entry.metadata || {};
    if (dateFrom && (!meta.date || meta.date < dateFrom)) return false;
    if (dateTo && (!meta.date || meta.date > dateTo)) return false;
    if (week != null && meta.week !== week) return false;
    return true;
  });
}

module.exports = { filterEntries };
