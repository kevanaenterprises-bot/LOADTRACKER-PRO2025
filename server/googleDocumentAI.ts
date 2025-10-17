import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

export interface ExtractedLoadData {
  loadNumber?: string;
  poNumber?: string;
  appointmentTime?: string;
  companyName?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  confidence: number;
  rawText?: string;
}

// Initialize Google Document AI client
let documentAIClient: DocumentProcessorServiceClient | null = null;

function getDocumentAIClient(): DocumentProcessorServiceClient {
  if (!documentAIClient) {
    // Parse the JSON credentials from environment variable
    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '{}');
    
    documentAIClient = new DocumentProcessorServiceClient({
      credentials: credentials,
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    });
  }
  
  return documentAIClient;
}

export async function extractLoadDataFromDocument(fileBuffer: Buffer, mimeType: string): Promise<ExtractedLoadData> {
  try {
    const client = getDocumentAIClient();
    
    // Determine processor name
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    const location = process.env.GOOGLE_DOCUMENT_AI_LOCATION || 'us'; // Default location
    const processorId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID;
    
    if (!projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT_ID environment variable is not set');
    }
    
    if (!processorId) {
      throw new Error('GOOGLE_DOCUMENT_AI_PROCESSOR_ID environment variable is not set');
    }
    
    const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;
    
    console.log('🔍 Processing document with Google Document AI...');
    console.log(`   Processor: ${name}`);
    console.log(`   MIME type: ${mimeType}`);
    console.log(`   File size: ${fileBuffer.length} bytes`);
    
    // Process the document
    const [result] = await client.processDocument({
      name,
      rawDocument: {
        content: fileBuffer,
        mimeType: mimeType,
      },
    });
    
    const { document } = result;
    const rawText = document?.text || '';
    
    console.log('📄 Extracted raw text length:', rawText.length);
    console.log('📄 Raw text preview:', rawText.substring(0, 500));
    
    // Extract structured data using pattern matching
    const extractedData = extractLogisticsData(rawText);
    
    // Calculate confidence based on how many fields we found
    const fieldsFound = [
      extractedData.loadNumber,
      extractedData.poNumber,
      extractedData.appointmentTime,
      extractedData.companyName,
      extractedData.pickupAddress,
      extractedData.deliveryAddress
    ].filter(Boolean).length;
    
    const confidence = fieldsFound > 0 ? Math.min(0.5 + (fieldsFound * 0.1), 0.95) : 0.3;
    
    console.log('✅ Document AI extraction complete');
    console.log(`   Fields found: ${fieldsFound}/6`);
    console.log(`   Confidence: ${Math.round(confidence * 100)}%`);
    
    return {
      ...extractedData,
      confidence,
      rawText: rawText.substring(0, 2000) // Limit raw text to first 2000 chars
    };
    
  } catch (error) {
    console.error('❌ Google Document AI error:', error);
    
    // Check if it's an image quality issue
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.toLowerCase().includes('quality') || 
        errorMessage.toLowerCase().includes('resolution') ||
        errorMessage.toLowerCase().includes('invalid image')) {
      throw new Error('Image quality too low for OCR processing. Please try:\n• Taking photo in better lighting\n• Using a scanner instead of camera\n• Ensuring image is in focus and clear\n• Uploading a higher resolution image');
    }
    
    throw new Error(`Document AI processing failed: ${errorMessage}`);
  }
}

function extractLogisticsData(text: string): Omit<ExtractedLoadData, 'confidence' | 'rawText'> {
  const data: Omit<ExtractedLoadData, 'confidence' | 'rawText'> = {};
  
  // Extract load number (various patterns)
  const loadPatterns = [
    /(?:load|trip|order)[\s#:]*(\d{3}[-]?\d{5,6})/i,
    /\b(\d{3}[-]\d{5,6})\b/,
    /(?:ref|reference)[\s#:]*([A-Z0-9]{6,15})/i,
  ];
  
  for (const pattern of loadPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.loadNumber = match[1].trim();
      break;
    }
  }
  
  // Extract PO number
  const poPatterns = [
    /(?:PO|P\.O\.|purchase\s+order)[\s#:]*([A-Z0-9-]{4,20})/i,
    /PO#?\s*([A-Z0-9-]{4,20})/i,
  ];
  
  for (const pattern of poPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.poNumber = match[1].trim();
      break;
    }
  }
  
  // Extract dates/appointment times
  const datePatterns = [
    /(?:appointment|pickup|delivery|date)[\s:]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i,
    /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)\b/i,
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      data.appointmentTime = match[1].trim();
      break;
    }
  }
  
  // Extract company names (look for common logistics terms)
  const companyPatterns = [
    /(?:carrier|broker|company)[\s:]*([A-Z][A-Za-z\s&,\.]{5,50}?)(?:\n|$|[A-Z]{2}\s+\d{5})/i,
    /(?:shipper|consignee)[\s:]*([A-Z][A-Za-z\s&,\.]{5,50}?)(?:\n|$|[A-Z]{2}\s+\d{5})/i,
  ];
  
  for (const pattern of companyPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.companyName = match[1].trim();
      break;
    }
  }
  
  // Extract addresses (look for city, state, zip patterns)
  const addressPattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/g;
  const addresses: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  
  while ((match = addressPattern.exec(text)) !== null) {
    addresses.push(match);
  }
  
  if (addresses.length > 0) {
    // First address is likely pickup
    data.pickupAddress = addresses[0][0].trim();
    
    // Second address (if exists) is likely delivery
    if (addresses.length > 1) {
      data.deliveryAddress = addresses[1][0].trim();
    }
  }
  
  return data;
}
