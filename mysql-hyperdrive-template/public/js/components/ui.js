/**
 * UI Components module
 * Provides reusable UI functionality like modals, toasts, and loading indicators
 *
 * These components handle the display state of various UI elements across the application
 */

export const modalHandlers = {
  show: function (modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.add("show");
    document.body.style.overflow = "hidden";

    // Add Escape key handler
    document.addEventListener("keydown", this._handleEscapeKey);

    // For better accessibility, focus the first focusable element in the modal
    setTimeout(() => {
      const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }, 100);
  },

  hide: function (modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove("show");
    document.body.style.overflow = "";

    // Remove Escape key handler
    document.removeEventListener("keydown", this._handleEscapeKey);
  },

  // Private method to handle Escape key
  _handleEscapeKey: function (e) {
    if (e.key === "Escape") {
      // Find the visible modal and hide it
      const visibleModal = document.querySelector(".modal.show");
      if (visibleModal) {
        visibleModal.classList.remove("show");
        document.body.style.overflow = "";
      }

      document.removeEventListener("keydown", modalHandlers._handleEscapeKey);
    }
  },
};

export const toastHandler = {
  show: function (message, type = "success") {
    const toastEl = document.getElementById("toastNotification");
    const toastMessage = document.getElementById("toastMessage");

    toastMessage.textContent = message;
    toastEl.style.backgroundColor =
      type === "success"
        ? "var(--cf-green)"
        : type === "danger"
          ? "var(--cf-red)"
          : "var(--cf-orange)";

    toastEl.classList.add("show");

    setTimeout(() => {
      toastEl.classList.remove("show");
    }, 3000);
  },
};

export function setLoading(loading) {
  const loadingView = document.getElementById("loadingView");

  if (loading) {
    // Show loading immediately with no transition
    loadingView.style.transition = "none";
    loadingView.classList.remove("hidden");

    // Force a layout recalculation to ensure the transition property is applied
    void loadingView.offsetWidth;

    // Re-enable transitions after showing
    loadingView.style.transition = "";
  } else {
    // Add CSS transition for hiding
    loadingView.style.transition = "opacity 0.3s ease-out";
    loadingView.style.opacity = "0";

    // After transition completes, hide the element
    setTimeout(() => {
      loadingView.classList.add("hidden");
      loadingView.style.opacity = "1";
    }, 300);
  }
}
