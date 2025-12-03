import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import crypto from "crypto";

/**
 * Generates a consistent 8-character hash from an email address
 */
function hashEmail(email: string): string {
  return crypto
    .createHash("md5")
    .update(email.toLowerCase().trim())
    .digest("hex")
    .substring(0, 8);
}

/**
 * Generates a unique request ID
 */
function generateRequestId(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .substring(0, 14);
  const randomChars = crypto.randomBytes(2).toString("hex").substring(0, 4);
  return `req_${timestamp}_${randomChars}`;
}

/**
 * Sanitizes text by removing common PII patterns
 */
function sanitizeText(text: string): string {
  let sanitized = text;

  // Remove email addresses
  sanitized = sanitized.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "[EMAIL_REDACTED]"
  );

  // Remove phone numbers (various formats)
  sanitized = sanitized.replace(
    /(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g,
    "[PHONE_REDACTED]"
  );

  // Remove credit card patterns
  sanitized = sanitized.replace(
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    "[PAYMENT_INFO_REDACTED]"
  );

  // Remove SSN patterns
  sanitized = sanitized.replace(
    /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    "[SSN_REDACTED]"
  );

  return sanitized;
}

export const piiSanitizerTool = createTool({
  id: "pii-sanitizer",
  description:
    "Sanitizes PII from feature request data before LLM processing. Removes emails, phone numbers, and payment info while generating anonymized user IDs.",
  inputSchema: z.object({
    featureDescription: z.string().describe("The raw feature request description"),
    usageFrequency: z.string().optional().describe("How often the user needs this feature"),
    serviceTypes: z.string().optional().describe("Types of services the user provides"),
    userInterests: z.string().optional().describe("User interests or areas"),
    contactEmail: z.string().optional().describe("User's contact email"),
  }),
  outputSchema: z.object({
    sanitizedDescription: z.string(),
    sanitizedServiceTypes: z.string(),
    sanitizedUserInterests: z.string(),
    usageFrequency: z.string(),
    userId: z.string(),
    timestamp: z.string(),
    requestId: z.string(),
  }),
  execute: async ({ context }) => {
    const {
      featureDescription,
      usageFrequency,
      serviceTypes,
      userInterests,
      contactEmail,
    } = context;

    // Generate anonymized user ID from email
    const userId = contactEmail
      ? `user_${hashEmail(contactEmail)}`
      : `user_${crypto.randomBytes(4).toString("hex")}`;

    // Generate timestamp and request ID
    const timestamp = new Date().toISOString();
    const requestId = generateRequestId();

    // Sanitize all text fields
    const sanitizedDescription = sanitizeText(featureDescription || "");
    const sanitizedServiceTypes = sanitizeText(serviceTypes || "General");
    const sanitizedUserInterests = sanitizeText(userInterests || "");

    return {
      sanitizedDescription,
      sanitizedServiceTypes,
      sanitizedUserInterests,
      usageFrequency: usageFrequency || "Not specified",
      userId,
      timestamp,
      requestId,
    };
  },
});

export { hashEmail, generateRequestId, sanitizeText };

