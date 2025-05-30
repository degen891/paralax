// Path: api/askGemini.js

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

export default async function handler(req, res) {
  // Optional: You can keep the POST method check, or allow GET for this simple test
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  // 1. Retrieve API Key from Environment Variables
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("API Key Error: GEMINI_API_KEY is not set in environment variables.");
    return res.status(500).json({ error: "API key not configured on the server." });
  }

  // 2. Initialize the GoogleGenerativeAI client
  const genAI = new GoogleGenerativeAI(apiKey);
  // Use a common and available model for this basic test
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest", // Or "gemini-pro"
  });
  
  // 3. Define the simple, fixed prompt
  const simplePrompt = "Please respond with only the exact words: Hello there";

  console.log("Sending simple prompt to Gemini:", simplePrompt);

  // 4. Basic Safety Settings (recommended)
  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  ];
  
  // 5. Call the Gemini API
  try {
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: simplePrompt }] }],
        safetySettings, // Apply safety settings
        // generationConfig can be omitted for simplicity in this test,
        // or set to very basic values if needed.
        // generationConfig: {
        //   temperature: 0.7,
        //   maxOutputTokens: 50,
        // }
    });
    
    const response = result.response;
    
    if (response && typeof response.text === 'function') {
        const generatedText = response.text();
        console.log("Gemini Raw Response Text:", generatedText);
        // Check if Gemini responded as expected
        if (generatedText.trim() === "Hello there") {
            res.status(200).json({ message: "Success!", geminiResponse: generatedText });
        } else {
            res.status(200).json({ message: "Received response, but not 'Hello there'.", geminiResponse: generatedText });
        }
    } else {
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
        console.error("Error with Gemini Response Structure:", response);
        res.status(500).json({ error: errorMessage, fullResponse: response });
    }

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    res.status(500).json({ error: "Failed to get response from Gemini API.", details: error.message });
  }
}
