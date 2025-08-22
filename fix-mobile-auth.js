// Quick fix for mobile authentication issues
// This script can be run in mobile browser console to test API calls directly

const BYPASS_TOKEN = 'LOADTRACKER_BYPASS_2025';
const LOAD_ID = '1d4df59c-1f72-4e3d-8812-472ae3414453';

async function testBOL(bolNumber = '5469') {
    console.log('Testing BOL validation...');
    try {
        const response = await fetch(`/api/bol/check/${bolNumber}`, {
            headers: { 'X-Bypass-Token': BYPASS_TOKEN }
        });
        const result = await response.json();
        console.log('BOL Result:', result);
        return result;
    } catch (error) {
        console.error('BOL Error:', error);
        return { error: error.message };
    }
}

async function testStatusUpdate(status = 'at_shipper') {
    console.log('Testing status update...');
    try {
        const response = await fetch(`/api/loads/${LOAD_ID}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'X-Bypass-Token': BYPASS_TOKEN
            },
            body: JSON.stringify({ status })
        });
        const result = await response.json();
        console.log('Status Result:', result);
        return result;
    } catch (error) {
        console.error('Status Error:', error);
        return { error: error.message };
    }
}

// Auto-run tests
async function runAllTests() {
    console.log('=== MOBILE AUTH FIX TESTS ===');
    const bolResult = await testBOL();
    const statusResult = await testStatusUpdate();
    
    console.log('=== RESULTS ===');
    console.log('BOL Test:', bolResult.exists !== undefined ? 'SUCCESS' : 'FAILED');
    console.log('Status Test:', statusResult.id ? 'SUCCESS' : 'FAILED');
}

// Run tests immediately
runAllTests();

// Make functions globally available
window.testBOL = testBOL;
window.testStatusUpdate = testStatusUpdate;
window.runAllTests = runAllTests;

console.log('Mobile auth fix loaded. Available functions: testBOL(), testStatusUpdate(), runAllTests()');