import Anthropic from '@anthropic-ai/sdk';

// Use a valid Anthropic model - configurable via environment or fallback to known good model
const DEFAULT_MODEL_STR = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

// Lazy initialization of Anthropic client
let anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('AI assistant unavailable: ANTHROPIC_API_KEY not configured');
    }
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropic;
}

export class AIService {
  async chat(messages: Array<{ role: 'user' | 'assistant', content: string }>): Promise<string> {
    try {
      const client = getAnthropicClient();
      const response = await client.messages.create({
        model: DEFAULT_MODEL_STR,
        max_tokens: 1024,
        system: `You are a helpful AI assistant for LoadTracker Pro, a load management system for GO 4 Farms & Cattle trucking company based in Melissa, Texas. 

You can help users with:
- General questions about the trucking and logistics industry
- Explaining features of the LoadTracker Pro system
- Providing guidance on load management best practices
- Answering questions about freight, drivers, and transportation
- General conversation and assistance

Be friendly, professional, and helpful. If users ask about specific technical issues with the system, suggest they contact their system administrator.`,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      });

      // Return the text content from the first content block
      const firstContent = response.content[0];
      if (firstContent.type === 'text') {
        return firstContent.text;
      }
      throw new Error('Unexpected response format from Anthropic API');
    } catch (error) {
      console.error('AI Service Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error('Failed to get AI response: ' + errorMessage);
    }
  }

  async generateResponse(userMessage: string, conversationHistory: Array<{ role: 'user' | 'assistant', content: string }> = []): Promise<string> {
    // Combine conversation history with new message
    const messages = [
      ...conversationHistory,
      { role: 'user' as const, content: userMessage }
    ];

    return await this.chat(messages);
  }
}

export const aiService = new AIService();