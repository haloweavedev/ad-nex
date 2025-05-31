import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getPatientById } from "@/lib/nexhealth.server";

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const practice = await prisma.practice.findUnique({
      where: { clerk_user_id: userId },
      select: { 
        id: true, 
        nexhealth_subdomain: true,
        nexhealth_location_id: true
      },
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    if (!practice.nexhealth_subdomain) {
      return NextResponse.json({ 
        patients: [],
        message: "NexHealth integration not configured"
      });
    }

    // Get unique patients who have interacted with LAINE
    const uniquePatients = await prisma.callLog.findMany({
      where: {
        practice_id: practice.id,
        nexhealth_patient_id: {
          not: null
        }
      },
      select: {
        nexhealth_patient_id: true,
        patient_phone_number: true,
        call_timestamp_start: true,
        call_status: true,
        detected_intent: true,
        booked_appointment_nexhealth_id: true,
        ehr_appointment_foreign_id: true
      },
      orderBy: {
        call_timestamp_start: 'desc'
      }
    });

    // Group by patient ID to get unique patients with their latest interaction
    const patientMap = new Map();
    const patientInteractionCounts = new Map();

    uniquePatients.forEach((call) => {
      const patientId = call.nexhealth_patient_id!;
      
      // Count interactions
      patientInteractionCounts.set(
        patientId, 
        (patientInteractionCounts.get(patientId) || 0) + 1
      );

      // Store latest interaction if not already stored
      if (!patientMap.has(patientId)) {
        patientMap.set(patientId, {
          nexhealth_patient_id: patientId,
          phone_number: call.patient_phone_number,
          last_interaction: call.call_timestamp_start,
          last_status: call.call_status,
          last_intent: call.detected_intent,
          has_booked_appointment: !!call.booked_appointment_nexhealth_id,
          has_ehr_sync: !!call.ehr_appointment_foreign_id,
          interaction_count: 0 // Will be updated below
        });
      }
    });

    // Update interaction counts
    patientMap.forEach((patient, patientId) => {
      patient.interaction_count = patientInteractionCounts.get(patientId) || 0;
    });

    const patientsData = Array.from(patientMap.values());

    // Enrich with NexHealth patient data (limit to avoid API overload)
    const enrichedPatients = [];
    const maxEnrichment = 50; // Limit API calls

    for (let i = 0; i < Math.min(patientsData.length, maxEnrichment); i++) {
      const patient = patientsData[i];
      
      try {
        const nexhealthPatient = await getPatientById(
          practice.nexhealth_subdomain,
          patient.nexhealth_patient_id,
          practice.nexhealth_location_id || undefined
        );

        enrichedPatients.push({
          ...patient,
          first_name: nexhealthPatient.first_name,
          last_name: nexhealthPatient.last_name,
          email: nexhealthPatient.bio?.email || null,
          date_of_birth: nexhealthPatient.bio?.date_of_birth || null,
          nexhealth_data_available: true
        });
      } catch (error) {
        console.error(`Failed to fetch NexHealth data for patient ${patient.nexhealth_patient_id}:`, error);
        
        // Include patient without NexHealth enrichment
        enrichedPatients.push({
          ...patient,
          first_name: null,
          last_name: null,
          email: null,
          date_of_birth: null,
          nexhealth_data_available: false
        });
      }
    }

    // Add remaining patients without enrichment if we hit the limit
    if (patientsData.length > maxEnrichment) {
      const remainingPatients = patientsData.slice(maxEnrichment).map(patient => ({
        ...patient,
        first_name: null,
        last_name: null,
        email: null,
        date_of_birth: null,
        nexhealth_data_available: false
      }));
      
      enrichedPatients.push(...remainingPatients);
    }

    // Calculate summary statistics
    const summary = {
      total_patients: enrichedPatients.length,
      total_interactions: uniquePatients.length,
      patients_with_bookings: enrichedPatients.filter(p => p.has_booked_appointment).length,
      patients_with_ehr_sync: enrichedPatients.filter(p => p.has_ehr_sync).length,
      recent_interactions_7d: uniquePatients.filter(call => 
        new Date(call.call_timestamp_start) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ).length
    };

    return NextResponse.json({
      patients: enrichedPatients,
      summary,
      enrichment_limit_reached: patientsData.length > maxEnrichment
    });

  } catch (error) {
    console.error("Error fetching LAINE patients:", error);
    return NextResponse.json(
      { error: "Failed to fetch patients" },
      { status: 500 }
    );
  }
} 