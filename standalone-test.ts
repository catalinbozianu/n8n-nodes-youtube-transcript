import {
  IExecuteFunctions,
  INode,
} from 'n8n-workflow';
import { YoutubeTranscriptNode } from './nodes/YoutubeTranscriptNode/YoutubeTranscriptNode.node';

// Check if we have a YouTube URL/ID from command line argument
const providedYoutubeUrl = process.argv[2] || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Default to Rick Roll if no URL provided

// Create a simplified mock of the n8n execution environment
const mockExecuteFunctions: Partial<IExecuteFunctions> = {
  getNodeParameter: (parameterName: string, itemIndex: number, fallbackValue?: any): any => {
    if (parameterName === 'youtubeId') {
      return providedYoutubeUrl;
    }
    // Handle options collection parameter
    if (parameterName === 'options') {
      return {}; // Return empty options, the node will pick up the command-line flags
    }
    return fallbackValue;
  },
  getInputData: () => [{ json: {} }],
  continueOnFail: () => false,
  getNode: () => ({ 
    name: 'Youtube Transcript', 
    type: 'youtubeTranscriptNode',
    id: 'test-id',
    typeVersion: 1,
    position: [0, 0],
    parameters: {}
  } as INode),
};

// Simple test function to run the node with provided command-line arguments
async function testNode() {
  console.log('Starting YouTube Transcript test...');
  console.log(`Testing video: ${providedYoutubeUrl}`);
  console.log('---------------------------------------');
  
  // Use the actual node directly
  const node = new YoutubeTranscriptNode();
  
  try {
    // Cast our partial mock to the full interface that the function expects
    const result = await node.execute.call(mockExecuteFunctions as IExecuteFunctions);
    
    console.log('---------------------------------------');
    
    // Only process result if waitAfterTranscript isn't enabled (otherwise node handles it)
    if (!process.argv.includes('--wait-after')) {
      console.log('✅ Success! Got transcript data:');
      if (result && result[0] && result[0][0] && result[0][0].json) {
        // Get the YouTube ID that was extracted from the URL (if applicable)
        const extractedId = result[0][0].json.youtubeId;
        console.log(`YouTube ID used: ${extractedId}`);
        
        // Check for transcript segments
        const transcript = result[0][0].json.transcript;
        if (transcript && Array.isArray(transcript)) {
          console.log('\nTranscript segments sample:');
          console.log('---------------------------------------');
          
          // Display the first 5 segments with timestamp and text
          const segmentsToShow = Math.min(5, transcript.length);
          for (let i = 0; i < segmentsToShow; i++) {
            const segment = transcript[i];
            console.log(`[${segment.timestamp}] ${segment.text}`);
          }
          
          // Show total count
          console.log('---------------------------------------');
          console.log(`Total segments: ${transcript.length}`);
          
          // Save to file option
          if (process.argv.includes('--save')) {
            const fs = require('fs');
            const filename = `transcript-${extractedId}.json`;
            fs.writeFileSync(filename, JSON.stringify(transcript, null, 2));
            console.log(`Transcript saved to ${filename}`);
          }
        }
      } else {
        console.log('Result structure:', JSON.stringify(result, null, 2));
      }
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error running node:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    
    process.exit(1);
  }
}

// Show usage instructions
console.log('\n=== YouTube Transcript Node Standalone Tester ===');
console.log('Usage: npm run test-run -- [YouTube URL or ID] [options]');
console.log('Options:');
console.log('  --save         Save transcript to a text file');
console.log('  --slow-mo      Slow down Puppeteer operations for better visibility');
console.log('  --devtools     Open Chrome DevTools automatically');
console.log('  --debugger     Break at debugger statement before checking for transcript');
console.log('  --wait-after   Keep browser open after getting transcript for inspection');
console.log('  --no-headless  Force non-headless mode even without debug flags');
console.log('======================================\n');

// Run the node
testNode()
  .then(() => {
    if (!process.argv.includes('--wait-after')) {
      console.log('\nTest completed successfully!');
      process.exit(0);
    }
  })
  .catch(err => {
    console.error('\nTest failed:', err);
    process.exit(1);
  }); 