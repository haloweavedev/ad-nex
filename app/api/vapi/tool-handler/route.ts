import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    console.log("Vapi tool handler called");
    
    const payload = await request.json();
    console.log("Tool handler payload:", JSON.stringify(payload, null, 2));
    
    // Check if this is a tool-calls message from Vapi
    if (payload.message && payload.message.type === 'tool-calls' && payload.message.toolCallList) {
      const toolCalls = payload.message.toolCallList;
      
      console.log(`Received ${toolCalls.length} tool call(s)`);
      
      // Process each tool call and prepare results
      const results = [];
      
      for (const toolCall of toolCalls) {
        console.log(`Tool call ID: ${toolCall.id}`);
        console.log(`Tool name: ${toolCall.name}`);
        console.log(`Tool arguments:`, toolCall.arguments);
        
        // Placeholder result for each tool call
        let result = {};
        
        switch (toolCall.name) {
          case 'identifyPatient':
            result = {
              status: "Patient identification received",
              message: "LAINE backend received patient details. Integration with patient database not yet implemented.",
              receivedData: toolCall.arguments
            };
            break;
            
          case 'checkAvailability':
            result = {
              status: "Availability check received",
              message: "LAINE backend received availability request. Integration with scheduling system not yet implemented.",
              receivedData: toolCall.arguments
            };
            break;
            
          case 'scheduleAppointment':
            result = {
              status: "Appointment scheduling received",
              message: "LAINE backend received appointment request. Integration with scheduling system not yet implemented.",
              receivedData: toolCall.arguments
            };
            break;
            
          default:
            result = {
              status: "Unknown tool call",
              message: `Tool ${toolCall.name} is not recognized by LAINE backend`,
              receivedData: toolCall.arguments
            };
        }
        
        results.push({
          toolCallId: toolCall.id,
          result: JSON.stringify(result)
        });
      }
      
      console.log("Sending results back to Vapi:", results);
      return NextResponse.json({ results });
      
    } else {
      console.log("Non-tool-call message received:", payload.message?.type);
      return NextResponse.json({ 
        message: "Received non-tool-call message" 
      });
    }
    
  } catch (error) {
    console.error("Error in Vapi tool handler:", error);
    return NextResponse.json(
      { error: "Internal server error in tool handler" },
      { status: 500 }
    );
  }
} 