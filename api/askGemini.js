// Path: api/askGemini.js

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  // --- 1. Retrieve API Key from Environment Variables ---
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("API Key Error: GEMINI_API_KEY is not set in environment variables.");
    return res.status(500).json({ error: "API key not configured on the server." });
  }

  const { drafts } = req.body; // Only 'drafts' is needed from the frontend now

  if (!drafts || !Array.isArray(drafts)) {
    return res.status(400).json({ error: "Missing or invalid 'drafts' in request body. It should be an array." });
  }

  // --- 2. Define Your Fixed Prompt ---
  const fixedPrompt = "If you're getting this, just say 'Hello there!' Ignore everything else."; // <-- REPLACE THIS WITH YOUR ACTUAL FIXED PROMPT

  // --- 3. Initialize the GoogleGenerativeAI client ---
  const genAI = new GoogleGenerativeAI(apiKey);
  // Ensure you choose a model that suits your needs (e.g., gemini-1.5-flash-latest, gemini-pro)
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest", 
  });
  
  // --- 4. Construct the full prompt for Gemini ---
  // This combines your fixed instructions with the drafts data.
  // Adjust the formatting of how drafts are presented to the model as needed for best results.
  let contentForGemini = `${fixedPrompt}\n\nHere are the drafts to consider:\n\n`;
  drafts.forEach((draftText, index) => {
    contentForGemini += `Draft ${index + 1}:\n"""\n${draftText}\n"""\n\n`;
  });

  console.log("Sending content to Gemini (first 500 chars):", contentForGemini.substring(0, 500) + "...");

  // --- 5. Define Generation Config and Safety Settings (Optional but Recommended) ---
  const generationConfig = {
    temperature: 0.7,    // Example: Controls randomness. Lower for more deterministic, higher for more creative.
    topK: 1,             // Example
    topP: 1,             // Example
    maxOutputTokens: 2048, // Adjust based on expected response length
  };

  const safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
  ];

  // --- 6. Call the Gemini API ---
  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: contentForGemini }] }],
      generationConfig,
      safetySettings,
    });
    
    const response = result.response;
    
    // Check if the response has text before trying to access it
    if (response && typeof response.text === 'function') {
        const generatedText = response.text();
        res.status(200).json({ generatedText: generatedText });
    } else {
        // Handle cases where response might be blocked or not as expected
        console.error("Gemini API response missing text function or response undefined. Full response:", response);
        let errorMessage = "Received an unexpected response structure from Gemini API.";
        if (response && response.promptFeedback && response.promptFeedback.blockReason) {
            errorMessage = `Request blocked by Gemini due to: ${response.promptFeedback.blockReason}`;
            console.error("Prompt feedback:", response.promptFeedback);
        } else if (response && response.candidates && response.candidates.length > 0 && response.candidates[0].finishReason !== 'STOP') {
            errorMessage = `Content generation stopped due to: ${response.candidates[0].finishReason}`;
             if (response.candidates[0].safetyRatings) {
                console.error("Safety ratings:", response.candidates[0].safetyRatings);
            }
        }
        res.status(500).json({ error: errorMessage });
    }

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    res.status(500).json({ error: "Failed to get response from Gemini API." });
  }
}
