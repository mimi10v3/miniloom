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
 * @returns {string} - Formatted date string in "d MMM yy HH:mm" format
 */
function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
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

/**
 * Extract the first three words from the first line of text
 * @param {string} text - The text to extract words from
 * @returns {string} - First three words joined by spaces
 */
function extractThreeWords(text) {
  return text.trim().split("\n")[0].split(" ").slice(0, 3).join(" ");
}

/**
 * Calculate comprehensive text statistics for a given text
 * @param {string} text - The text to analyze
 * @returns {Object} - Object containing wordCount, charCount, and other stats
 */
function calculateTextStats(text) {
  const trimmedText = text.trim();
  const wordCount =
    trimmedText.length === 0 ? 0 : trimmedText.split(/\s+/).length;
  const charCount = text.length;

  return {
    wordCount,
    charCount,
    isEmpty: trimmedText.length === 0,
    lineCount: text.split("\n").length,
    averageWordsPerLine: wordCount / Math.max(1, text.split("\n").length),
  };
}

/**
 * Calculate net changes between two texts
 * @param {string} currentText - The current text
 * @param {string} previousText - The previous text to compare against
 * @returns {Object} - Object containing net word and character changes
 */
function calculateNetChanges(currentText, previousText) {
  const currentStats = calculateTextStats(currentText);
  const previousStats = calculateTextStats(previousText);

  return {
    netWordsChange: currentStats.wordCount - previousStats.wordCount,
    netCharsChange: currentStats.charCount - previousStats.charCount,
    netLinesChange: currentStats.lineCount - previousStats.lineCount,
  };
}

/**
 * Format net change for display with +/- prefix
 * @param {number} change - The net change value
 * @returns {string} - Formatted string with +/- prefix
 */
function formatNetChange(change) {
  return `${change > 0 ? "+" : ""}${change}`;
}

/**
 * Get CSS class for net change styling
 * @param {number} change - The net change value
 * @returns {string} - CSS class name for styling
 */
function getNetChangeClass(change) {
  if (change > 0) return "positive";
  if (change < 0) return "negative";
  return "";
}

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
    extractThreeWords,
    calculateTextStats,
    calculateNetChanges,
    formatNetChange,
    getNetChangeClass,
  };
}
