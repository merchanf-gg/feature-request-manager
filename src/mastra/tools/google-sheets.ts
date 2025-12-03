import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Google Sheets append tool for feature request data
 * 
 * Note: This tool requires Google Sheets API credentials to be configured.
 * In production, you would use the Google Sheets API client or a service
 * like Mastra's built-in Google Sheets integration.
 * 
 * For now, this tool provides the interface and logs the data that would
 * be appended. Replace the execute function with actual Google Sheets API
 * calls in production.
 */

export const featureRequestRowSchema = z.object({
  request_id: z.string(),
  timestamp: z.string(),
  feature_name: z.string(),
  description: z.string(),
  domain: z.string(),
  niche: z.string().describe("Comma-separated service categories"),
  keywords: z.string().describe("Comma-separated keywords"),
  frequency: z.string(),
  user_id: z.string(),
});

export type FeatureRequestRow = z.infer<typeof featureRequestRowSchema>;

export const appendToGoogleSheetsTool = createTool({
  id: "append-to-google-sheets",
  description:
    "Appends a processed feature request row to the Google Sheets spreadsheet for tracking and analytics.",
  inputSchema: featureRequestRowSchema,
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    rowData: featureRequestRowSchema.optional(),
  }),
  execute: async ({ context }) => {
    const {
      request_id,
      timestamp,
      feature_name,
      description,
      domain,
      niche,
      keywords,
      frequency,
      user_id,
    } = context;

    // Prepare the row data in the correct column order
    const rowValues = [
      request_id,
      timestamp,
      feature_name,
      description,
      domain,
      niche,
      keywords,
      frequency,
      user_id,
    ];

    try {
      // In production, replace this with actual Google Sheets API call:
      // 
      // const { google } = require('googleapis');
      // const sheets = google.sheets({ version: 'v4', auth: client });
      // 
      // await sheets.spreadsheets.values.append({
      //   spreadsheetId: process.env.GOOGLE_SHEET_ID,
      //   range: 'Feature Requests!A:I',
      //   valueInputOption: 'USER_ENTERED',
      //   insertDataOption: 'INSERT_ROWS',
      //   requestBody: {
      //     values: [rowValues],
      //   },
      // });

      console.log("📊 Google Sheets Row Data:");
      console.log("═══════════════════════════════════════════════════════════");
      console.log(`Request ID:    ${request_id}`);
      console.log(`Timestamp:     ${timestamp}`);
      console.log(`Feature:       ${feature_name}`);
      console.log(`Description:   ${description}`);
      console.log(`Domain:        ${domain}`);
      console.log(`Niche:         ${niche}`);
      console.log(`Keywords:      ${keywords}`);
      console.log(`Frequency:     ${frequency}`);
      console.log(`User ID:       ${user_id}`);
      console.log("═══════════════════════════════════════════════════════════");

      return {
        success: true,
        message: `Successfully prepared row for Google Sheets (request_id: ${request_id})`,
        rowData: context,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to append to Google Sheets:", errorMessage);
      
      return {
        success: false,
        message: `Failed to append to Google Sheets: ${errorMessage}`,
      };
    }
  },
});

/**
 * Converts arrays to comma-separated strings for Google Sheets
 */
export function arrayToCSV(arr: string[]): string {
  return arr.join(", ");
}

