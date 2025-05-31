"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface LaineAppointment {
  id: string;
  vapi_call_id: string;
  call_timestamp_start: string;
  patient_phone_number?: string;
  booked_appointment_nexhealth_id?: string;
  booked_appointment_patient_id?: string;
  booked_appointment_provider_id?: string;
  booked_appointment_operatory_id?: string;
  booked_appointment_type_id?: string;
  booked_appointment_start_time?: string;
  booked_appointment_end_time?: string;
  booked_appointment_note?: string;
  call_status?: string;
  detected_intent?: string;
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<LaineAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        const response = await fetch("/api/laine-appointments");
        if (response.ok) {
          const data = await response.json();
          setAppointments(data.appointments || []);
        } else {
          throw new Error("Failed to fetch appointments");
        }
      } catch (error) {
        console.error("Error fetching appointments:", error);
        toast.error("Failed to load appointments");
      } finally {
        setLoading(false);
      }
    };

    fetchAppointments();
  }, []);

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusBadgeVariant = (status?: string) => {
    switch (status) {
      case "COMPLETED_BOOKING":
        return "default";
      case "IN_PROGRESS":
        return "secondary";
      case "ENDED":
        return "outline";
      default:
        return "secondary";
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>LAINE Appointments</CardTitle>
            <CardDescription>Loading appointments...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>LAINE Appointments</CardTitle>
          <CardDescription>
            Appointments booked through LAINE AI assistant
          </CardDescription>
        </CardHeader>
        <CardContent>
          {appointments.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No appointments booked through LAINE yet.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Appointments will appear here when patients book through your AI assistant.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Call Date</TableHead>
                  <TableHead>Patient Phone</TableHead>
                  <TableHead>Appointment Date & Time</TableHead>
                  <TableHead>NexHealth Appointment ID</TableHead>
                  <TableHead>Patient ID</TableHead>
                  <TableHead>Provider ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((appointment) => (
                  <TableRow key={appointment.id}>
                    <TableCell>
                      {formatDateTime(appointment.call_timestamp_start)}
                    </TableCell>
                    <TableCell>
                      {appointment.patient_phone_number || "N/A"}
                    </TableCell>
                    <TableCell>
                      {formatDateTime(appointment.booked_appointment_start_time)}
                    </TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-1 rounded">
                        {appointment.booked_appointment_nexhealth_id || "N/A"}
                      </code>
                    </TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-1 rounded">
                        {appointment.booked_appointment_patient_id || "N/A"}
                      </code>
                    </TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-1 rounded">
                        {appointment.booked_appointment_provider_id || "N/A"}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(appointment.call_status)}>
                        {appointment.call_status || "Unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {appointment.booked_appointment_note || "No note"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 