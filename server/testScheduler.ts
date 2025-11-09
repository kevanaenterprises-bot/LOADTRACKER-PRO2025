import { aiTestingService } from './aiTestingService';
import { sendEmail } from './emailService';
import { db } from './db';
import { testRuns } from '../shared/schema';
import { desc } from 'drizzle-orm';

class TestScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Run tests every 12 hours (in milliseconds)
  private readonly INTERVAL = 12 * 60 * 60 * 1000;

  start() {
    if (this.intervalId) {
      console.log('⚠️ Test scheduler already running');
      return;
    }

    console.log('🕐 Starting AI test scheduler (runs every 12 hours)');
    
    // Run immediately on startup
    this.runScheduledTest();

    // Then run every 12 hours
    this.intervalId = setInterval(() => {
      this.runScheduledTest();
    }, this.INTERVAL);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Test scheduler stopped');
    }
  }

  private async runScheduledTest() {
    if (this.isRunning) {
      console.log('⚠️ Test already running, skipping scheduled run');
      return;
    }

    this.isRunning = true;

    try {
      console.log('🧪 Running scheduled comprehensive test suite...');
      const testRunId = await aiTestingService.runComprehensiveTests();

      // Check if tests failed and send alerts
      const [testRun] = await db.select()
        .from(testRuns)
        .where(desc(testRuns.startedAt))
        .limit(1);

      if (testRun && (testRun.failedTests ?? 0) > 0 && !testRun.alertsSent) {
        await this.sendFailureAlert(testRun);
      }

    } catch (error) {
      console.error('❌ Scheduled test run failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  private async sendFailureAlert(testRun: any) {
    try {
      console.log('🚨 Sending failure alerts for test run:', testRun.id);

      const subject = `⚠️ LoadTracker Pro: ${testRun.failedTests} Tests Failed`;
      const htmlBody = `
        <h2>Automated Test Failure Alert</h2>
        <p><strong>Test Run ID:</strong> ${testRun.id}</p>
        <p><strong>Started:</strong> ${new Date(testRun.startedAt).toLocaleString()}</p>
        <p><strong>Status:</strong> ${testRun.status}</p>
        
        <h3>Results Summary:</h3>
        <ul>
          <li>Total Tests: ${testRun.totalTests}</li>
          <li>✅ Passed: ${testRun.passedTests}</li>
          <li>❌ Failed: ${testRun.failedTests}</li>
        </ul>

        ${testRun.aiAnalysis ? `
        <h3>AI Analysis:</h3>
        <p>${testRun.aiAnalysis}</p>
        ` : ''}

        ${testRun.aiRecommendations && testRun.aiRecommendations.length > 0 ? `
        <h3>AI Recommendations:</h3>
        <ul>
          ${testRun.aiRecommendations.map((rec: string) => `<li>${rec}</li>`).join('')}
        </ul>
        ` : ''}

        <p><strong>Action Required:</strong> Please review the test results and address the failures.</p>
        <p><em>This is an automated alert from LoadTracker Pro AI Testing System</em></p>
      `;

      // Send email to admin
      await sendEmail({
        to: process.env.ADMIN_EMAIL || 'admin@loadtrackerpro.com',
        subject,
        html: htmlBody,
      });

      // Mark alerts as sent
      await db.update(testRuns)
        .set({ alertsSent: true })
        .where(desc(testRuns.startedAt));

      console.log('✅ Failure alerts sent successfully');

    } catch (error) {
      console.error('❌ Failed to send failure alerts:', error);
    }
  }
}

export const testScheduler = new TestScheduler();
