/**
 * JSONC (JSON with Comments) parsing utilities.
 *
 * Provides comment stripping for JSON files that contain single-line
 * and multi-line comment syntax.
 */

/**
 * Strip JSONC comments from a string.
 *
 * Handles:
 * - Single-line comments (starting with //)
 * - Multi-line comments (enclosed in slash-star pairs)
 * - Preserves comment-like sequences inside strings
 */
export function stripJsonComments(content: string): string {
  let result = "";
  let i = 0;
  let inString = false;
  let stringChar = "";

  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];

    // Handle string boundaries
    if (char === '"' || char === "'") {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && content[j] === "\\") {
        backslashCount++;
        j--;
      }
      
      // If backslashes are even, they escape each other, so the quote is real
      if (backslashCount % 2 === 0) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        result += char;
        i++;
        continue;
      }
    }

    // Skip comments only when not in a string
    if (!inString) {
      // Single-line comment
      if (char === "/" && nextChar === "/") {
        // Skip until end of line
        while (i < content.length && content[i] !== "\n") {
          i++;
        }
        continue;
      }

      // Multi-line comment
      if (char === "/" && nextChar === "*") {
        i += 2;
        while (i < content.length - 1 && !(content[i] === "*" && content[i + 1] === "/")) {
          i++;
        }
        i += 2; // Skip closing delimiter
        continue;
      }
    }

    result += char;
    i++;
  }

  return result;
}

/**
 * Strip trailing commas from JSON content.
 *
 * Removes commas that appear before closing brackets/braces,
 * while preserving commas inside strings.
 */
export function stripTrailingCommas(content: string): string {
  let result = "";
  let i = 0;
  let inString = false;
  let stringChar = "";

  while (i < content.length) {
    const char = content[i];

    // Handle string boundaries
    if (char === '"' || char === "'") {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && content[j] === "\\") {
        backslashCount++;
        j--;
      }
      
      if (backslashCount % 2 === 0) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        result += char;
        i++;
        continue;
      }
    }

    // If not in a string, check for a trailing comma
    if (!inString && char === ",") {
      let j = i + 1;
      while (j < content.length && /\s/.test(content[j])) {
        j++;
      }
      // If the next non-whitespace character is a closing bracket/brace, skip this comma
      if (j < content.length && (content[j] === "]" || content[j] === "}")) {
        i++;
        continue;
      }
    }

    result += char;
    i++;
  }

  return result;
}

/**
 * Parse JSON or JSONC content.
 *
 * @param content - The file content to parse
 * @param isJsonc - If true, strip comments and trailing commas before parsing
 * @returns Parsed JSON value
 * @throws SyntaxError if the content is not valid JSON
 */
export function parseJsonOrJsonc(content: string, isJsonc: boolean): unknown {
  try {
    let toParse = isJsonc ? stripJsonComments(content) : content;
    toParse = stripTrailingCommas(toParse);
    return JSON.parse(toParse);
  } catch (error) {
    // Fallback: If strict JSON parsing failed, aggressively strip comments 
    // and commas in case the file has extension .json but actually contains comments.
    if (!isJsonc) {
      let fallbackParse = stripJsonComments(content);
      fallbackParse = stripTrailingCommas(fallbackParse);
      return JSON.parse(fallbackParse);
    }
    throw error;
  }
}