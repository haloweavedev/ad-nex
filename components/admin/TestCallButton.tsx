"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Phone, PhoneOff, Mic, MicOff } from "lucide-react";

interface TestCallButtonProps {
  assistantId: string | null;
  vapiPublicKey: string | undefined;
}

type CallStatus = 'idle' | 'connecting' | 'ringing' | 'active' | 'ended' | 'error';

interface TranscriptEntry {
  timestamp: Date;
  role: 'user' | 'assistant';
  content: string;
}

export default function TestCallButton({ assistantId, vapiPublicKey }: TestCallButtonProps) {
  const [vapiInstance, setVapiInstance] = useState<any>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [transcriptLog, setTranscriptLog] = useState<TranscriptEntry[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);

  // Initialize Vapi Web SDK
  useEffect(() => {
    if (!vapiPublicKey) return;

    let currentVapiInstance: any = null;

    const initVapi = async () => {
      try {
        // Dynamic import to avoid SSR issues
        const { default: Vapi } = await import("@vapi-ai/web");
        const vapi = new Vapi(vapiPublicKey);
        currentVapiInstance = vapi;
        setVapiInstance(vapi);

        // Set up event listeners
        vapi.on('call-start', () => {
          console.log('Call started');
          setCallStatus('active');
          setCallStartTime(new Date());
          setTranscriptLog(prev => [...prev, {
            timestamp: new Date(),
            role: 'assistant' as const,
            content: 'Call started...'
          }]);
          toast.success("Call connected successfully");
        });

        vapi.on('call-end', () => {
          console.log('Call ended');
          setCallStatus('ended');
          setCallStartTime(null);
          setCallDuration(0);
          setTranscriptLog(prev => [...prev, {
            timestamp: new Date(),
            role: 'assistant' as const,
            content: 'Call ended.'
          }]);
          toast.info("Call has ended");
        });

        vapi.on('speech-start', () => {
          console.log('Assistant speech started');
        });

        vapi.on('speech-end', () => {
          console.log('Assistant speech ended');
        });

        vapi.on('message', (message: any) => {
          console.log('Vapi message:', message);
          
          if (message.type === 'transcript' && message.transcriptType === 'final') {
            setTranscriptLog(prev => [...prev, {
              timestamp: new Date(),
              role: message.role === 'assistant' ? 'assistant' : 'user',
              content: message.transcript
            }]);
          }
          
          if (message.type === 'status-update') {
            if (message.status === 'ringing') {
              setCallStatus('ringing');
            }
          }

          if (message.type === 'tool-calls' && message.toolCallList) {
            const toolCall = message.toolCallList[0];
            setTranscriptLog(prev => [...prev, {
              timestamp: new Date(),
              role: 'assistant' as const,
              content: `Using tool: ${toolCall.name} with parameters: ${JSON.stringify(toolCall.arguments)}`
            }]);
          }
        });

        vapi.on('error', (error: any) => {
          console.error('Vapi Web SDK Error:', error);
          setCallStatus('error');
          setTranscriptLog(prev => [...prev, {
            timestamp: new Date(),
            role: 'assistant' as const,
            content: `Error: ${error.message || 'Unknown Vapi error'}`
          }]);
          toast.error(`Call error: ${error.message || 'Unknown error'}`);
        });

      } catch (error) {
        console.error('Failed to initialize Vapi:', error);
        toast.error('Failed to initialize call system');
      }
    };

    initVapi();

    return () => {
      if (currentVapiInstance) {
        currentVapiInstance.removeAllListeners();
      }
    };
  }, [vapiPublicKey]);

  // Update call duration
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (callStatus === 'active' && callStartTime) {
      interval = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - callStartTime.getTime()) / 1000));
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callStatus, callStartTime]);

  const handleStartCall = async () => {
    if (!vapiInstance || !assistantId) {
      toast.error("Assistant not configured or call system not ready");
      return;
    }

    if (callStatus === 'active' || callStatus === 'connecting' || callStatus === 'ringing') {
      toast.warning("Call already in progress");
      return;
    }

    try {
      setCallStatus('connecting');
      setTranscriptLog([{
        timestamp: new Date(),
        role: 'assistant' as const,
        content: 'Attempting to start call...'
      }]);
      
      await vapiInstance.start(assistantId);
    } catch (error: any) {
      console.error('Failed to start call:', error);
      setCallStatus('error');
      toast.error(`Failed to start call: ${error.message || 'Unknown error'}`);
    }
  };

  const handleEndCall = () => {
    if (vapiInstance && (callStatus === 'active' || callStatus === 'connecting' || callStatus === 'ringing')) {
      vapiInstance.stop();
    }
  };

  const handleToggleMute = () => {
    if (vapiInstance && callStatus === 'active') {
      if (isMuted) {
        vapiInstance.setMuted(false);
        setIsMuted(false);
        toast.info("Microphone unmuted");
      } else {
        vapiInstance.setMuted(true);
        setIsMuted(true);
        toast.info("Microphone muted");
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: CallStatus) => {
    switch (status) {
      case 'idle': return 'secondary';
      case 'connecting': return 'default';
      case 'ringing': return 'default';
      case 'active': return 'default';
      case 'ended': return 'secondary';
      case 'error': return 'destructive';
      default: return 'secondary';
    }
  };

  const getStatusText = (status: CallStatus) => {
    switch (status) {
      case 'idle': return 'Ready';
      case 'connecting': return 'Connecting...';
      case 'ringing': return 'Ringing...';
      case 'active': return `Active (${formatDuration(callDuration)})`;
      case 'ended': return 'Call Ended';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
  };

  const canStartCall = assistantId && callStatus === 'idle' || callStatus === 'ended' || callStatus === 'error';
  const canEndCall = callStatus === 'active' || callStatus === 'connecting' || callStatus === 'ringing';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Test Your AI Assistant
          <Badge variant={getStatusColor(callStatus)}>
            {getStatusText(callStatus)}
          </Badge>
        </CardTitle>
        <CardDescription>
          Make a test call to your configured Laine AI assistant to verify voice, prompts, and functionality.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!assistantId ? (
          <div className="text-center text-muted-foreground">
            <p>Please save your AI configuration first to enable test calls.</p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={handleStartCall}
              disabled={!canStartCall}
              className="flex-1"
              variant={canStartCall ? "default" : "secondary"}
            >
              <Phone className="w-4 h-4 mr-2" />
              {callStatus === 'connecting' ? 'Connecting...' : 'Start Test Call'}
            </Button>
            
            {canEndCall && (
              <>
                <Button
                  onClick={handleEndCall}
                  variant="destructive"
                  className="flex-1"
                >
                  <PhoneOff className="w-4 h-4 mr-2" />
                  End Call
                </Button>
                
                <Button
                  onClick={handleToggleMute}
                  variant="outline"
                  size="icon"
                  className="sm:w-auto"
                >
                  {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </Button>
              </>
            )}
          </div>
        )}

        {transcriptLog.length > 0 && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full">
                View Call Transcript ({transcriptLog.length} entries)
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>Call Transcript</DialogTitle>
                <DialogDescription>
                  Real-time transcript of your test call with Laine
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="h-96 w-full p-4 border rounded">
                <div className="space-y-3">
                  {transcriptLog.map((entry, index) => (
                    <div key={index} className="flex flex-col space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge variant={entry.role === 'assistant' ? 'default' : 'secondary'}>
                          {entry.role === 'assistant' ? 'Laine' : 'You'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {entry.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm bg-muted p-2 rounded">
                        {entry.content}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        )}

        <div className="text-xs text-muted-foreground">
          <p>Tips for testing:</p>
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li>Try saying "I&apos;d like to book an appointment"</li>
            <li>Ask about available appointment times</li>
            <li>Test the voice and response quality</li>
            <li>Check if the personalized first message plays correctly</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
} 