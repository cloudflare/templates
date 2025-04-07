/**
 * Table rendering components
 * Handles rendering of tabular data for organizations and users
 *
 * Provides functions to create and update table content with proper formatting
 * and event handlers for interactive elements
 */

import { formatDate } from "../utils/formatters.js";
import { modalHandlers } from "./ui.js";

export function renderOrganizationsTable(organizations, onDelete) {
  const tbody = document.getElementById("orgsTableBody");
  tbody.innerHTML = "";

  if (!organizations || organizations.length === 0) {
    renderEmptyState(tbody, 5, "No organizations found");
    return;
  }

  organizations.forEach((org) => {
    const tr = document.createElement("tr");

    const idTd = document.createElement("td");
    idTd.textContent = org.id;
    tr.appendChild(idTd);

    const nameTd = document.createElement("td");
    nameTd.textContent = org.name;
    tr.appendChild(nameTd);

    const createdTd = document.createElement("td");
    createdTd.textContent = formatDate(org.created_at);
    tr.appendChild(createdTd);

    const updatedTd = document.createElement("td");
    updatedTd.textContent = formatDate(org.updated_at);
    tr.appendChild(updatedTd);

    const actionsTd = document.createElement("td");
    actionsTd.className = "actions-column";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn small danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      if (onDelete) onDelete(org);
    });

    actionsTd.appendChild(deleteBtn);
    tr.appendChild(actionsTd);

    tbody.appendChild(tr);
  });
}

export function renderUsersTable(users, onEdit, onDelete) {
  const tbody = document.getElementById("usersTableBody");
  tbody.innerHTML = "";

  if (!users || users.length === 0) {
    renderEmptyState(tbody, 6, "No users found");
    return;
  }

  users.forEach((user) => {
    const tr = document.createElement("tr");

    const idTd = document.createElement("td");
    idTd.textContent = user.id;
    tr.appendChild(idTd);

    const usernameTd = document.createElement("td");
    usernameTd.textContent = user.username;
    tr.appendChild(usernameTd);

    const orgTd = document.createElement("td");
    orgTd.textContent = user.organization_name || "None";
    tr.appendChild(orgTd);

    const createdTd = document.createElement("td");
    createdTd.textContent = formatDate(user.created_at);
    tr.appendChild(createdTd);

    const updatedTd = document.createElement("td");
    updatedTd.textContent = formatDate(user.updated_at);
    tr.appendChild(updatedTd);

    const actionsTd = document.createElement("td");
    actionsTd.className = "actions-column";

    const editBtn = document.createElement("button");
    editBtn.className = "btn small secondary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      if (onEdit) onEdit(user);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn small danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.style.marginLeft = "5px";
    deleteBtn.addEventListener("click", () => {
      if (onDelete) onDelete(user);
    });

    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(deleteBtn);
    tr.appendChild(actionsTd);

    tbody.appendChild(tr);
  });
}

function renderEmptyState(tbody, colSpan, message) {
  const emptyRow = document.createElement("tr");
  const emptyCell = document.createElement("td");
  emptyCell.colSpan = colSpan;
  emptyCell.textContent = message;
  emptyCell.style.textAlign = "center";
  emptyCell.style.padding = "2rem";
  emptyRow.appendChild(emptyCell);
  tbody.appendChild(emptyRow);
}

export function updateOrganizationDropdowns(organizations) {
  // Update filter dropdown
  const orgFilter = document.getElementById("orgFilter");
  const currentFilterValue = orgFilter.value;
  orgFilter.innerHTML = '<option value="">All Organizations</option>';

  // Update user form dropdown
  const userOrg = document.getElementById("userOrg");
  const currentUserOrgValue = userOrg.value;
  userOrg.innerHTML = '<option value="">None</option>';

  if (organizations && organizations.length > 0) {
    organizations.forEach((org) => {
      // Add to filter dropdown
      const filterOption = document.createElement("option");
      filterOption.value = org.id;
      filterOption.textContent = org.name;
      orgFilter.appendChild(filterOption);

      // Add to user form dropdown
      const userOption = document.createElement("option");
      userOption.value = org.id;
      userOption.textContent = org.name;
      userOrg.appendChild(userOption);
    });

    // Restore selected values if possible
    if (currentFilterValue) {
      orgFilter.value = currentFilterValue;
    }

    if (currentUserOrgValue) {
      userOrg.value = currentUserOrgValue;
    }
  }
}
