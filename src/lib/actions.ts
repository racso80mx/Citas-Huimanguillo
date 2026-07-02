'use server';

import { revalidatePath } from 'next/cache';
import * as data from './data';
import type { 
    Patient, 
    Appointment, 
    Holiday, 
    SpecialActionDay, 
    LabStudy, 
    LabSettings,
    XRayStudy, 
    XRaySettings,
    UltrasoundStudy, 
    UltrasoundSettings,
    Vaccine, 
    VaccineSettings,
    ModuleSettings,
    AdminSettings,
    ArchiveSettings,
    PharmacySettings,
    WarehouseSettings,
    BISettings,
    Clinic,
    Colonia,
    ServiceType,
    Specialty,
    PatientStatus
} from './definitions';

// --- ACTIVIDAD Y LOGS ---
export async function logActivity(a: string, d: string) { return data.logActivity(a, d); }
export async function getLogs() { return data.getLogsData(); }
export async function getLogsData() { return data.getLogsData(); }

// --- MÓDULOS Y SEGURIDAD ---
export async function getModuleSettings() { return data.getModuleSettings(); }
export async function updateModuleSettings(settings: ModuleSettings) { 
    const res = await data.updateModuleSettings(settings);
    revalidatePath('/', 'layout');
    return res;
}

export async function verifyCitasMedicasPassword(p: string) { return data.verifyModulePassword('medical', p); }
export async function verifyArchivePassword(p: string) { return data.verifyModulePassword('archive', p); }
export async function verifyPharmacyPassword(p: string) { return data.verifyModulePassword('pharmacy', p); }
export async function verifyWarehousePassword(p: string) { return data.verifyModulePassword('warehouse', p); }
export async function verifyBIPassword(p: string) { return data.verifyModulePassword('bi', p); }
export async function verifyLabPassword(p: string) { return data.verifyModulePassword('lab', p); }
export async function verifyXRayPassword(p: string) { return data.verifyModulePassword('xray', p); }
export async function verifyUltrasoundPassword(p: string) { return data.verifyModulePassword('ultrasound', p); }
export async function verifyVaccinePassword(p: string) { return data.verifyModulePassword('vaccine', p); }
export async function verifyAdminPassword(p: string) { return data.verifyModulePassword('superadmin', p); }
export async function verifyClinicPassword(id: string, p: string) { return data.verifyClinicPassword(id, p); }

// --- PACIENTES ---
export async function getPatients(options?: any) { return data.getPatientsData(options); }
export async function getPatientCounts() { return data.getPatientCounts(); }
export async function savePatient(patient: Omit<Patient, 'id'>, id?: string) { 
    const res = await data.savePatient(patient, id || '');
    revalidatePath('/', 'layout');
    return res;
}
export async function updatePatient(id: string, patient: Partial<Patient>) { 
    const res = await data.updatePatient(id, patient);
    revalidatePath('/', 'layout');
    return res;
}
export async function updatePatientStatus(id: string, status: string) { 
    const res = await data.updatePatientStatus(id, status);
    revalidatePath('/', 'layout');
    return res;
}
export async function deletePatient(id: string) { 
    const res = await data.deletePatient(id);
    revalidatePath('/', 'layout');
    return res;
}
export async function deletePatients(ids: string[]) { 
    const res = await data.deletePatients(ids);
    revalidatePath('/', 'layout');
    return res;
}
export async function getPatientByCURP(curp: string) { return data.getPatientByCURP(curp); }
export async function bulkInsertPatients(patients: any[]) { 
    const res = await data.bulkInsertPatients(patients);
    revalidatePath('/', 'layout');
    return res;
}

// --- CITAS ---
export async function getAppointments() { return data.getAppointmentsData(); }
export async function getLabAppointments() { return data.getLabAppointmentsData(); }
export async function getXRayAppointments() { return data.getXRayAppointmentsData(); }
export async function getUltrasoundAppointments() { return data.getUltrasoundAppointmentsData(); }
export async function getVaccineAppointments() { return data.getVaccineAppointmentsData(); }

export async function updateAppointmentStatus(appointmentId: string, status: string, type: any) {
    const res = await data.updateAppointmentStatus(appointmentId, status, type);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteAppointment(id: string) { 
    const res = await data.deleteAppointment(id);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteLabAppointment(id: string) { 
    const res = await data.deleteLabAppointment(id);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteXRayAppointment(id: string) { 
    const res = await data.deleteXRayAppointment(id);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteUltrasoundAppointment(id: string) { 
    const res = await data.deleteUltrasoundAppointment(id);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteVaccineAppointment(id: string) { 
    const res = await data.deleteVaccineAppointment(id);
    revalidatePath('/', 'layout');
    return res;
}

export async function rescheduleAppointment(id: string, date: string, type: any) { 
    const res = await data.rescheduleAppointment(id, date, type);
    revalidatePath('/', 'layout');
    return res;
}
export async function cloneAppointment(id: string, date: string, type: any, time?: string) { 
    const res = await data.cloneAppointment(id, date, type, time);
    revalidatePath('/', 'layout');
    return res;
}
export async function getAppointmentsForClinic(clinicId: string) { return data.getAppointmentsForClinic(clinicId); }

export async function saveNewAppointment(appointment: any, patient: any, isDouble: boolean, colonia?: string) {
    const res = await data.saveNewAppointment(appointment, patient, isDouble, colonia);
    revalidatePath('/', 'layout');
    return res;
}
export async function saveNewLabAppointment(appointment: any, patient: any) { 
    const res = await data.saveNewLabAppointment(appointment, patient);
    revalidatePath('/', 'layout');
    return res;
}
export async function saveNewXRayAppointment(appointment: any, patient: any) { 
    const res = await data.saveNewXRayAppointment(appointment, patient);
    revalidatePath('/', 'layout');
    return res;
}
export async function saveNewUltrasoundAppointment(appointment: any, patient: any) { 
    const res = await data.saveNewUltrasoundAppointment(appointment, patient);
    revalidatePath('/', 'layout');
    return res;
}
export async function saveNewVaccineAppointment(appointment: any, patient: any) { 
    const res = await data.saveNewVaccineAppointment(appointment, patient);
    revalidatePath('/', 'layout');
    return res;
}

// --- CLÍNICAS ---
export async function getClinics() { return data.getClinicsData(); }
export async function updateClinics(clinics: Clinic[]) { 
    const res = await data.updateClinics(clinics);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteClinic(id: string) { 
    const res = await data.deleteClinic(id);
    revalidatePath('/', 'layout');
    return res;
}
export async function bulkInsertDoctors(doctors: any[]) { 
    const res = await data.bulkInsertDoctors(doctors);
    revalidatePath('/', 'layout');
    return res;
}

// --- CATÁLOGOS ---
export async function getServiceTypes() { return data.getServiceTypesData(); }
export async function updateServiceTypes(t: any[]) { 
    const res = await data.updateServiceTypes(t);
    revalidatePath('/', 'layout');
    return res;
}
export async function getSpecialties() { return data.getSpecialtiesData(); }
export async function updateSpecialties(t: any[]) { 
    const res = await data.updateSpecialties(t);
    revalidatePath('/', 'layout');
    return res;
}
export async function getColonias() { return data.getColoniasData(); }
export async function updateColonias(colonias: Colonia[]) { 
    const res = await data.updateColonias(colonias);
    revalidatePath('/', 'layout');
    return res;
}

// --- MANTENIMIENTO ---
export async function downloadBackupAction() { return data.downloadBackupAction(); }
export async function cleanupOldRecords() { 
    const res = await data.cleanupOldRecords();
    revalidatePath('/', 'layout');
    return res;
}
export async function normalizeExpedientesAction() { return data.normalizeExpedientesAction(); }
export async function applyStatusUpdateChunk(exp: string[], status: PatientStatus) { return data.applyStatusUpdateChunk(exp, status); }
export async function scanDuplicates(criteria: any) { return data.scanDuplicates(criteria); }

// --- CONFIGURACIONES ---
export async function getArchiveSettings() { return data.getArchiveSettingsData(); }
export async function getArchiveSettingsData() { return data.getArchiveSettingsData(); }
export async function getPharmacySettings() { return data.getPharmacySettingsData(); }
export async function getPharmacySettingsData() { return data.getPharmacySettingsData(); }
export async function getWarehouseSettings() { return data.getWarehouseSettingsData(); }
export async function getWarehouseSettingsData() { return data.getWarehouseSettingsData(); }
export async function getBISettings() { return data.getBISettingsData(); }
export async function getBISettingsData() { return data.getBISettingsData(); }
export async function getAdminSettings() { return data.getAdminSettingsData(); }
export async function getAdminSettingsData() { return data.getAdminSettingsData(); }

export async function updateAdminSettings(settings: AdminSettings) { return data.updateAdminSettings(settings); }
export async function updateArchiveSettings(settings: ArchiveSettings) { return data.updateArchiveSettings(settings); }
export async function updatePharmacySettings(settings: PharmacySettings) { return data.updatePharmacySettings(settings); }
export async function updateWarehouseSettings(settings: WarehouseSettings) { return data.updateWarehouseSettings(settings); }
export async function updateBISettings(settings: BISettings) { return data.updateBISettings(settings); }

// --- CONSULTAS Y RECETAS ---
export async function getConsultationsByPatientId(patientId: string) { return data.getConsultationsByPatientId(patientId); }
export async function saveMedicalConsultation(consultation: any) { 
    const res = await data.saveMedicalConsultation(consultation);
    revalidatePath('/', 'layout');
    return res;
}
export async function deleteMedicalConsultation(id: string) { 
    const res = await data.deleteMedicalConsultation(id);
    revalidatePath('/', 'layout');
    return res;
}
export async function getConsultationByAppointmentId(appId: string) { return data.getConsultationByAppointmentId(appId); }
export async function getPrescriptionsByPatientId(patientId: string) { return data.getPrescriptionsByPatientId(patientId); }
export async function createPrescription(p: any) { 
    const res = await data.createPrescription(p);
    revalidatePath('/', 'layout');
    return res;
}
export async function dispensePrescription(id: string, items: any[]) { 
    const res = await data.dispensePrescription(id, items);
    revalidatePath('/', 'layout');
    return res;
}
export async function getPendingPrescriptions(filters: any) { return data.getPendingPrescriptions(filters); }
export async function getPatientPrescriptionsCountTodayAction(patientId: string) { return data.getPatientPrescriptionsCountTodayAction(patientId); }
export async function getAppointmentCountOnDate(clinicId: string, date: string) { return data.getAppointmentCountOnDate(clinicId, date); }
export async function getAttendedPatientsForClinic(clinicId: string) { return data.getAttendedPatientsForClinic(clinicId); }
export async function updatePrescription(id: string, p: any) { 
    const res = await data.updatePrescription(id, p);
    revalidatePath('/', 'layout');
    return res;
}
export async function deletePrescription(id: string) { 
    const res = await data.deletePrescription(id);
    revalidatePath('/', 'layout');
    return res;
}
export async function getPrescriptionHistory(filters: any) { return data.getPrescriptionHistory(filters); }

// --- OTROS ---
export async function getAnnouncements() { return data.getAnnouncementsData(); }
export async function updateAnnouncements(messages: string[]) { 
    const res = await data.updateAnnouncements(messages);
    revalidatePath('/', 'layout');
    return res;
}
export async function getHolidays() { return data.getHolidaysData(); }
export async function updateHolidays(holidays: Holiday[]) { 
    const res = await data.updateHolidays(holidays);
    revalidatePath('/', 'layout');
    return res;
}
export async function getSpecialActionDays() { return data.getSpecialActionDaysData(); }
export async function updateSpecialActionDays(items: SpecialActionDay[]) { 
    const res = await data.updateSpecialActionDays(items);
    revalidatePath('/', 'layout');
    return res;
}
export async function getLabSettings() { return data.getLabSettings(); }
export async function updateLabSettings(s: LabSettings) { 
    const res = await data.updateLabSettings(s);
    revalidatePath('/', 'layout');
    return res;
}
export async function getXRaySettings() { return data.getXRaySettings(); }
export async function updateXRaySettings(s: XRaySettings) { 
    const res = await data.updateXRaySettings(s);
    revalidatePath('/', 'layout');
    return res;
}
export async function getUltrasoundSettings() { return data.getUltrasoundSettings(); }
export async function updateUltrasoundSettings(s: UltrasoundSettings) { 
    const res = await data.updateUltrasoundSettings(s);
    revalidatePath('/', 'layout');
    return res;
}
export async function getVaccineSettings() { return data.getVaccineSettings(); }
export async function updateVaccineSettings(s: VaccineSettings) { 
    const res = await data.updateVaccineSettings(s);
    revalidatePath('/', 'layout');
    return res;
}
export async function getLabStudies() { return data.getLabStudies(); }
export async function getXRayStudies() { return data.getRawCollection('xrayStudies'); }
export async function getUltrasoundStudies() { return data.getRawCollection('ultrasoundStudies'); }
export async function getVaccines() { return data.getVaccines(); }
export async function getMedications() { return data.getMedications(); }
export async function getSupplies() { return data.getSupplies(); }
export async function updateLabStudies(s: LabStudy[]) { 
    const res = await data.updateLabStudies(s);
    revalidatePath('/', 'layout');
    return res;
}
export async function updateXRayStudies(s: XRayStudy[]) { 
    const res = await data.updateXRayStudies(s);
    revalidatePath('/', 'layout');
    return res;
}
export async function updateUltrasoundStudies(s: UltrasoundStudy[]) { 
    const res = await data.updateUltrasoundStudies(s);
    revalidatePath('/', 'layout');
    return res;
}
export async function updateVaccines(v: Vaccine[]) { 
    const res = await data.updateVaccines(v);
    revalidatePath('/', 'layout');
    return res;
}
export async function bulkInsertMedications(p: any[]) { return data.bulkInsertMedications(p); }
export async function bulkInsertSupplies(p: any[]) { return data.bulkInsertSupplies(p); }
export async function deleteAllMedications() { return data.deleteAllMedications(); }
export async function deleteAllSupplies() { return data.deleteAllSupplies(); }
export async function searchCie10(t: string) { return data.searchCie10(t); }
export async function getBIData() { return data.getBIData(); }
export async function getAvailableSlotsForDate(cid: string, date: string) { return data.getAvailableSlotsForDate(cid, date); }
