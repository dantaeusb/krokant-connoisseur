import { GoogleGenAI } from "@google/genai";

export const gemini = new GoogleGenAI({
    vertexai: true,
    location: "europe-west9",
    apiKey: process.env.GOOGLE_API_KEY || "",
});