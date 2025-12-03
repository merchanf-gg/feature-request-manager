import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import crypto from "crypto";

// ============================================================================
// SCHEMAS
// ============================================================================


const typeformInputSchema = z.object({
  text: z.string().describe("The whole Typeform response as a text string"),
});

const formInputSchema = z.object({
    featureDescription: z.string().describe("Raw feature request description from Typeform"),
    usageFrequency: z.string().optional().describe("How often the user needs this feature"),
    serviceTypes: z.string().optional().describe("Types of services the user provides"),
    userInterests: z.string().optional().describe("User interests or areas"),
    contactEmail: z.string().optional().describe("User's contact email (will be sanitized)"),
  });

const sanitizedDataSchema = z.object({
  sanitizedDescription: z.string(),
  sanitizedServiceTypes: z.string(),
  sanitizedUserInterests: z.string(),
  usageFrequency: z.string(),
  userId: z.string(),
  timestamp: z.string(),
  requestId: z.string(),
});

const processedFeatureSchema = z.object({
  feature_name: z.string(),
  description: z.string(),
  domain: z.string(),
  niche: z.array(z.string()),
  keywords: z.array(z.string()),
  frequency: z.string(),
  user_id: z.string(),
  timestamp: z.string(),
  request_id: z.string(),
});

const googleSheetsRowSchema = z.object({
  request_id: z.string(),
  timestamp: z.string(),
  feature_name: z.string(),
  description: z.string(),
  domain: z.string(),
  niche: z.string(),
  keywords: z.string(),
  frequency: z.string(),
  user_id: z.string(),
  success: z.boolean(),
  message: z.string(),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function hashEmail(email: string): string {
  return crypto
    .createHash("md5")
    .update(email.toLowerCase().trim())
    .digest("hex")
    .substring(0, 8);
}

function generateRequestId(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .substring(0, 14);
  const randomChars = crypto.randomBytes(2).toString("hex").substring(0, 4);
  return `req_${timestamp}_${randomChars}`;
}

function sanitizeText(text: string): string {
  let sanitized = text;

  // Remove email addresses
  sanitized = sanitized.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "[EMAIL_REDACTED]"
  );

  return sanitized;
}

function arrayToCSV(arr: string[]): string {
  return arr.join(", ");
}

// ============================================================================
// WORKFLOW STEPS
// ============================================================================

/**
 * Step 0: Convert whole Typeform response to a JSON object
 * Uses the typeformParserAgent to extract structured data from raw notification text
 */
const convertTypeformResponseToJSON = createStep({
  id: "convert-typeform-response-to-json",
  description: "Converts the whole Typeform response to a JSON object using AI parsing",
  inputSchema: typeformInputSchema,
  outputSchema: formInputSchema,
  execute: async ({ inputData, mastra }) => {
    const { text } = inputData;

    const agent = mastra?.getAgent("typeformParserAgent");
    if (!agent) {
      throw new Error("Typeform parser agent not found");
    }

    console.log("📝 Parsing Typeform response...");

    const response = await agent.generate(text);
    const responseText = response.text.trim();

    // Parse the JSON response from the agent
    let parsedResponse;
    try {
      // Try to extract JSON from the response if it's wrapped in markdown
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        parsedResponse = JSON.parse(responseText);
      }
    } catch (error) {
      console.error("Failed to parse agent response:", responseText);
      throw new Error(`Failed to parse Typeform response: ${error}`);
    }

    const featureDescription = parsedResponse.featureDescription || "";
    const usageFrequency = parsedResponse.usageFrequency || undefined;
    const serviceTypes = parsedResponse.serviceTypes || undefined;
    const userInterests = parsedResponse.userInterests || undefined;
    const contactEmail = parsedResponse.contactEmail || undefined;

    console.log("✅ Typeform response parsed successfully");
    console.log(`   Feature: ${featureDescription.substring(0, 50)}...`);

    return {
      featureDescription,
      usageFrequency,
      serviceTypes,
      userInterests,
      contactEmail,
    };
  },
});

/**
 * Step 1: PII Sanitization
 * Sanitizes all PII from the raw Typeform input before any LLM processing
 */
const sanitizePII = createStep({
  id: "sanitize-pii",
  description: "Sanitizes PII from raw Typeform data before LLM processing",
  inputSchema: formInputSchema,
  outputSchema: sanitizedDataSchema,
  execute: async ({ inputData }) => {
    const {
      featureDescription,
      usageFrequency,
      serviceTypes,
      userInterests,
      contactEmail,
    } = inputData;

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

    console.log(`🔒 PII Sanitization Complete`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Request ID: ${requestId}`);

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

/**
 * Step 2: Feature Request Analysis
 * Uses LLM to analyze and categorize the sanitized feature request
 */
const analyzeFeatureRequest = createStep({
  id: "analyze-feature-request",
  description: "Analyzes sanitized feature request using LLM for categorization",
  inputSchema: sanitizedDataSchema,
  outputSchema: processedFeatureSchema,
  execute: async ({ inputData, mastra }) => {
    const {
      sanitizedDescription,
      sanitizedServiceTypes,
      sanitizedUserInterests,
      usageFrequency,
      userId,
      timestamp,
      requestId,
    } = inputData;

    const agent = mastra?.getAgent("featureRequestAgent");
    if (!agent) {
      throw new Error("Feature request agent not found");
    }

    const prompt = `Analyze this feature request and return ONLY a valid JSON object (no markdown, no code blocks):

## Feature Request Data

**Description:** ${sanitizedDescription}

**Usage Frequency:** ${usageFrequency}

**Service Types:** ${sanitizedServiceTypes}

**User Interests:** ${sanitizedUserInterests}

## Pre-generated Fields (use these exact values)

- user_id: "${userId}"
- timestamp: "${timestamp}"
- request_id: "${requestId}"
- frequency: "${usageFrequency}"

## Required JSON Output

Return a JSON object with these exact fields:
{
  "feature_name": "<normalized feature name>",
  "description": "<clear 1-2 sentence summary>",
  "domain": "<one of: Booking Site, Payments, Marketing, Client Management, Analytics, Other>",
  "niche": ["<standardized service categories>"],
  "keywords": ["<3-5 relevant terms>"],
  "frequency": "${usageFrequency}",
  "user_id": "${userId}",
  "timestamp": "${timestamp}",
  "request_id": "${requestId}"
}`;

    const response = await agent.generate(prompt);
    const responseText = response.text.trim();

    // Parse the JSON response
    let parsedResponse;
    try {
      // Try to extract JSON from the response if it's wrapped in markdown
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        parsedResponse = JSON.parse(responseText);
      }
    } catch (error) {
      console.error("Failed to parse LLM response:", responseText);
      // Fallback to default values
      parsedResponse = {
        feature_name: "Feature Review Needed",
        description: sanitizedDescription,
        domain: "Other",
        niche: sanitizedServiceTypes.split(",").map((s: string) => s.trim()) || ["General"],
        keywords: ["Review", "Unprocessed"],
        frequency: usageFrequency,
        user_id: userId,
        timestamp,
        request_id: requestId,
      };
    }

    // Ensure all required fields are present
    const result = {
      feature_name: parsedResponse.feature_name || "Feature Review Needed",
      description: parsedResponse.description || sanitizedDescription,
      domain: parsedResponse.domain || "Other",
      niche: Array.isArray(parsedResponse.niche) ? parsedResponse.niche : ["General"],
      keywords: Array.isArray(parsedResponse.keywords) ? parsedResponse.keywords : [],
      frequency: usageFrequency,
      user_id: userId,
      timestamp,
      request_id: requestId,
    };

    console.log(`📊 Feature Analysis Complete`);
    console.log(`   Feature Name: ${result.feature_name}`);
    console.log(`   Domain: ${result.domain}`);
    console.log(`   Niche: ${result.niche.join(", ")}`);

    return result;
  },
});

/**
 * Step 3: Prepare Google Sheets Row
 * Converts arrays to CSV strings and prepares the final row data
 */
const prepareGoogleSheetsRow = createStep({
  id: "prepare-google-sheets-row",
  description: "Converts processed data into Google Sheets row format",
  inputSchema: processedFeatureSchema,
  outputSchema: googleSheetsRowSchema,
  execute: async ({ inputData }) => {
    const {
      feature_name,
      description,
      domain,
      niche,
      keywords,
      frequency,
      user_id,
      timestamp,
      request_id,
    } = inputData;

    // Convert arrays to comma-separated strings
    const nicheCSV = arrayToCSV(niche);
    const keywordsCSV = arrayToCSV(keywords);

    // Log the row data (in production, this would append to Google Sheets)
    console.log("\n📊 Google Sheets Row Data:");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`Request ID:    ${request_id}`);
    console.log(`Timestamp:     ${timestamp}`);
    console.log(`Feature:       ${feature_name}`);
    console.log(`Description:   ${description}`);
    console.log(`Domain:        ${domain}`);
    console.log(`Niche:         ${nicheCSV}`);
    console.log(`Keywords:      ${keywordsCSV}`);
    console.log(`Frequency:     ${frequency}`);
    console.log(`User ID:       ${user_id}`);
    console.log("═══════════════════════════════════════════════════════════\n");

    // In production, you would call the Google Sheets API here:
    // await appendToGoogleSheets({
    //   spreadsheetId: process.env.GOOGLE_SHEET_ID,
    //   range: 'Feature Requests!A:I',
    //   values: [[request_id, timestamp, feature_name, description, domain, nicheCSV, keywordsCSV, frequency, user_id]],
    // });

    return {
      request_id,
      timestamp,
      feature_name,
      description,
      domain,
      niche: nicheCSV,
      keywords: keywordsCSV,
      frequency,
      user_id,
      success: true,
      message: `Feature request processed successfully (${request_id})`,
    };
  },
});

// ============================================================================
// WORKFLOW DEFINITION
// ============================================================================

const featureRequestWorkflow = createWorkflow({
  id: "feature-request-workflow",
  description: "Processes Typeform feature requests: parses raw text, sanitizes PII, analyzes with LLM, and prepares for Google Sheets",
  inputSchema: typeformInputSchema,
  outputSchema: googleSheetsRowSchema,
})
  .then(convertTypeformResponseToJSON)
  .then(sanitizePII)
  .then(analyzeFeatureRequest)
  .then(prepareGoogleSheetsRow);

featureRequestWorkflow.commit();

export { featureRequestWorkflow };
export type { FeatureRequestRow } from "../tools/google-sheets";

