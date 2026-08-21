import { api } from "../services/api";

// ============================================================================
// Public Endpoints (No Auth Required)
// ============================================================================

/**
 * Register a new linguist via self-service signup
 * @param {Object} data - Linguist registration payload
 * @returns {Promise} Axios response promise
 */
export const linguistSignup = (data) => api.post("/api/vendor/signup", data);

/**
 * Upload CV or portfolio document for a vendor / linguist application
 * @param {File} file - Document file to upload
 * @returns {Promise} Axios response promise
 */
export const uploadVendorDocument = (file) => {
  const formData = new FormData();
  formData.append("file", file);
  return api.post("/api/vendor/upload-document", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
};

// ============================================================================
// Authenticated Endpoints (Vendor Role)
// ============================================================================

/**
 * Fetch vendor dashboard overview statistics (metrics, counts, status breakdowns)
 * @returns {Promise} Axios response promise
 */
export const fetchVendorDashboardStats = () => api.get("/api/vendor/dashboard/stats");

/**
 * Fetch list of pending/processed onboarding requests with optional filtering & pagination
 * @param {Object} [params={}] - Query parameters (search, status, page, limit, etc.)
 * @returns {Promise} Axios response promise
 */
export const fetchOnboardingRequests = (params = {}) => api.get("/api/vendor/onboarding-requests", { params });

/**
 * Fetch list of all linguists in the database with optional filtering & pagination
 * @param {Object} [params={}] - Query parameters (search, status, sourceLang, targetLang, page, limit, etc.)
 * @returns {Promise} Axios response promise
 */
export const fetchLinguists = (params = {}) => api.get("/api/vendor/linguists", { params });

/**
 * Fetch full profile of a single linguist including language pairs and activity history
 * @param {string|number} id - Linguist ID
 * @returns {Promise} Axios response promise
 */
export const fetchLinguistProfile = (id) => api.get(`/api/vendor/linguists/${id}`);

/**
 * Update general linguist profile details
 * @param {string|number} id - Linguist ID
 * @param {Object} data - Updated profile attributes
 * @returns {Promise} Axios response promise
 */
export const updateLinguistProfile = (id, data) => api.put(`/api/vendor/linguists/${id}`, data);

/**
 * Update a linguist's operational status (e.g. active, suspended, pending, rejected)
 * @param {string|number} id - Linguist ID
 * @param {string} status - New status value
 * @returns {Promise} Axios response promise
 */
export const updateLinguistStatus = (id, status) => api.put(`/api/vendor/linguists/${id}/status`, { status });

/**
 * Manually create a new linguist record by vendor management team
 * @param {Object} data - Linguist details
 * @returns {Promise} Axios response promise
 */
export const createLinguist = (data) => api.post("/api/vendor/linguists", data);

// ============================================================================
// Language Pairs Management
// ============================================================================

/**
 * Fetch all language pairs configured for a specific linguist
 * @param {string|number} linguistId - Linguist ID
 * @returns {Promise} Axios response promise
 */
export const fetchLanguagePairs = (linguistId) => api.get(`/api/vendor/linguists/${linguistId}/language-pairs`);

/**
 * Add a new language pair for a linguist
 * @param {string|number} linguistId - Linguist ID
 * @param {Object} data - Language pair details (source_lang, target_lang, rate_per_word, etc.)
 * @returns {Promise} Axios response promise
 */
export const addLanguagePair = (linguistId, data) => api.post(`/api/vendor/linguists/${linguistId}/language-pairs`, data);

/**
 * Update rates or settings for a specific language pair
 * @param {string|number} pairId - Language Pair ID
 * @param {Object} data - Updated language pair attributes
 * @returns {Promise} Axios response promise
 */
export const updateLanguagePair = (pairId, data) => api.put(`/api/vendor/language-pairs/${pairId}`, data);

/**
 * Remove a language pair configuration
 * @param {string|number} pairId - Language Pair ID
 * @returns {Promise} Axios response promise
 */
export const deleteLanguagePair = (pairId) => api.delete(`/api/vendor/language-pairs/${pairId}`);

// ============================================================================
// Audit & History
// ============================================================================

/**
 * Fetch activity and status change history for a linguist
 * @param {string|number} linguistId - Linguist ID
 * @returns {Promise} Axios response promise
 */
export const fetchLinguistHistory = (linguistId) => api.get(`/api/vendor/linguists/${linguistId}/history`);
