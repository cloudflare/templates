/**
 * Main application file for the Hyperdrive PostgreSQL Manager
 * Manages app initialization, state management, and event handlers
 *
 * This file coordinates between UI components, API services, and data rendering
 */

import { modalHandlers, toastHandler, setLoading } from "./components/ui.js";
import {
  checkTables,
  initializeTables,
  fetchOrganizations,
  fetchUsers,
  organizationApi,
  userApi,
} from "./services/api.js";
import { formatDate } from "./utils/formatters.js";

// Import your rendering functions
import {
  renderOrganizationsTable,
  renderUsersTable,
  updateOrganizationDropdowns,
} from "./components/tables.js";

// State management
let organizations = [];
let users = [];
let currentDeleteCallback = null;
let isEditingUser = false;

document.addEventListener("DOMContentLoaded", function () {
  // Initialize app state and event listeners
  initializeApp();
  setupEventListeners();
});

async function initializeApp() {
  try {
    setLoading(true); // Explicitly show loading before checking tables
    const tables = await checkTables();

    // Hide loading before showing the appropriate view
    setLoading(false);

    if (tables.organizations && tables.users) {
      document.getElementById("initializeView").classList.add("hidden");
      document.getElementById("dashboardView").classList.remove("hidden");
      await loadData();
    } else {
      document.getElementById("initializeView").classList.remove("hidden");
      document.getElementById("dashboardView").classList.add("hidden");
    }
  } catch (error) {
    console.error("Error initializing app:", error);
    toastHandler.show("Error checking database status", "danger");
    setLoading(false);

    // Show initialize view as a fallback when there's an error
    document.getElementById("initializeView").classList.remove("hidden");
    document.getElementById("dashboardView").classList.add("hidden");
  }
}

async function loadData() {
  setLoading(true);
  try {
    // First make all API calls
    organizations = await fetchOrganizations();
    users = await fetchUsers();

    // Then prepare the dashboard view (make it visible before rendering)
    document.getElementById("dashboardView").classList.remove("hidden");

    // Then do the DOM-intensive operations
    renderOrganizationsTable(organizations, handleDeleteOrg);
    renderUsersTable(users, handleEditUser, handleDeleteUser);
    updateOrganizationDropdowns(organizations);

    // Finally hide the loading indicator with a slight delay
    // This ensures the browser has time to render everything
    setTimeout(() => {
      setLoading(false);
    }, 100);
  } catch (error) {
    console.error("Error loading data:", error);
    toastHandler.show("Error loading data", "danger");
    setLoading(false);
  }
}

function handleEditUser(user) {
  prepareEditUserForm(user);
}

function handleDeleteUser(user) {
  showDeleteConfirmation(
    `Are you sure you want to delete the user "${user.username}"?`,
    () => {
      deleteUser(user.id);
    },
  );
}

function handleDeleteOrg(org) {
  showDeleteConfirmation(
    `Are you sure you want to delete the organization "${org.name}"?`,
    () => {
      deleteOrganization(org.id);
    },
  );
}

// Show delete confirmation modal
function showDeleteConfirmation(message, callback) {
  document.getElementById("confirmDeleteMessage").textContent = message;
  currentDeleteCallback = callback;
  modalHandlers.show("confirmDeleteModal");
}

// Delete user
async function deleteUser(id) {
  try {
    await userApi.delete(id);
    toastHandler.show("User deleted successfully", "success");
    await loadUsers(document.getElementById("orgFilter").value);
  } catch (error) {
    console.error("Error deleting user:", error);
    toastHandler.show("Error deleting user", "danger");
  }
}

// Delete organization
async function deleteOrganization(id) {
  try {
    await organizationApi.delete(id);
    toastHandler.show("Organization deleted successfully", "success");
    await loadOrganizations();
    await loadUsers(document.getElementById("orgFilter").value);
  } catch (error) {
    console.error("Error deleting organization:", error);
    toastHandler.show("Error deleting organization", "danger");
  }
}

// Reload organizations
async function loadOrganizations() {
  organizations = await fetchOrganizations();
  renderOrganizationsTable(organizations, handleDeleteOrg);
  updateOrganizationDropdowns(organizations);
  return organizations;
}

// Reload users
async function loadUsers(orgFilter = "") {
  users = await fetchUsers(orgFilter);
  renderUsersTable(users, handleEditUser, handleDeleteUser);
  return users;
}

// Prepare user form for editing
function prepareEditUserForm(user) {
  document.getElementById("userModalTitle").textContent = "Edit User";
  document.getElementById("userId").value = user.id;
  document.getElementById("username").value = user.username;
  document.getElementById("userOrg").value = user.organization_id || "";
  isEditingUser = true;
  modalHandlers.show("userModal");
}

// Prepare user form for adding
function prepareAddUserForm() {
  document.getElementById("userModalTitle").textContent = "Add User";
  document.getElementById("userId").value = "";
  document.getElementById("username").value = "";
  document.getElementById("userOrg").value = "";
  isEditingUser = false;
  modalHandlers.show("userModal");
}

// Prepare organization form for adding
function prepareAddOrgForm() {
  document.getElementById("orgModalTitle").textContent = "Add Organization";
  document.getElementById("orgName").value = "";
  modalHandlers.show("orgModal");
}

function setupEventListeners() {
  // Initialize button
  document
    .getElementById("initializeTablesBtn")
    .addEventListener("click", async () => {
      try {
        await initializeTables();
        document.getElementById("initializeView").classList.add("hidden");
        document.getElementById("dashboardView").classList.remove("hidden");
        await loadData();
      } catch (error) {
        toastHandler.show("Error initializing tables", "danger");
      }
    });

  // Tab switching
  document.getElementById("usersTabBtn").addEventListener("click", () => {
    document.getElementById("usersTabBtn").classList.add("active");
    document.getElementById("orgsTabBtn").classList.remove("active");
    document.getElementById("usersTab").classList.remove("hidden");
    document.getElementById("orgsTab").classList.add("hidden");
  });

  document.getElementById("orgsTabBtn").addEventListener("click", () => {
    document.getElementById("usersTabBtn").classList.remove("active");
    document.getElementById("orgsTabBtn").classList.add("active");
    document.getElementById("usersTab").classList.add("hidden");
    document.getElementById("orgsTab").classList.remove("hidden");
  });

  // Filter changes
  document.getElementById("orgFilter").addEventListener("change", async (e) => {
    setLoading(true);
    try {
      await loadUsers(e.target.value);
    } finally {
      setLoading(false);
    }
  });

  // Add buttons
  document
    .getElementById("addUserBtn")
    .addEventListener("click", prepareAddUserForm);
  document
    .getElementById("addOrgBtn")
    .addEventListener("click", prepareAddOrgForm);

  // Save buttons
  document.getElementById("saveUserBtn").addEventListener("click", async () => {
    const username = document.getElementById("username").value.trim();
    const orgId = document.getElementById("userOrg").value;

    if (!username) {
      document.getElementById("usernameError").textContent =
        "Username is required";
      return;
    }

    try {
      if (isEditingUser) {
        const userId = document.getElementById("userId").value;
        await userApi.update(userId, username, orgId);
        toastHandler.show("User updated successfully", "success");
      } else {
        await userApi.create(username, orgId);
        toastHandler.show("User created successfully", "success");
      }

      modalHandlers.hide("userModal");
      await loadUsers(document.getElementById("orgFilter").value);
    } catch (error) {
      console.error("Error saving user:", error);
      toastHandler.show("Error saving user", "danger");
    }
  });

  document.getElementById("saveOrgBtn").addEventListener("click", async () => {
    const name = document.getElementById("orgName").value.trim();

    if (!name) {
      document.getElementById("orgNameError").textContent =
        "Organization name is required";
      return;
    }

    try {
      await organizationApi.create(name);
      toastHandler.show("Organization created successfully", "success");
      modalHandlers.hide("orgModal");
      await loadOrganizations();
    } catch (error) {
      console.error("Error creating organization:", error);
      toastHandler.show("Error creating organization", "danger");
    }
  });

  // Delete confirmation
  document.getElementById("confirmDeleteBtn").addEventListener("click", () => {
    if (currentDeleteCallback) {
      currentDeleteCallback();
      modalHandlers.hide("confirmDeleteModal");
      currentDeleteCallback = null;
    }
  });

  // Close modals
  document.querySelectorAll(".close-btn[data-dismiss]").forEach((button) => {
    button.addEventListener("click", function () {
      const target = this.getAttribute("data-dismiss");
      if (target === "toast") {
        document.getElementById("toastNotification").classList.remove("show");
      } else {
        modalHandlers.hide(target);
      }
    });
  });

  // Add cancel button functionality
  document
    .querySelectorAll("button.btn.secondary[data-dismiss]")
    .forEach((button) => {
      button.addEventListener("click", function () {
        const target = this.getAttribute("data-dismiss");
        modalHandlers.hide(target);
      });
    });

  // Handle Enter key press in modal forms
  document.getElementById("userForm").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("saveUserBtn").click();
    }
  });

  document.getElementById("orgForm").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("saveOrgBtn").click();
    }
  });

  // Form inputs
  document.getElementById("username").addEventListener("input", () => {
    document.getElementById("usernameError").textContent = "";
  });

  document.getElementById("orgName").addEventListener("input", () => {
    document.getElementById("orgNameError").textContent = "";
  });
}
