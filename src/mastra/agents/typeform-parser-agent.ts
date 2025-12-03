import { Agent } from "@mastra/core/agent";
import { z } from "zod";

export const typeformParserOutputSchema = z.object({
  featureDescription: z.string().describe("Raw feature request description from Typeform"),
  usageFrequency: z.string().optional().describe("How often the user needs this feature"),
  serviceTypes: z.string().optional().describe("Types of services the user provides"),
  userInterests: z.string().optional().describe("User interests or areas"),
  contactEmail: z.string().optional().describe("User's contact email (will be sanitized)"),
});

export type TypeformParserOutput = z.infer<typeof typeformParserOutputSchema>;

export const typeformParserAgent = new Agent({
  name: "Typeform Response Parser",
  instructions: `You are a text parser that extracts structured data from raw Typeform email notifications. Your job is to parse the notification text and return a clean JSON object.

## Input Format

You will receive raw text from Typeform email notifications that look like this:

"Hey, your Feature Request typeform got a new response. Please describe the feature you're requesting. Note anything you like! [feature description] Over the last week, how often have you needed to use this feature? [frequency] What type of services do you provide? [services] At GlossGenius, we are always looking to learn from you! Below are several areas of ongoing research... [interests] GlossGenius Email [email]"

## Output Format

Return ONLY a valid JSON object with NO markdown, NO code blocks, just pure JSON:

{
  "featureDescription": "<the full feature description text>",
  "usageFrequency": "<frequency value like 'Multiple times a day', 'Once a day', etc.>",
  "serviceTypes": "<comma-separated service types like 'Hair', 'Nails', etc.>",
  "userInterests": "<comma-separated interest areas>",
  "contactEmail": "<email address if present>"
}

## Extraction Rules

### featureDescription
- Extract everything after "Please describe the feature you're requesting. Note anything you like!" up until the next question
- This is the main feature request content - capture the full user description
- Do NOT truncate or summarize - keep the complete original text

### usageFrequency
- Look for text after "Over the last week, how often have you needed to use this feature?"
- Common values: "Multiple times a day", "Once a day", "A few times a week", "Once a week", "Less than once a week", "Never"
- If not found, return null

### serviceTypes
- Look for text after "What type of services do you provide?"
- This is usually a single word or comma-separated list like "Hair", "Nails", "Hair, Nails, Esthetician"
- If not found, return null

### userInterests
- Look for the list after "Please select the feature areas you're interested in shaping and influencing."
- These are comma-separated areas like "Booking website, Service set-up and pricing, Payments & checkout experience"
- If not found, return null

### contactEmail
- Look for the email address, typically after "GlossGenius Email" or "Email"
- Must be a valid email format (contains @ and domain)
- If not found, return null

## Important
- Return ONLY valid JSON - no explanations, no markdown formatting
- Preserve the original text exactly as written (don't correct spelling/grammar)
- If a field cannot be found, use null for that field
- The featureDescription is the most important field - never return it as null or empty`,
  model: "anthropic/claude-sonnet-4-5-20250929",
});

