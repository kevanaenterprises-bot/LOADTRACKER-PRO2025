import { aiTestingService } from './aiTestingService';
import { sendEmail } from './emailService';
import { db } from './db';
import { testRuns } from '../shared/schema';
import { desc } from 'drizzle-orm';
import * as cron from 'node-cron';

class TestScheduler {
  private cronTask: ReturnType<typeof cron.schedule> | null = null;
  private isRunning = false;

  async start() {
    if (this.cronTask) {
      console.log('⚠️ Test scheduler already running');
      return;
    }

    console.log('🕐 Starting AI test scheduler (runs daily at midnight)');
    
    // Schedule tests to run at midnight every day (12:00 AM)
    // Cron format: '0 0 * * *' = minute hour day month dayOfWeek
    this.cronTask = cron.schedule('0 0 * * *', () => {
      this.runScheduledTest();
    }, {
      timezone: "America/New_York" // Adjust to your timezone
    });

    console.log('✅ Test scheduler configured to run daily at midnight');
  }

  private async getLastTestRun() {
    try {
      const [lastRun] = await db.select()
        .from(testRuns)
        .orderBy(desc(testRuns.startedAt))
        .limit(1);
      return lastRun || null;
    } catch (error) {
      return null;
    }
  }

  stop() {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
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
