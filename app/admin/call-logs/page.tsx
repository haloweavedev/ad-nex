"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Eye, Phone, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Info } from "lucide-react";

interface CallLog {
  id: string;
  vapi_call_id: string;
  call_timestamp_start: string;
  call_timestamp_end: string | null;
  patient_phone_number: string | null;
  call_status: string | null;
  detected_intent: string | null;
  nexhealth_patient_id: string | null;
  nexhealth_appointment_id: string | null;
  summary: string | null;
  created_at: string;
  source?: 'database' | 'vapi' | 'merged';
  transcript_text?: string | null;
  vapi_transcript_url?: string | null;
}

interface CallLogDetail extends CallLog {
  transcript_text: string | null;
  vapi_transcript_url: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface CallLogsResponse {
  callLogs: CallLog[];
  pagination: Pagination;
  meta?: {
    source: 'database' | 'vapi' | 'none';
    vapiError?: string | null;
    assistantId?: string;
    hasVapiKey?: boolean;
  };
}

export default function CallLogsPage() {
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<CallLogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [meta, setMeta] = useState<CallLogsResponse['meta'] | null>(null);

  const fetchCallLogs = async (page: number = 1, showToast: boolean = false) => {
    try {
      setLoading(true);
      if (showToast) {
        toast.info("Refreshing call logs from Vapi API...");
      }
      
      const response = await fetch(`/api/call-logs?page=${page}&limit=20`);
      
      if (response.ok) {
        const data: CallLogsResponse = await response.json();
        setCallLogs(data.callLogs);
        setPagination(data.pagination);
        setMeta(data.meta || null);
        
        if (showToast) {
          if (data.meta?.source === 'vapi') {
            toast.success(`Loaded ${data.callLogs.length} calls from Vapi API`);
          } else if (data.meta?.source === 'database') {
            toast.info(`Loaded ${data.callLogs.length} calls from local database`);
          }
          
          if (data.meta?.vapiError) {
            toast.warning(`Vapi API issue: ${data.meta.vapiError}`);
          }
        }
      } else {
        throw new Error("Failed to fetch call logs");
      }
    } catch (error) {
      console.error("Error fetching call logs:", error);
      toast.error("Failed to load call logs");
    } finally {
      setLoading(false);
    }
  };

  const fetchLogDetails = async (logId: string) => {
    try {
      setDetailLoading(true);
      const response = await fetch(`/api/call-logs/${logId}`);
      
      if (response.ok) {
        const data = await response.json();
        setSelectedLog(data.callLog);
        setDialogOpen(true);
      } else {
        throw new Error("Failed to fetch call log details");
      }
    } catch (error) {
      console.error("Error fetching call log details:", error);
      toast.error("Failed to load call details");
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchCallLogs();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return "N/A";
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const durationMs = endTime - startTime;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const getStatusColor = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case "ended":
      case "completed_success":
        return "default";
      case "failed":
      case "error":
        return "destructive";
      case "in_progress":
      case "active":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getStatusText = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case "ended":
        return "Completed";
      case "completed_success":
        return "Success";
      case "failed":
        return "Failed";
      case "error":
        return "Error";
      case "in_progress":
        return "In Progress";
      case "active":
        return "Active";
      default:
        return status || "Unknown";
    }
  };

  const getSourceBadge = (source?: string) => {
    switch (source) {
      case 'vapi':
        return <Badge variant="default" className="text-xs">Vapi API</Badge>;
      case 'database':
        return <Badge variant="secondary" className="text-xs">Database</Badge>;
      case 'merged':
        return <Badge variant="outline" className="text-xs">Merged</Badge>;
      default:
        return null;
    }
  };

  if (loading && callLogs.length === 0) {
    return (
      <div className="max-w-6xl mx-auto">
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p>Loading call logs...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Call Logs
              </CardTitle>
              <CardDescription>
                View and manage call logs from your AI receptionist
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchCallLogs(1, true)}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Refresh from Vapi
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Debug Information */}
          {meta && (
            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="w-4 h-4" />
                <span>Data source: <strong>{meta.source}</strong></span>
                {meta.assistantId && (
                  <span>• Assistant: <code className="text-xs">{meta.assistantId.substring(0, 8)}...</code></span>
                )}
                {meta.hasVapiKey ? (
                  <span>• Vapi API: <span className="text-green-600">Connected</span></span>
                ) : (
                  <span>• Vapi API: <span className="text-red-600">Not configured</span></span>
                )}
              </div>
              {meta.vapiError && (
                <div className="mt-1 text-sm text-amber-600">
                  ⚠️ Vapi API Error: {meta.vapiError}
                </div>
              )}
            </div>
          )}

          {callLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No call logs yet</p>
              <p className="text-sm">Call logs will appear here once patients start calling your AI assistant</p>
              {meta?.hasVapiKey === false && (
                <p className="text-sm text-amber-600 mt-2">
                  ⚠️ Vapi API key not configured - only local database logs will be shown
                </p>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Phone Number</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {callLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">
                        {formatDate(log.call_timestamp_start)}
                      </TableCell>
                      <TableCell>
                        {log.patient_phone_number || "Unknown"}
                      </TableCell>
                      <TableCell>
                        {formatDuration(log.call_timestamp_start, log.call_timestamp_end)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(log.call_status)}>
                          {getStatusText(log.call_status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {getSourceBadge(log.source)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fetchLogDetails(log.id)}
                          disabled={detailLoading}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <p className="text-sm text-muted-foreground">
                    Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                    {Math.min(pagination.page * pagination.limit, pagination.totalCount)} of{" "}
                    {pagination.totalCount} results
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchCallLogs(pagination.page - 1)}
                      disabled={!pagination.hasPrev || loading}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Previous
                    </Button>
                    <span className="text-sm">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchCallLogs(pagination.page + 1)}
                      disabled={!pagination.hasNext || loading}
                    >
                      Next
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Call Detail Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Call Details</DialogTitle>
            <DialogDescription>
              {selectedLog && formatDate(selectedLog.call_timestamp_start)}
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-6">
              {/* Call Summary */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Call Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Phone:</span>
                      <span>{selectedLog.patient_phone_number || "Unknown"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Duration:</span>
                      <span>{formatDuration(selectedLog.call_timestamp_start, selectedLog.call_timestamp_end)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge variant={getStatusColor(selectedLog.call_status)}>
                        {getStatusText(selectedLog.call_status)}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Intent:</span>
                      <span>{selectedLog.detected_intent || "Not detected"}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Integration Data</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Patient ID:</span>
                      <span>{selectedLog.nexhealth_patient_id || "None"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Appointment ID:</span>
                      <span>{selectedLog.nexhealth_appointment_id || "None"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Vapi Call ID:</span>
                      <span className="font-mono text-xs">{selectedLog.vapi_call_id}</span>
                    </div>
                    {selectedLog.vapi_transcript_url && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Recording:</span>
                        <Button variant="link" size="sm" asChild className="h-auto p-0">
                          <a href={selectedLog.vapi_transcript_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3 h-3 mr-1" />
                            View
                          </a>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Summary */}
              {selectedLog.summary && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{selectedLog.summary}</p>
                  </CardContent>
                </Card>
              )}

              {/* Transcript */}
              {selectedLog.transcript_text && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Transcript</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64 w-full p-4 border rounded">
                      <pre className="text-sm whitespace-pre-wrap">
                        {selectedLog.transcript_text}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {!selectedLog.transcript_text && !selectedLog.summary && (
                <Card>
                  <CardContent className="text-center py-6 text-muted-foreground">
                    <p>No transcript or summary available for this call</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
} 