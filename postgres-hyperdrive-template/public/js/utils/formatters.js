/**
 * Utility formatting functions
 * Provides reusable formatting helpers for consistent data presentation
 *
 * Includes date formatting and other display-related utility functions
 */

export function formatDate(dateString) {
  if (!dateString) return "N/A";

  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
