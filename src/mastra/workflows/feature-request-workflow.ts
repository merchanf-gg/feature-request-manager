import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

const formInputSchema = z.object({
    featureDescription: z.string().describe("Raw feature request description from Typeform"),
    usageFrequency: z.string().optional().describe("How often the user needs this feature"),
    serviceTypes: z.string().optional().describe("Types of services the user provides"),
    userInterests: z.string().optional().describe("User interests or areas"),
    contactEmail: z.string().optional().describe("User's contact email (will be sanitized)"),
  });

const jiraStoryOutputSchema = z.object({
  summary: z.string().describe("Short Jira ticket title / summary"),
  description: z.string().describe("The description of the Jira story"),
  acceptanceCriteria: z.string().describe("The acceptance criteria of the Jira story"),
  noteForQA: z.string().describe("A note for the QA team to test the story"),
  storyPoints: z.number().describe("The story points of the Jira story"),
  // Highest priority is 1, lowest priority is 5
  priority: z.enum(["1", "2", "3", "4", "5"]).describe("The priority of the Jira story"),
});

/**
 * Step 1: Convert whole Typeform response to a JSON object
 * Uses the typeformParserAgent to extract structured data from raw notification text
 */
const convertTypeformResponseToJSON = createStep({
  id: "convert-typeform-response-to-json",
  description: "Converts the whole Typeform response to a JSON object using AI parsing",
  inputSchema: z.object({
    text: z.string().describe("The whole Typeform response as a text string"),
  }),
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

const analyzeFeatureRequest = createStep({
  id: "analyze-feature-request",
  description: "Analyzes the feature request and prepares it for Jira using AI",
  inputSchema: formInputSchema,
  outputSchema: jiraStoryOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const { featureDescription, usageFrequency, serviceTypes, userInterests, contactEmail } = inputData;

    const agent = mastra?.getAgent("jiraFeatureRequestAgent");
    if (!agent) {
      throw new Error("Jira Feature Request agent not found");
    }

    console.log("🎫 Analyzing feature request and generating Jira ticket...");

    // Build a structured prompt for the agent with all available context
    const prompt = `Please analyze the following feature request and generate a complete Jira ticket specification.

## Feature Request Details

**Feature Description:**
${featureDescription}

**Usage Frequency:** ${usageFrequency || "Not specified"}

**Service Types:** ${serviceTypes || "Not specified"}

**User Interests:** ${userInterests || "Not specified"}

---

Generate a comprehensive Jira ticket with all required fields. Remember to:
1. Create an actionable, specific ticket title
2. Include detailed problem statement and proposed solution
3. Write 8-12 testable acceptance criteria
4. Provide thorough QA testing notes
5. Estimate story points with justification
6. Assign appropriate priority based on the scoring rubric

Return ONLY valid JSON with no markdown formatting.`;

    const response = await agent.generate(prompt);
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
      throw new Error(`Failed to parse Jira ticket response: ${error}`);
    }

    // Validate and extract required fields
    const summary = parsedResponse.summary || `[Feature] - ${featureDescription.substring(0, 80)}`;
    const description = parsedResponse.description || "";
    const acceptanceCriteria = parsedResponse.acceptanceCriteria || "";
    const noteForQA = parsedResponse.noteForQA || "";
    const storyPoints = typeof parsedResponse.storyPoints === "number" 
      ? parsedResponse.storyPoints 
      : 5; // Default to 5 if not provided
    const priority = ["1", "2", "3", "4", "5"].includes(parsedResponse.priority) 
      ? parsedResponse.priority 
      : "3"; // Default to medium priority

    console.log("✅ Jira ticket generated successfully");
    console.log(`   Title: ${summary}`);
    console.log(`   Priority: P${priority} | Story Points: ${storyPoints}`);

    return {
      summary,
      description,
      acceptanceCriteria,
      noteForQA,
      storyPoints,
      priority: priority as "1" | "2" | "3" | "4" | "5",
    };
  },
});

const featureRequestWorkflow = createWorkflow({
  id: "feature-request-workflow",
  description: "Processes feature requests: sanitizes PII, analyzes with LLM, and prepares a Jira-ready story",
  inputSchema: formInputSchema,
  outputSchema: jiraStoryOutputSchema,
})
  // Webhook route already provides structured fields; analyze directly.
  .then(analyzeFeatureRequest)

featureRequestWorkflow.commit();

export { featureRequestWorkflow };

