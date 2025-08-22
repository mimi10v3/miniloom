/**
 * Validate field values based on their expected type
 * @param {string} fieldValue - The value to validate
 * @param {string} fieldType - The expected type (intType, floatType, modelNameType, URLType, etc.)
 * @returns {boolean|RegExpMatchArray|null} - Validation result
 */
function validateFieldStringType(fieldValue, fieldType) {
  const fieldValueString = String(fieldValue);
  const intPattern = /^[0-9]+$/;
  const floatPattern = /^[0-9]+\.?[0-9]*$/;
  const modelNamePattern = /^[a-zA-Z0-9-\._]+$/;

  let result;
  if (fieldType === "intType") {
    result = fieldValueString.match(intPattern);
  } else if (fieldType === "floatType") {
    result = fieldValueString.match(floatPattern);
  } else if (fieldType === "modelNameType") {
    result =
      fieldValueString.match(modelNamePattern) && fieldValueString.length <= 20;
  } else if (fieldType === "settingsNameType") {
    result = fieldValueString.match(modelNamePattern);
  } else if (fieldType === "URLType") {
    result = isValidUrl(fieldValue);
  } else if (fieldType === "select") {
    result = fieldValue && fieldValue.length > 0;
  } else {
    if (fieldType === "") {
      console.warn(
        "Tried to validate empty field type. Did you forget to type your form field?"
      );
      result = null;
    } else {
      console.warn("Attempted to validate unknown field type");
      result = null;
    }
  }
  return result;
}

/**
 * Validate if a string is a valid URL
 * @param {string} urlString - The URL string to validate
 * @returns {boolean} - True if valid URL, false otherwise
 */
function isValidUrl(urlString) {
  try {
    new URL(urlString);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Count characters in text
 * @param {string} text - The text to count characters in
 * @returns {number} - Number of characters
 */
function countCharacters(text) {
  return text.length;
}

/**
 * Count words in text
 * @param {string} text - The text to count words in
 * @returns {number} - Number of words
 */
function countWords(text) {
  return text
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0).length;
}

/**
 * Simple text highlighting function for search results
 * @param {string} text - The text to highlight
 * @param {string} query - The search query to highlight
 * @returns {string} - HTML with highlighted text
 */
function highlightText(text, query) {
  if (!query.trim() || !text) return text;

  const words = query.toLowerCase().split(/\s+/);
  let highlighted = text;

  words.forEach(word => {
    const regex = new RegExp(`(${escapeRegex(word)})`, "gi");
    highlighted = highlighted.replace(regex, "<mark>$1</mark>");
  });

  return highlighted;
}

/**
 * Escape special regex characters in a string
 * @param {string} string - The string to escape
 * @returns {string} - Escaped string safe for regex
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Format a timestamp for display
 * @param {number} timestamp - Unix timestamp
 * @returns {string} - Formatted date string
 */
function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Truncate text to a specified length with ellipsis
 * @param {string} text - The text to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @returns {string} - Truncated text with ellipsis if needed
 */
function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

// Export functions for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    validateFieldStringType,
    isValidUrl,
    countCharacters,
    countWords,
    highlightText,
    escapeRegex,
    formatTimestamp,
    truncateText,
  };
}

// Create a single utils namespace to avoid global pollution
if (typeof window !== "undefined") {
  window.utils = {
    validateFieldStringType,
    isValidUrl,
    countCharacters,
    countWords,
    highlightText,
    escapeRegex,
    formatTimestamp,
    truncateText,
  };
}
