import { db } from './db';
import { users, loads, trucks } from '../shared/schema';
import { eq, and, sql } from 'drizzle-orm';

interface LoadDetails {
  pickupLocation?: string;
  pickupCity?: string;
  pickupState?: string;
  deliveryLocation?: string;
  deliveryCity?: string;
  deliveryState?: string;
  estimatedMiles?: number;
  customerId?: string;
}

interface DriverRecommendation {
  driverId: string;
  driverName: string;
  truckNumber: string | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  estimatedProfit?: number;
  keyFactors: string[];
}

export class AILoadAdvisor {
  private getOpenAIConfig(): { apiKey: string; baseURL: string } {
    // Try Replit AI Integration first (development)
    const replitApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const replitBaseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    
    if (replitApiKey && replitBaseURL) {
      console.log('🤖 Using Replit AI Integration for OpenAI');
      return {
        apiKey: replitApiKey,
        baseURL: replitBaseURL,
      };
    }
    
    // Fall back to custom OpenAI API key (production)
    const customApiKey = process.env.OPENAI_API_KEY;
    
    if (customApiKey) {
      console.log('🤖 Using custom OpenAI API key');
      return {
        apiKey: customApiKey,
        baseURL: 'https://api.openai.com/v1',
      };
    }
    
    throw new Error('AI Load Advisor is not configured. Please add OPENAI_API_KEY to your secrets.');
  }

  private async callOpenAI(messages: any[]): Promise<any> {
    const config = this.getOpenAIConfig();
    
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  async getDriverRecommendation(loadDetails: LoadDetails): Promise<DriverRecommendation> {
    try {
      // Check if AI is available before proceeding
      if (!this.isAvailableSync()) {
        throw new Error('AI Load Advisor is not available in this environment');
      }
      
      // Fetch all active drivers with their trucks and recent load history
      const drivers = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          phoneNumber: users.phoneNumber,
          isCompanyDriver: users.isCompanyDriver,
          payType: users.payType,
          percentageRate: users.percentageRate,
          mileageRate: users.mileageRate,
        })
        .from(users)
        .where(eq(users.role, 'driver'));

      // Fetch recent load history for each driver (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentLoads = await db
        .select({
          driverId: loads.driverId,
          status: loads.status,
          estimatedMiles: loads.estimatedMiles,
        })
        .from(loads)
        .where(
          and(
            sql`${loads.driverId} IS NOT NULL`,
            sql`${loads.createdAt} >= ${thirtyDaysAgo.toISOString()}`
          )
        );

      // Get truck assignments
      const trucksData = await db.select().from(trucks);

      // Build driver analysis data
      const driverAnalysis = drivers.map(driver => {
        const driverLoads = recentLoads.filter(l => l.driverId === driver.id);
        const completedLoads = driverLoads.filter(l => l.status === 'paid' || l.status === 'awaiting_payment');
        const totalMiles = driverLoads.reduce((sum, l) => sum + Number(l.estimatedMiles || 0), 0);
        const assignedTruck = trucksData.find(t => t.id === driver.id); // Match by driver ID for now

        return {
          name: `${driver.firstName} ${driver.lastName}`,
          id: driver.id,
          truckNumber: assignedTruck?.truckNumber || 'Unassigned',
          isCompanyDriver: driver.isCompanyDriver,
          payType: driver.payType,
          payRate: driver.payType === 'percentage' 
            ? `${driver.percentageRate}% of revenue`
            : `$${driver.mileageRate}/mile`,
          recentLoads: driverLoads.length,
          completedLoads: completedLoads.length,
          totalMilesLast30Days: totalMiles,
          onTimeRate: driverLoads.length > 0 
            ? `${Math.round((completedLoads.length / driverLoads.length) * 100)}%`
            : 'New driver',
        };
      });

      // Prepare prompt for OpenAI
      const prompt = `You are an AI advisor for a trucking company. Analyze the following load and drivers to recommend the BEST driver for this load.

LOAD DETAILS:
- Pickup: ${loadDetails.pickupCity || 'Unknown'}, ${loadDetails.pickupState || 'Unknown'}
- Delivery: ${loadDetails.deliveryCity || 'Unknown'}, ${loadDetails.deliveryState || 'Unknown'}
- Estimated Miles: ${loadDetails.estimatedMiles || 'Not specified'}

AVAILABLE DRIVERS:
${driverAnalysis.map((d, i) => `
Driver ${i + 1}:
- ID: ${d.id}
- Name: ${d.name}
- Truck: ${d.truckNumber}
- Company Driver: ${d.isCompanyDriver ? 'Yes (IFTA tracked)' : 'No (Owner-operator)'}
- Pay Structure: ${d.payRate}
- Recent Activity (30 days): ${d.recentLoads} loads assigned, ${d.completedLoads} completed
- Total Miles (30 days): ${d.totalMilesLast30Days}
- On-Time Rate: ${d.onTimeRate}
`).join('\n')}

YOUR TASK:
1. Recommend the SINGLE BEST driver for this load
2. Consider: pay structure, recent activity, availability, company vs owner-operator status
3. Provide clear reasoning for your recommendation
4. List 3-5 key factors that support your choice

IMPORTANT: Use the exact driver ID from the list above in your response.

Respond in this exact JSON format:
{
  "recommendedDriverId": "exact-driver-id-from-list-above",
  "confidence": "high|medium|low",
  "reasoning": "2-3 sentence explanation",
  "keyFactors": ["factor 1", "factor 2", "factor 3"]
}`;

      const completion = await this.callOpenAI([
        {
          role: 'system',
          content: 'You are an expert logistics advisor specializing in driver assignment optimization for trucking companies. You analyze driver performance, availability, and cost-efficiency to make optimal recommendations.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]);

      const aiResponse = completion.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error('No response from AI');
      }

      const recommendation = JSON.parse(aiResponse);
      
      // Find the recommended driver
      const recommendedDriver = driverAnalysis.find(d => d.id === recommendation.recommendedDriverId);
      
      if (!recommendedDriver) {
        console.error('❌ AI returned invalid driver ID:', recommendation.recommendedDriverId);
        console.error('Available driver IDs:', driverAnalysis.map(d => d.id));
        
        // Fallback to first available driver if AI returns invalid ID
        const fallbackDriver = driverAnalysis[0];
        if (!fallbackDriver) {
          throw new Error('No drivers available for this load');
        }
        
        console.log('⚠️ Using fallback driver:', fallbackDriver.name);
        return {
          driverId: fallbackDriver.id,
          driverName: fallbackDriver.name,
          truckNumber: fallbackDriver.truckNumber,
          confidence: 'low' as const,
          reasoning: 'AI recommendation was unavailable. This is the first available driver in the system.',
          keyFactors: ['Fallback recommendation due to AI error', 'Manual review recommended'],
        };
      }

      // Calculate estimated profit if we have enough data
      let estimatedProfit: number | undefined;
      if (loadDetails.estimatedMiles && recommendedDriver.payType === 'percentage') {
        // Rough estimate: assume $2.50/mile revenue, subtract driver percentage
        const estimatedRevenue = loadDetails.estimatedMiles * 2.5;
        const driverPay = estimatedRevenue * (Number(recommendedDriver.payRate.match(/\d+/)?.[0] || 70) / 100);
        estimatedProfit = Math.round(estimatedRevenue - driverPay);
      } else if (loadDetails.estimatedMiles && recommendedDriver.payType === 'mileage') {
        const estimatedRevenue = loadDetails.estimatedMiles * 2.5;
        const driverPay = loadDetails.estimatedMiles * Number(recommendedDriver.payRate.match(/[\d.]+/)?.[0] || 1.5);
        estimatedProfit = Math.round(estimatedRevenue - driverPay);
      }

      return {
        driverId: recommendedDriver.id,
        driverName: recommendedDriver.name,
        truckNumber: recommendedDriver.truckNumber,
        confidence: recommendation.confidence,
        reasoning: recommendation.reasoning,
        estimatedProfit,
        keyFactors: recommendation.keyFactors || []
      };

    } catch (error) {
      console.error('❌ AI Load Advisor Error:', error);
      throw new Error('Failed to generate driver recommendation: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  private isAvailableSync(): boolean {
    // Check if either Replit AI Integration or custom OpenAI key is available
    const hasReplitIntegration = !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL);
    const hasCustomKey = !!process.env.OPENAI_API_KEY;
    return hasReplitIntegration || hasCustomKey;
  }

  async isAvailable(): Promise<boolean> {
    return this.isAvailableSync();
  }
}

export const aiLoadAdvisor = new AILoadAdvisor();
