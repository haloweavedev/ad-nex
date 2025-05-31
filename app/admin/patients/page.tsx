"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Search, Filter, Users, Phone, Calendar, CheckCircle, AlertCircle } from "lucide-react";

interface PatientSummary {
  total_patients: number;
  total_interactions: number;
  patients_with_bookings: number;
  patients_with_ehr_sync: number;
  recent_interactions_7d: number;
}

interface LainePatient {
  nexhealth_patient_id: string;
  phone_number: string | null;
  last_interaction: string;
  last_status: string | null;
  last_intent: string | null;
  has_booked_appointment: boolean;
  has_ehr_sync: boolean;
  interaction_count: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  date_of_birth: string | null;
  nexhealth_data_available: boolean;
}

export default function PatientsArchivePage() {
  const [patients, setPatients] = useState<LainePatient[]>([]);
  const [summary, setSummary] = useState<PatientSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [enrichmentLimitReached, setEnrichmentLimitReached] = useState(false);

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/laine-patients");
      
      if (response.ok) {
        const data = await response.json();
        setPatients(data.patients || []);
        setSummary(data.summary);
        setEnrichmentLimitReached(data.enrichment_limit_reached || false);
      } else {
        const errorData = await response.json();
        if (errorData.message) {
          toast.info(errorData.message);
        } else {
          throw new Error(errorData.error || "Failed to fetch patients");
        }
      }
    } catch (error) {
      console.error("Error fetching patients:", error);
      toast.error("Failed to load patient data");
    } finally {
      setLoading(false);
    }
  };

  // Filter patients based on search and status
  const filteredPatients = patients.filter(patient => {
    const matchesSearch = searchTerm === "" || 
      (patient.first_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (patient.last_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (patient.email?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (patient.phone_number?.includes(searchTerm)) ||
      (patient.nexhealth_patient_id.includes(searchTerm));

    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "booked" && patient.has_booked_appointment) ||
      (statusFilter === "ehr_sync" && patient.has_ehr_sync) ||
      (statusFilter === "no_booking" && !patient.has_booked_appointment);

    return matchesSearch && matchesStatus;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (patient: LainePatient) => {
    if (patient.has_ehr_sync) {
      return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />EHR Synced</Badge>;
    } else if (patient.has_booked_appointment) {
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800"><Calendar className="w-3 h-3 mr-1" />Booked</Badge>;
    } else {
      return <Badge variant="outline" className="bg-orange-100 text-orange-800"><AlertCircle className="w-3 h-3 mr-1" />Inquiry Only</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">LAINE Patients Archive</h1>
        </div>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading patient data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">LAINE Patients Archive</h1>
          <p className="text-muted-foreground">
            Patients who have interacted with your AI dental assistant
          </p>
        </div>
        <Button onClick={fetchPatients} disabled={loading}>
          Refresh Data
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total_patients}</div>
              <p className="text-xs text-muted-foreground">
                Unique patients
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Interactions</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total_interactions}</div>
              <p className="text-xs text-muted-foreground">
                LAINE calls
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Appointments Booked</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.patients_with_bookings}</div>
              <p className="text-xs text-muted-foreground">
                Successful bookings
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">EHR Synced</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.patients_with_ehr_sync}</div>
              <p className="text-xs text-muted-foreground">
                Synced to EHR
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent (7d)</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.recent_interactions_7d}</div>
              <p className="text-xs text-muted-foreground">
                Recent interactions
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Patient Search & Filters</CardTitle>
          <CardDescription>
            Search by name, email, phone, or patient ID
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Patients</SelectItem>
                  <SelectItem value="booked">With Bookings</SelectItem>
                  <SelectItem value="ehr_sync">EHR Synced</SelectItem>
                  <SelectItem value="no_booking">Inquiries Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {enrichmentLimitReached && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                ⚠️ Patient data enrichment limit reached. Some patient details may not be available. 
                Contact support to increase limits if needed.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Patients Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Patients ({filteredPatients.length})
          </CardTitle>
          <CardDescription>
            All patients who have interacted with LAINE
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredPatients.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {patients.length === 0 
                  ? "No patients have interacted with LAINE yet" 
                  : "No patients match your search criteria"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Interactions</TableHead>
                    <TableHead>Last Contact</TableHead>
                    <TableHead>Patient ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPatients.map((patient) => (
                    <TableRow key={patient.nexhealth_patient_id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {patient.nexhealth_data_available 
                              ? `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || "Name not available"
                              : "Loading..."}
                          </div>
                          {patient.date_of_birth && (
                            <div className="text-sm text-muted-foreground">
                              DOB: {patient.date_of_birth}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="space-y-1">
                          {patient.phone_number && (
                            <div className="text-sm">{patient.phone_number}</div>
                          )}
                          {patient.email && (
                            <div className="text-sm text-muted-foreground">{patient.email}</div>
                          )}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        {getStatusBadge(patient)}
                      </TableCell>
                      
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{patient.interaction_count} calls</div>
                          {patient.last_intent && (
                            <div className="text-xs text-muted-foreground">
                              {patient.last_intent.replace(/_/g, ' ')}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm">
                            {formatDate(patient.last_interaction)}
                          </div>
                          {patient.last_status && (
                            <Badge variant="outline" className="text-xs">
                              {patient.last_status}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="font-mono text-sm text-muted-foreground">
                          {patient.nexhealth_patient_id}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 