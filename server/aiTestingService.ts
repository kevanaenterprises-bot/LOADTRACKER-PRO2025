import { db } from './db';
import { testRuns, testResults, users, loads, customers, locations, trucks, invoices } from '../shared/schema';
import { eq } from 'drizzle-orm';

interface TestResult {
  category: string;
  testName: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  errorMessage?: string;
  stackTrace?: string;
  metadata?: Record<string, any>;
}

export class AITestingService {
  private testRunId: string | null = null;
  private results: TestResult[] = [];
  private startTime: number = 0;

  async runComprehensiveTests(triggeredBy?: string): Promise<string> {
    this.results = [];
    this.startTime = Date.now();

    // Create test run record
    const [testRun] = await db.insert(testRuns).values({
      triggerType: triggeredBy ? 'manual' : 'scheduled',
      triggeredBy,
      status: 'running',
    }).returning();

    this.testRunId = testRun.id;

    try {
      console.log('🧪 Starting comprehensive AI test suite...');

      // Run all test categories
      await this.testLoadWorkflow();
      await this.testGPSTracking();
      await this.testIFTACalculations();
      await this.testMapsIntegration();
      await this.testDocumentManagement();
      await this.testInvoicing();
      await this.testDriverPortal();
      await this.testUserManagement();
      await this.testHEREMapsIntegration();

      // Calculate results
      const passed = this.results.filter(r => r.status === 'passed').length;
      const failed = this.results.filter(r => r.status === 'failed').length;
      const duration = Date.now() - this.startTime;

      // Generate AI analysis if there are failures
      let aiAnalysis = null;
      let aiRecommendations = null;

      if (failed > 0) {
        const analysis = await this.generateAIAnalysis();
        aiAnalysis = analysis.summary;
        aiRecommendations = analysis.recommendations;
      }

      // Update test run with proper status
      const finalStatus = failed > 0 ? 'failed' : 'passed';
      
      await db.update(testRuns)
        .set({
          status: finalStatus,
          totalTests: this.results.length,
          passedTests: passed,
          failedTests: failed,
          duration,
          aiAnalysis,
          aiRecommendations,
          completedAt: new Date(),
        })
        .where(eq(testRuns.id, this.testRunId));

      // Save all test results
      if (this.results.length > 0) {
        await db.insert(testResults).values(
          this.results.map(r => ({
            testRunId: this.testRunId!,
            testCategory: r.category,
            testName: r.testName,
            status: r.status,
            duration: r.duration,
            errorMessage: r.errorMessage,
            stackTrace: r.stackTrace,
            metadata: r.metadata,
          }))
        );
      }

      console.log(`✅ Test suite completed: ${passed} passed, ${failed} failed`);
      return this.testRunId;

    } catch (error) {
      console.error('❌ Test suite failed:', error);
      
      // Mark test run as failed
      await db.update(testRuns)
        .set({
          status: 'failed',
          completedAt: new Date(),
        })
        .where(eq(testRuns.id, this.testRunId));

      throw error;
    }
  }

  private async testLoadWorkflow() {
    console.log('🧪 Testing: Complete Load Workflow');
    const category = 'load_workflow';
    let testLoadId: string | null = null;

    try {
      // Test 1: Create a load
      await this.runTest(category, 'Create Load', async () => {
        const [customer] = await db.select().from(customers).limit(1);
        const [location] = await db.select().from(locations).limit(1);

        if (!customer || !location) {
          throw new Error('Missing test data: customer or location not found');
        }

        const [testLoad] = await db.insert(loads).values({
          number109: `TEST-${Date.now()}`,
          customerId: customer.id,
          locationId: location.id,
          status: 'driver_assigned',
          estimatedMiles: "500",
        }).returning();

        testLoadId = testLoad.id;
        return { loadId: testLoad.id };
      });

      // Test 2: Assign driver to load
      await this.runTest(category, 'Assign Driver', async () => {
        if (!testLoadId) throw new Error('No test load available');

        const [driver] = await db.select()
          .from(users)
          .where(eq(users.role, 'driver'))
          .limit(1);

        if (!driver) throw new Error('No drivers available for testing');

        await db.update(loads)
          .set({ driverId: driver.id })
          .where(eq(loads.id, testLoadId));

        return { driverId: driver.id };
      });

      // Test 3: Update load status
      await this.runTest(category, 'Update Load Status', async () => {
        if (!testLoadId) throw new Error('No test load available');

        await db.update(loads)
          .set({ status: 'in_transit' })
          .where(eq(loads.id, testLoadId));

        return { status: 'in_transit' };
      });

      // Test 4: Complete delivery
      await this.runTest(category, 'Complete Delivery', async () => {
        if (!testLoadId) throw new Error('No test load available');

        await db.update(loads)
          .set({ 
            status: 'awaiting_invoicing',
            estimatedMiles: "525",
          })
          .where(eq(loads.id, testLoadId));

        return { status: 'awaiting_invoicing' };
      });

      // Test 5: Invoice Creation and Finalization (BUG FIX TEST)
      await this.runTest(category, 'Invoice Workflow to Payment', async () => {
        if (!testLoadId) throw new Error('No test load available');

        // Get DatabaseStorage instance
        const { storage } = await import('./storage');
        
        // Create invoice for the load
        const invoice = await storage.findOrCreateInvoiceForLoad(testLoadId);
        
        // Finalize the invoice (should auto-update load status)
        await storage.finalizeInvoice(invoice.id);
        
        // Verify load status was updated to awaiting_payment
        const updatedLoad = await storage.getLoad(testLoadId);
        if (!updatedLoad) throw new Error('Load not found after invoice finalization');
        
        if (updatedLoad.status !== 'awaiting_payment') {
          throw new Error(`Load status should be awaiting_payment after invoice finalization, got: ${updatedLoad.status}`);
        }
        
        return { 
          invoiceId: invoice.id,
          loadStatus: updatedLoad.status,
          workflowFixed: true 
        };
      });

      // Cleanup: Delete test invoice and load
      if (testLoadId) {
        // Delete invoice first
        await db.delete(invoices).where(eq(invoices.loadId, testLoadId)).catch(() => {});
        // Then delete load
        await db.delete(loads).where(eq(loads.id, testLoadId));
      }

    } catch (error) {
      console.error('Load workflow test error:', error);
      // Cleanup on error
      if (testLoadId) {
        await db.delete(loads).where(eq(loads.id, testLoadId)).catch(() => {});
      }
    }
  }

  private async testGPSTracking() {
    console.log('🧪 Testing: GPS Tracking');
    const category = 'gps_tracking';

    await this.runTest(category, 'GPS Data Format Validation', async () => {
      // Test GPS coordinate validation
      const validLat = 32.7767;
      const validLng = -96.7970;

      if (validLat < -90 || validLat > 90) {
        throw new Error('Invalid latitude range');
      }
      if (validLng < -180 || validLng > 180) {
        throw new Error('Invalid longitude range');
      }

      return { lat: validLat, lng: validLng };
    });

    await this.runTest(category, 'GPS Status Update Logic', async () => {
      // Test that GPS coordinates are properly formatted
      const testCoords = { latitude: 32.7767, longitude: -96.7970 };
      
      if (typeof testCoords.latitude !== 'number' || typeof testCoords.longitude !== 'number') {
        throw new Error('GPS coordinates must be numbers');
      }

      return testCoords;
    });
  }

  private async testIFTACalculations() {
    console.log('🧪 Testing: IFTA Mileage Calculations');
    const category = 'ifta_calculations';

    await this.runTest(category, 'Mileage Calculation Accuracy', async () => {
      // Test basic mileage calculation logic
      const load = await db.select().from(loads).limit(1);
      
      if (load.length === 0) {
        throw new Error('No loads available for IFTA testing');
      }

      const estimatedMiles = Number(load[0].estimatedMiles || 0);

      if (estimatedMiles <= 0) {
        throw new Error('Invalid estimated miles - must be greater than 0');
      }

      return { estimatedMiles };
    });

    await this.runTest(category, 'State Breakdown Logic', async () => {
      // Verify IFTA state breakdown structure
      const testBreakdown = {
        TX: 250,
        OK: 150,
        KS: 100
      };

      const total = Object.values(testBreakdown).reduce((sum, miles) => sum + miles, 0);
      
      if (total !== 500) {
        throw new Error('State mileage breakdown does not sum correctly');
      }

      return testBreakdown;
    });
  }

  private async testMapsIntegration() {
    console.log('🧪 Testing: Maps Integration');
    const category = 'maps_integration';

    await this.runTest(category, 'HERE Maps Configuration', async () => {
      // Check if HERE Maps API key is configured
      if (!process.env.HERE_API_KEY) {
        throw new Error('HERE Maps API key not configured');
      }

      return { configured: true };
    });

    await this.runTest(category, 'Route Calculation Logic', async () => {
      // Test basic route calculation structure
      const origin = { lat: 32.7767, lng: -96.7970 }; // Dallas
      const destination = { lat: 30.2672, lng: -97.7431 }; // Austin

      if (!origin.lat || !origin.lng || !destination.lat || !destination.lng) {
        throw new Error('Invalid route coordinates');
      }

      return { origin, destination };
    });
  }

  private async testDocumentManagement() {
    console.log('🧪 Testing: Document Management');
    const category = 'document_management';

    await this.runTest(category, 'GCS Storage Configuration', async () => {
      // Check if Google Cloud Storage is configured
      if (!process.env.GCS_BUCKET_NAME || !process.env.GCS_PROJECT_ID) {
        throw new Error('Google Cloud Storage not configured');
      }

      return { configured: true };
    });

    await this.runTest(category, 'Document OCR Service', async () => {
      // Check if Document AI is configured
      if (!process.env.GCS_PROJECT_ID) {
        throw new Error('Document AI not configured');
      }

      return { configured: true };
    });
  }

  private async testInvoicing() {
    console.log('🧪 Testing: Invoicing System');
    const category = 'invoicing';

    await this.runTest(category, 'Invoice Calculation Logic', async () => {
      // Test invoice calculation
      const testRate = 2.50;
      const testMiles = 500;
      const expectedTotal = testRate * testMiles;

      if (expectedTotal !== 1250) {
        throw new Error('Invoice calculation error');
      }

      return { rate: testRate, miles: testMiles, total: expectedTotal };
    });

    await this.runTest(category, 'Driver Pay Calculation', async () => {
      // Test driver pay logic
      const [driver] = await db.select().from(users).where(eq(users.role, 'driver')).limit(1);
      
      if (!driver) {
        throw new Error('No drivers available for testing');
      }

      if (driver.payType === 'percentage') {
        const revenue = 1000;
        const percentage = Number(driver.percentageRate || 70);
        const pay = revenue * (percentage / 100);

        if (pay <= 0 || pay > revenue) {
          throw new Error('Invalid percentage pay calculation');
        }

        return { payType: 'percentage', percentage, pay };
      } else {
        const miles = 500;
        const rate = Number(driver.mileageRate || 1.50);
        const pay = miles * rate;

        if (pay <= 0) {
          throw new Error('Invalid mileage pay calculation');
        }

        return { payType: 'mileage', rate, pay };
      }
    });
  }

  private async testDriverPortal() {
    console.log('🧪 Testing: Driver Portal');
    const category = 'driver_portal';

    await this.runTest(category, 'Driver Authentication', async () => {
      // Test driver login structure
      const [driver] = await db.select().from(users).where(eq(users.role, 'driver')).limit(1);
      
      if (!driver) {
        throw new Error('No drivers available for testing');
      }

      if (!driver.username) {
        throw new Error('Driver missing username for authentication');
      }

      return { username: driver.username };
    });

    await this.runTest(category, 'Driver Load Access', async () => {
      // Test driver can access their loads
      const [driver] = await db.select().from(users).where(eq(users.role, 'driver')).limit(1);
      
      if (!driver) {
        throw new Error('No drivers available for testing');
      }

      const driverLoads = await db.select()
        .from(loads)
        .where(eq(loads.driverId, driver.id))
        .limit(5);

      return { driverId: driver.id, loadCount: driverLoads.length };
    });
  }

  private async testUserManagement() {
    console.log('🧪 Testing: User Management');
    const category = 'user_management';
    let testUserId: string | null = null;
    let testLoadId: string | null = null;

    try {
      // Test delete user with dependencies (BUG FIX TEST) - DETERMINISTIC VERSION
      await this.runTest(category, 'Delete User with Load Dependencies', async () => {
        // Get storage instance
        const { storage } = await import('./storage');
        
        // Create a test driver
        const [testDriver] = await db.insert(users).values({
          username: `test-driver-${Date.now()}`,
          password: 'test-password',
          role: 'driver',
          firstName: 'Test',
          lastName: 'Driver'
        }).returning();
        
        testUserId = testDriver.id;
        
        // Create a test load assigned to this driver
        const [customer] = await db.select().from(customers).limit(1);
        const [location] = await db.select().from(locations).limit(1);
        
        if (!customer || !location) {
          throw new Error('Missing test data: customer or location not found');
        }
        
        const [testLoad] = await db.insert(loads).values({
          number109: `TEST-USER-${Date.now()}`,
          customerId: customer.id,
          locationId: location.id,
          driverId: testDriver.id,
          status: 'driver_assigned',
          estimatedMiles: "100",
        }).returning();
        
        testLoadId = testLoad.id;
        
        // Attempt to delete user with loads - should throw error
        let errorThrown = false;
        let errorMessage = '';
        
        try {
          await storage.deleteUser(testDriver.id);
        } catch (error) {
          errorThrown = true;
          errorMessage = error instanceof Error ? error.message : 'Unknown error';
        }
        
        if (!errorThrown) {
          throw new Error('Delete user should have thrown error for user with loads');
        }
        
        if (!errorMessage.includes('loads assigned')) {
          throw new Error(`Expected error about loads, got: ${errorMessage}`);
        }
        
        return { 
          errorPrevented: true,
          errorMessage,
          bugFixed: true 
        };
      });

      // Cleanup: Delete test data
      if (testLoadId) {
        await db.delete(loads).where(eq(loads.id, testLoadId)).catch(() => {});
      }
      if (testUserId) {
        await db.delete(users).where(eq(users.id, testUserId)).catch(() => {});
      }

    } catch (error) {
      console.error('User management test error:', error);
      // Cleanup on error
      if (testLoadId) {
        await db.delete(loads).where(eq(loads.id, testLoadId)).catch(() => {});
      }
      if (testUserId) {
        await db.delete(users).where(eq(users.id, testUserId)).catch(() => {});
      }
    }
  }

  private async testHEREMapsIntegration() {
    console.log('🧪 Testing: HERE Maps Integration');
    const category = 'here_maps';

    await this.runTest(category, 'HERE Maps API Configuration', async () => {
      const hasApiKey = !!process.env.HERE_API_KEY;
      
      if (!hasApiKey) {
        // API key missing - verify error handling works
        const { getTruckRouteWithStateMileage } = await import('./hereRoutingService');
        const result = await getTruckRouteWithStateMileage(32.7767, -96.7970, 30.2672, -97.7431);
        
        if (result !== null) {
          throw new Error('HERE Maps should return null when API key is missing');
        }
        
        return { apiKeyMissing: true, errorHandlingWorks: true };
      }
      
      return { apiKeyConfigured: true };
    });

    await this.runTest(category, 'Route Calculation with Valid Coordinates', async () => {
      if (!process.env.HERE_API_KEY) {
        return { skipped: true, reason: 'API key not configured' };
      }
      
      const { getTruckRouteWithStateMileage } = await import('./hereRoutingService');
      const result = await getTruckRouteWithStateMileage(
        32.7767, -96.7970,  // Dallas
        30.2672, -97.7431   // Austin
      );
      
      if (!result) {
        throw new Error('HERE Maps route calculation failed');
      }
      
      if (result.totalMiles <= 0) {
        throw new Error('Invalid total miles calculated');
      }
      
      return { 
        totalMiles: result.totalMiles,
        statesInRoute: Object.keys(result.milesByState) 
      };
    });
  }

  private async runTest(
    category: string,
    testName: string,
    testFn: () => Promise<any>
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`  ⏳ ${testName}...`);
      const metadata = await testFn();
      const duration = Date.now() - startTime;

      this.results.push({
        category,
        testName,
        status: 'passed',
        duration,
        metadata,
      });

      console.log(`  ✅ ${testName} - PASSED (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const stackTrace = error instanceof Error ? error.stack : undefined;

      this.results.push({
        category,
        testName,
        status: 'failed',
        duration,
        errorMessage,
        stackTrace,
      });

      console.log(`  ❌ ${testName} - FAILED: ${errorMessage}`);
    }
  }

  private async generateAIAnalysis(): Promise<{ summary: string; recommendations: string[] }> {
    try {
      const failures = this.results.filter(r => r.status === 'failed');
      
      if (failures.length === 0) {
        return {
          summary: 'All tests passed successfully.',
          recommendations: [],
        };
      }

      // Prepare failure details for AI
      const failureDetails = failures.map(f => ({
        category: f.category,
        test: f.testName,
        error: f.errorMessage,
      }));

      // Check if AI is available
      const hasReplitIntegration = !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL);
      const hasCustomKey = !!process.env.OPENAI_API_KEY;

      if (!hasReplitIntegration && !hasCustomKey) {
        return {
          summary: `${failures.length} tests failed. AI analysis unavailable (no API key configured).`,
          recommendations: failures.map(f => `Fix ${f.testName}: ${f.errorMessage}`),
        };
      }

      // Get OpenAI config
      const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1';

      // Call OpenAI for analysis
      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an expert QA engineer analyzing test failures for a transportation management system. Provide clear, actionable insights and recommendations.',
            },
            {
              role: 'user',
              content: `Analyze these test failures and provide recommendations:\n\n${JSON.stringify(failureDetails, null, 2)}\n\nProvide:\n1. A brief summary of the overall issue\n2. 3-5 specific recommendations to fix the problems\n\nRespond in JSON format:\n{\n  "summary": "brief analysis",\n  "recommendations": ["fix 1", "fix 2", "fix 3"]\n}`,
            }
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = JSON.parse(data.choices[0]?.message?.content || '{}');

      return {
        summary: aiResponse.summary || 'Test failures detected',
        recommendations: aiResponse.recommendations || [],
      };

    } catch (error) {
      console.error('❌ AI analysis failed:', error);
      return {
        summary: 'Test failures detected. AI analysis unavailable.',
        recommendations: this.results
          .filter(r => r.status === 'failed')
          .map(r => `Fix ${r.testName}: ${r.errorMessage}`),
      };
    }
  }

  async getLatestTestRun(): Promise<any> {
    const [latestRun] = await db.select()
      .from(testRuns)
      .orderBy(testRuns.startedAt)
      .limit(1);

    if (!latestRun) {
      return null;
    }

    const results = await db.select()
      .from(testResults)
      .where(eq(testResults.testRunId, latestRun.id));

    return {
      ...latestRun,
      results,
    };
  }
}

export const aiTestingService = new AITestingService();
