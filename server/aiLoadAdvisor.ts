import OpenAI from 'openai';
import { db } from './db';
import { users, loads, trucks } from '../shared/schema';
import { eq, and, sql } from 'drizzle-orm';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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
  async getDriverRecommendation(loadDetails: LoadDetails): Promise<DriverRecommendation> {
    try {
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
Driver ${i + 1}: ${d.name}
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

Respond in this exact JSON format:
{
  "recommendedDriverId": "driver-uuid",
  "confidence": "high|medium|low",
  "reasoning": "2-3 sentence explanation",
  "keyFactors": ["factor 1", "factor 2", "factor 3"]
}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert logistics advisor specializing in driver assignment optimization for trucking companies. You analyze driver performance, availability, and cost-efficiency to make optimal recommendations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const aiResponse = completion.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error('No response from AI');
      }

      const recommendation = JSON.parse(aiResponse);
      
      // Find the recommended driver
      const recommendedDriver = driverAnalysis.find(d => d.id === recommendation.recommendedDriverId);
      
      if (!recommendedDriver) {
        throw new Error('AI recommended a driver that does not exist');
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

  async isAvailable(): Promise<boolean> {
    return !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL);
  }
}

export const aiLoadAdvisor = new AILoadAdvisor();
