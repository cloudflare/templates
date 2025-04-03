/**
 * API Service module
 * Handles all communication with the backend API endpoints
 *
 * Centralizes fetch operations and error handling for database operations
 * Includes debugging logs to assist with troubleshooting
 */

export async function checkTables() {
  console.log("Checking tables...");
  const response = await fetch("/api/check-tables");
  if (!response.ok) {
    console.error(
      "Failed to check tables:",
      response.status,
      response.statusText,
    );
    throw new Error(
      `Failed to check tables: ${response.status} ${response.statusText}`,
    );
  }
  const data = await response.json();
  console.log("Tables check result:", data);
  return data;
}

export async function initializeTables() {
  const response = await fetch("/api/initialize", { method: "POST" });
  if (!response.ok) throw new Error("Failed to initialize tables");
  return response.json();
}

export async function fetchOrganizations() {
  console.log("Fetching organizations...");
  const response = await fetch("/api/organizations");
  if (!response.ok) {
    console.error(
      "Failed to fetch organizations:",
      response.status,
      response.statusText,
    );
    throw new Error(
      `Failed to fetch organizations: ${response.status} ${response.statusText}`,
    );
  }
  const data = await response.json();
  console.log("Organizations fetched:", data);
  return data;
}

export async function fetchUsers(orgFilter = "") {
  console.log("Fetching users with filter:", orgFilter);
  const url = orgFilter
    ? `/api/users?organization_id=${orgFilter}`
    : "/api/users";
  const response = await fetch(url);
  if (!response.ok) {
    console.error(
      "Failed to fetch users:",
      response.status,
      response.statusText,
    );
    throw new Error(
      `Failed to fetch users: ${response.status} ${response.statusText}`,
    );
  }
  const data = await response.json();
  console.log("Users fetched:", data);
  return data;
}

export const organizationApi = {
  create: async (name) => {
    const response = await fetch("/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error("Failed to create organization");
    return response.json();
  },

  delete: async (id) => {
    const response = await fetch(`/api/organizations/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("Failed to delete organization");
    return response.json();
  },
};

export const userApi = {
  create: async (username, organizationId) => {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        organization_id: organizationId || null,
      }),
    });
    if (!response.ok) throw new Error("Failed to create user");
    return response.json();
  },

  update: async (id, username, organizationId) => {
    const response = await fetch(`/api/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        organization_id: organizationId || null,
      }),
    });
    if (!response.ok) throw new Error("Failed to update user");
    return response.json();
  },

  delete: async (id) => {
    const response = await fetch(`/api/users/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("Failed to delete user");
    return response.json();
  },
};
