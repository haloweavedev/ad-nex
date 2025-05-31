"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

interface PracticeData {
  name: string;
  nexhealth_subdomain: string;
  nexhealth_location_id: string;
  nexhealth_selected_provider_ids: string[];
  nexhealth_default_operatory_ids: string[];
  timezone: string;
}

interface Provider {
  id: string;
  name: string;
  email?: string;
}

interface Operatory {
  id: string;
  name: string;
}

interface AppointmentType {
  id: string;
  name: string;
  duration?: number;
}

interface ServiceMapping {
  id: string;
  spoken_service_name: string;
  nexhealth_appointment_type_id: string;
  default_duration_minutes?: number;
}

interface LocationDetails {
  map_by_operatory: boolean;
}

export default function SetupPage() {
  const [formData, setFormData] = useState<PracticeData>({
    name: "",
    nexhealth_subdomain: "",
    nexhealth_location_id: "",
    nexhealth_selected_provider_ids: [],
    nexhealth_default_operatory_ids: [],
    timezone: "America/New_York",
  });
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  
  // NexHealth data
  const [providers, setProviders] = useState<Provider[]>([]);
  const [operatories, setOperatories] = useState<Operatory[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [locationDetails, setLocationDetails] = useState<LocationDetails | null>(null);
  const [serviceMappings, setServiceMappings] = useState<ServiceMapping[]>([]);
  
  // Loading states
  const [providersLoading, setProvidersLoading] = useState(false);
  const [operatoriesLoading, setOperatoriesLoading] = useState(false);
  const [appointmentTypesLoading, setAppointmentTypesLoading] = useState(false);
  const [locationDetailsLoading, setLocationDetailsLoading] = useState(false);
  
  // Service mapping form
  const [newServiceName, setNewServiceName] = useState("");
  const [selectedAppointmentTypeId, setSelectedAppointmentTypeId] = useState("");
  const [serviceMappingLoading, setServiceMappingLoading] = useState(false);

  // Fetch existing practice data on load
  useEffect(() => {
    const fetchPracticeData = async () => {
      try {
        const response = await fetch("/api/practice/setup");
        if (response.ok) {
          const data = await response.json();
          if (data.practice) {
            setFormData({
              name: data.practice.name || "",
              nexhealth_subdomain: data.practice.nexhealth_subdomain || "",
              nexhealth_location_id: data.practice.nexhealth_location_id || "",
              nexhealth_selected_provider_ids: data.practice.nexhealth_selected_provider_ids || [],
              nexhealth_default_operatory_ids: data.practice.nexhealth_default_operatory_ids || [],
              timezone: data.practice.timezone || "America/New_York",
            });
          }
        }
      } catch (error) {
        console.error("Error fetching practice data:", error);
        toast.error("Failed to load practice data");
      } finally {
        setInitialLoading(false);
      }
    };

    fetchPracticeData();
  }, []);

  // Fetch service mappings when component loads
  useEffect(() => {
    const fetchServiceMappings = async () => {
      try {
        const response = await fetch("/api/practice/service-mappings");
        if (response.ok) {
          const data = await response.json();
          setServiceMappings(data.serviceMappings || []);
        }
      } catch (error) {
        console.error("Error fetching service mappings:", error);
      }
    };

    fetchServiceMappings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/practice/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast.success("Practice settings saved successfully");
      } else {
        throw new Error("Failed to save practice settings");
      }
    } catch (error) {
      console.error("Error saving practice:", error);
      toast.error("Failed to save practice settings");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof PracticeData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const fetchProviders = async () => {
    setProvidersLoading(true);
    try {
      const response = await fetch("/api/nexhealth/providers");
      if (response.ok) {
        const data = await response.json();
        setProviders(data.providers || []);
        toast.success("Providers fetched successfully");
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch providers");
      }
    } catch (error) {
      console.error("Error fetching providers:", error);
      toast.error(error instanceof Error ? error.message : "Failed to fetch providers");
    } finally {
      setProvidersLoading(false);
    }
  };

  const fetchLocationDetails = async () => {
    setLocationDetailsLoading(true);
    try {
      const response = await fetch("/api/nexhealth/location-details");
      if (response.ok) {
        const data = await response.json();
        setLocationDetails(data.locationDetails || null);
        toast.success("Location details fetched successfully");
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch location details");
      }
    } catch (error) {
      console.error("Error fetching location details:", error);
      toast.error(error instanceof Error ? error.message : "Failed to fetch location details");
    } finally {
      setLocationDetailsLoading(false);
    }
  };

  const fetchOperatories = async () => {
    setOperatoriesLoading(true);
    try {
      const response = await fetch("/api/nexhealth/operatories");
      if (response.ok) {
        const data = await response.json();
        setOperatories(data.operatories || []);
        toast.success("Operatories fetched successfully");
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch operatories");
      }
    } catch (error) {
      console.error("Error fetching operatories:", error);
      toast.error(error instanceof Error ? error.message : "Failed to fetch operatories");
    } finally {
      setOperatoriesLoading(false);
    }
  };

  const fetchAppointmentTypes = async () => {
    setAppointmentTypesLoading(true);
    try {
      const response = await fetch("/api/nexhealth/appointment-types");
      if (response.ok) {
        const data = await response.json();
        setAppointmentTypes(data.appointmentTypes || []);
        toast.success("Appointment types fetched successfully");
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch appointment types");
      }
    } catch (error) {
      console.error("Error fetching appointment types:", error);
      toast.error(error instanceof Error ? error.message : "Failed to fetch appointment types");
    } finally {
      setAppointmentTypesLoading(false);
    }
  };

  const toggleProvider = (providerId: string) => {
    setFormData(prev => ({
      ...prev,
      nexhealth_selected_provider_ids: prev.nexhealth_selected_provider_ids.includes(providerId)
        ? prev.nexhealth_selected_provider_ids.filter(id => id !== providerId)
        : [...prev.nexhealth_selected_provider_ids, providerId]
    }));
  };

  const toggleOperatory = (operatoryId: string) => {
    setFormData(prev => ({
      ...prev,
      nexhealth_default_operatory_ids: prev.nexhealth_default_operatory_ids.includes(operatoryId)
        ? prev.nexhealth_default_operatory_ids.filter(id => id !== operatoryId)
        : [...prev.nexhealth_default_operatory_ids, operatoryId]
    }));
  };

  const addServiceMapping = async () => {
    if (!newServiceName || !selectedAppointmentTypeId) {
      toast.error("Please fill in all fields");
      return;
    }

    setServiceMappingLoading(true);
    try {
      const response = await fetch("/api/practice/service-mappings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          spoken_service_name: newServiceName,
          nexhealth_appointment_type_id: selectedAppointmentTypeId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setServiceMappings(prev => [...prev, data.serviceMapping]);
        setNewServiceName("");
        setSelectedAppointmentTypeId("");
        toast.success("Service mapping added successfully");
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to add service mapping");
      }
    } catch (error) {
      console.error("Error adding service mapping:", error);
      toast.error(error instanceof Error ? error.message : "Failed to add service mapping");
    } finally {
      setServiceMappingLoading(false);
    }
  };

  const deleteServiceMapping = async (mappingId: string) => {
    try {
      const response = await fetch(`/api/practice/service-mappings?id=${mappingId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setServiceMappings(prev => prev.filter(mapping => mapping.id !== mappingId));
        toast.success("Service mapping deleted successfully");
      } else {
        throw new Error("Failed to delete service mapping");
      }
    } catch (error) {
      console.error("Error deleting service mapping:", error);
      toast.error("Failed to delete service mapping");
    }
  };

  if (initialLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Basic Practice Setup */}
      <Card>
        <CardHeader>
          <CardTitle>Practice Setup</CardTitle>
          <CardDescription>
            Configure your dental practice settings for LAINE integration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Practice Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder="e.g., Sunshine Dental"
                required
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">NexHealth Integration</h3>
              
              <div className="space-y-2">
                <Label htmlFor="nexhealth_subdomain">NexHealth Subdomain</Label>
                <Input
                  id="nexhealth_subdomain"
                  value={formData.nexhealth_subdomain}
                  onChange={(e) => handleInputChange("nexhealth_subdomain", e.target.value)}
                  placeholder="yourpractice"
                />
                <p className="text-sm text-muted-foreground">
                  From your NexHealth URL: https://yourpractice.nexhealth.com
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nexhealth_location_id">Primary Location ID</Label>
                <Input
                  id="nexhealth_location_id"
                  value={formData.nexhealth_location_id}
                  onChange={(e) => handleInputChange("nexhealth_location_id", e.target.value)}
                  placeholder="location-id-from-nexhealth"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={formData.timezone}
                onValueChange={(value) => handleInputChange("timezone", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">Eastern Time</SelectItem>
                  <SelectItem value="America/Chicago">Central Time</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                  <SelectItem value="America/Phoenix">Arizona Time</SelectItem>
                  <SelectItem value="America/Anchorage">Alaska Time</SelectItem>
                  <SelectItem value="Pacific/Honolulu">Hawaii Time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Saving..." : "Save Practice Settings"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Provider Selection */}
      {formData.nexhealth_subdomain && formData.nexhealth_location_id && (
        <Card>
          <CardHeader>
            <CardTitle>Provider Selection</CardTitle>
            <CardDescription>
              Select which providers LAINE can book appointments with
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={fetchProviders} disabled={providersLoading}>
              {providersLoading ? "Fetching..." : "Fetch Providers"}
            </Button>
            
            {providers.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Available Providers:</h4>
                <div className="grid grid-cols-1 gap-2">
                  {providers.map((provider) => (
                    <div key={provider.id} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`provider-${provider.id}`}
                        checked={formData.nexhealth_selected_provider_ids.includes(provider.id)}
                        onChange={() => toggleProvider(provider.id)}
                      />
                      <label htmlFor={`provider-${provider.id}`} className="flex-1">
                        {provider.name} {provider.email && `(${provider.email})`}
                      </label>
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <p className="text-sm text-muted-foreground">Selected providers:</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {formData.nexhealth_selected_provider_ids.map((id) => {
                      const provider = providers.find(p => p.id === id);
                      return provider ? (
                        <Badge key={id} variant="secondary">{provider.name}</Badge>
                      ) : null;
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Location Details and Operatory Selection */}
      {formData.nexhealth_subdomain && formData.nexhealth_location_id && (
        <Card>
          <CardHeader>
            <CardTitle>Location Configuration</CardTitle>
            <CardDescription>
              Check if your location requires operatory selection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={fetchLocationDetails} disabled={locationDetailsLoading}>
              {locationDetailsLoading ? "Checking..." : "Check Location Details"}
            </Button>
            
            {locationDetails && (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p><strong>Maps by Operatory:</strong> {locationDetails.map_by_operatory ? "Yes" : "No"}</p>
                </div>
                
                {locationDetails.map_by_operatory && (
                  <div className="space-y-4">
                    <Button onClick={fetchOperatories} disabled={operatoriesLoading}>
                      {operatoriesLoading ? "Fetching..." : "Fetch Operatories"}
                    </Button>
                    
                    {operatories.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium">Available Operatories:</h4>
                        <div className="grid grid-cols-1 gap-2">
                          {operatories.map((operatory) => (
                            <div key={operatory.id} className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id={`operatory-${operatory.id}`}
                                checked={formData.nexhealth_default_operatory_ids.includes(operatory.id)}
                                onChange={() => toggleOperatory(operatory.id)}
                              />
                              <label htmlFor={`operatory-${operatory.id}`} className="flex-1">
                                {operatory.name}
                              </label>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2">
                          <p className="text-sm text-muted-foreground">Selected operatories:</p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {formData.nexhealth_default_operatory_ids.map((id) => {
                              const operatory = operatories.find(o => o.id === id);
                              return operatory ? (
                                <Badge key={id} variant="secondary">{operatory.name}</Badge>
                              ) : null;
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Service Mapping */}
      {formData.nexhealth_subdomain && formData.nexhealth_location_id && (
        <Card>
          <CardHeader>
            <CardTitle>Service Mapping</CardTitle>
            <CardDescription>
              Map spoken service names to NexHealth appointment types
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={fetchAppointmentTypes} disabled={appointmentTypesLoading}>
              {appointmentTypesLoading ? "Fetching..." : "Fetch NexHealth Appointment Types"}
            </Button>
            
            {appointmentTypes.length > 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    placeholder="Spoken service name (e.g., 'cleaning')"
                    value={newServiceName}
                    onChange={(e) => setNewServiceName(e.target.value)}
                  />
                  <Select value={selectedAppointmentTypeId} onValueChange={setSelectedAppointmentTypeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select appointment type" />
                    </SelectTrigger>
                    <SelectContent>
                      {appointmentTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name} {type.duration && `(${type.duration}min)`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={addServiceMapping} disabled={serviceMappingLoading}>
                    {serviceMappingLoading ? "Adding..." : "Add Mapping"}
                  </Button>
                </div>
                
                {serviceMappings.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Current Service Mappings:</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Spoken Service Name</TableHead>
                          <TableHead>NexHealth Appointment Type</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {serviceMappings.map((mapping) => {
                          const appointmentType = appointmentTypes.find(t => t.id === mapping.nexhealth_appointment_type_id);
                          return (
                            <TableRow key={mapping.id}>
                              <TableCell>{mapping.spoken_service_name}</TableCell>
                              <TableCell>{appointmentType?.name || mapping.nexhealth_appointment_type_id}</TableCell>
                              <TableCell>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => deleteServiceMapping(mapping.id)}
                                >
                                  Delete
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
} 